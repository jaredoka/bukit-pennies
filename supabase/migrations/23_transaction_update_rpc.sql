-- 23_transaction_update_rpc.sql — close the open write surface on transactions.
--
-- Follow-up from the security review: `useUpdateTransaction` sent a
-- `Partial<TransactionRow>` straight to PostgREST, so a signed-in client could
-- write parser-owned columns on its own rows — the forensic `raw_text` /
-- `raw_hash`, `source`, `id` / `user_id` / `created_at`, or a bogus
-- `possible_duplicate_of` reference. RLS bounded the *rows* (owner only) but
-- had nothing to say about the *columns*.

-- ── 1. Table-level UPDATE stops being a client privilege ───────────────────
-- From here the app edits transactions only through `update_transaction`
-- below, so the broad grant can be taken away. The ingest edge function is
-- unaffected: it runs as service_role, which 04_grants.sql grants separately
-- and nothing here revokes. Mirrors migration 11, which did the same for
-- ingest_devices.
drop policy transactions_update on public.transactions;
revoke update on public.transactions from authenticated;

-- ── 2. update_transaction: the one audited door ────────────────────────────
-- SECURITY DEFINER so it can write every column; ownership is enforced
-- explicitly with `auth.uid()` since RLS does not apply to it (the dropped
-- policy above never did). The allowlist is the complete set of columns the
-- app's edit / review / re-parse flows write today (queries.ts): anything
-- else — raw_text, raw_hash, source, id, user_id, created_at, updated_at, or a
-- mistyped key — is refused before the row is touched.
--
-- Two value-level rules the allowlist alone cannot express, both on things the
-- database does not enforce itself:
--   • possible_duplicate_of may only be *cleared* (JSON null). Review's
--     "Keep both" is the one legitimate writer; pointing a row at an arbitrary
--     transaction id must not become a client feature.
--   • confidence is `real` with no check constraint; keep it in the 0..1 range
--     the parsers and the review confirm actually produce.
--
-- parse_status needs no rule of its own: it is an enum ('parsed',
-- 'needs_review'), and both values are written legitimately (review confirm
-- promotes, re-parse can demote).
create function public.update_transaction(p_id uuid, p_patch jsonb)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_row public.transactions;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid patch: expected a JSON object';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in (
      'merchant', 'merchant_normalized', 'category_id', 'amount',
      'currency', 'occurred_at', 'card_last4', 'notes', 'bank',
      'parse_status', 'confidence', 'possible_duplicate_of'
    ) then
      raise exception 'column "%" is not editable through this path', v_key;
    end if;
  end loop;

  if p_patch ? 'possible_duplicate_of'
     and p_patch -> 'possible_duplicate_of' <> 'null'::jsonb then
    raise exception 'possible_duplicate_of may only be cleared';
  end if;

  if p_patch ? 'confidence'
     and (p_patch ->> 'confidence')::numeric is not null
     and ((p_patch ->> 'confidence')::numeric < 0
          or (p_patch ->> 'confidence')::numeric > 1) then
    raise exception 'confidence must be between 0 and 1';
  end if;

  update public.transactions t
     set merchant = case when p_patch ? 'merchant'
                         then p_patch ->> 'merchant'
                         else t.merchant end,
         merchant_normalized = case when p_patch ? 'merchant_normalized'
                                    then p_patch ->> 'merchant_normalized'
                                    else t.merchant_normalized end,
         category_id = case when p_patch ? 'category_id'
                            then (p_patch ->> 'category_id')::uuid
                            else t.category_id end,
         amount = case when p_patch ? 'amount'
                       then (p_patch ->> 'amount')::numeric
                       else t.amount end,
         currency = case when p_patch ? 'currency'
                         then p_patch ->> 'currency'
                         else t.currency end,
         occurred_at = case when p_patch ? 'occurred_at'
                            then (p_patch ->> 'occurred_at')::timestamptz
                            else t.occurred_at end,
         card_last4 = case when p_patch ? 'card_last4'
                           then p_patch ->> 'card_last4'
                           else t.card_last4 end,
         notes = case when p_patch ? 'notes'
                      then p_patch ->> 'notes'
                      else t.notes end,
         bank = case when p_patch ? 'bank'
                     then (p_patch ->> 'bank')::public.bank_id
                     else t.bank end,
         parse_status = case when p_patch ? 'parse_status'
                             then (p_patch ->> 'parse_status')::public.parse_status
                             else t.parse_status end,
         confidence = case when p_patch ? 'confidence'
                           then (p_patch ->> 'confidence')::real
                           else t.confidence end,
         possible_duplicate_of = case when p_patch ? 'possible_duplicate_of'
                                      then null::uuid
                                      else t.possible_duplicate_of end
   where t.id = p_id
     and t.user_id = auth.uid()
   returning * into v_row;

  if not found then
    raise exception 'transaction not found';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.update_transaction(uuid, jsonb) from public, anon;
grant execute on function public.update_transaction(uuid, jsonb) to authenticated;
