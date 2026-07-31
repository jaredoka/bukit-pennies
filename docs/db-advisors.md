# Database advisors — how to run them, and what to ignore

`supabase db advisors` is Supabase's own database linter. It is free, takes
about three seconds, and needs nothing installed. **Run it after every
`supabase db push`** — that is the only moment it can find something new.

```bash
pnpm exec supabase db advisors --type security --linked
pnpm exec supabase db advisors --type performance --linked   # optional
```

## Why this project bothers

Not for the advisories it returns today — every one of them is either the app
working as designed or a recorded decision (see the baseline below). It is for
**one check**: `rls_disabled_in_public`.

Here is the scenario it exists to catch, and it is live in this repo right now.
`04_grants.sql` sets default privileges granting `SELECT/INSERT/UPDATE/DELETE`
to `authenticated` on **every future table**. So the day a migration adds a
table and forgets `enable row level security`, that table is readable and
writable by **every signed-up user** — and signup is free and open. In a
personal finance app that means one user reading every other user's spending
history.

`14_revoke_anon_dml.sql` closes with exactly this warning:

> this migration does NOT substitute for `enable row level security` plus the
> policy quartet. It restores the second layer; RLS is still the boundary.

Right now that warning is enforced by nothing but somebody remembering. This
check enforces it. Four tables have been added since the last security pass;
the rate of new tables is the rate of exposure to this bug.

Two others earn their keep for the same reason:

- **`security_definer_view`** — there are four views, all deliberately
  `security_invoker` (migrations 03, 17, 19). Each carries a comment saying
  that without the flag the view "would hand every user everyone else's" data.
  This catches it if the flag is ever dropped.
- **`rls_references_user_metadata`** — catches a policy keyed on user metadata,
  which users can edit themselves. Instant, total bypass. There is no such
  policy here; this is how it stays that way.

## Treat the output as leads, not verdicts

On 2026-07-31 the advisor reported that `handle_new_user()` "can be executed by
the `anon` role via `/rest/v1/rpc/handle_new_user`". **The grant was real; the
route was not.** PostgREST does not expose functions returning `trigger`, and
that path returns `PGRST202 — no matches were found in the schema cache`.
Meanwhile the item it ranked quieter, `base62_encode`, was the one actually
reachable by anon.

Acting on the summary alone would have meant believing anon could invoke a
`SECURITY DEFINER` function against `profiles`. Verify before you believe, and
verify before you panic. Both were fixed in `21_function_grant_hygiene.sql`
anyway — cheap, and it removes the question.

## Baseline — advisories that are expected

Anything on this list is a decision, not a finding. **Anything NOT on this list
is new and needs thought.** Update this file in the same PR that changes the
underlying fact.

| Advisory | Object | Why it is accepted |
|---|---|---|
| `authenticated_security_definer_function_executable` | `create_ingest_token(text, tx_source)` | The app's token-minting RPC. `authenticated` is exactly who should call it; anon is revoked (migration 03). |
| `authenticated_security_definer_function_executable` | `delete_account()` | Apple guideline 5.1.1(v) in-app deletion (migration 05). Deliberately `authenticated`-only. |
| `authenticated_security_definer_function_executable` | `revoke_ingest_device(uuid)` | Capture-device revocation (migration 11). Deliberately `authenticated`-only. |
| `auth_leaked_password_protection` | Auth | Pro-plan feature; not bought. Replaced by a client-side Pwned Passwords k-anonymity check in `apps/mobile/src/lib/password.ts` — see HANDOFF §18, "Password policy". |

Everything else the advisor reported on 2026-07-31 was fixed in migration 21.
After it, every function in `public` has a pinned `search_path`, and the only
functions executable by an API role are the three RPCs in the table above.

To re-check that property directly:

```sql
select p.proname, p.prosecdef,
       coalesce(array_to_string(p.proconfig, ','), 'NONE') as config,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' order by 1;
```

Run it with `pnpm exec supabase db query --linked -f <file>`. That is also the
way to execute any ad-hoc SQL against the hosted project without a raw
connection string — it is not mentioned in either deploy guide.

## Related

- `pnpm exec supabase db lint` runs against the **local** database and needs no
  hosted project, so it can catch some of this before a deploy.
- HANDOFF §35 records the pass that introduced this file.
