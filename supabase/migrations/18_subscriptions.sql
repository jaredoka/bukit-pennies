-- 18_subscriptions.sql — user-declared recurring subscriptions.
--
-- The dashboard already *infers* recurring spend (`detectRecurring`, same
-- merchant + similar amount across 3+ Brunei months). That only ever finds
-- what the bank has already texted about three times: it cannot see an annual
-- plan, a subscription billed to a card the user does not capture, or a free
-- trial that has not charged yet. This table is the declared half — what the
-- user says they are paying for — and the two are merged for display.
--
-- Deliberately NOT a budget input. The real charge arrives as a transaction and
-- is already counted against the monthly limit; adding the declared amount on
-- top would double-count the same money. Every figure derived from this table
-- is display-only.
--
-- `merchant_normalized` is the join back to reality: when set, it matches
-- `transactions.merchant_normalized`, which is how a declared subscription
-- claims its own captured charges (and how a confirmed suggestion remembers
-- which detected cluster it came from).

create table public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                text not null check (length(btrim(name)) between 1 and 80),
  amount              numeric(12, 2) not null check (amount > 0),
  currency            char(3) not null default 'BND',
  cycle               text not null default 'monthly'
                        check (cycle in ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  -- Only meaningful for cycle = 'custom' (e.g. every 45 days).
  cycle_days          int check (cycle_days between 1 and 3650),
  next_due_on         date,
  category_id         uuid references public.categories (id) on delete set null,
  card_last4          text check (card_last4 ~ '^[0-9]{4}$'),
  merchant_normalized text check (length(merchant_normalized) <= 200),
  trial_ends_on       date,
  started_on          date,
  notes               text check (length(notes) <= 500),
  status              text not null default 'active' check (status in ('active', 'cancelled')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- A custom cycle without a length has no next date to compute.
  constraint subscriptions_custom_needs_days check (cycle <> 'custom' or cycle_days is not null)
);

-- The list screen and the dashboard card both read "my active subscriptions".
create index subscriptions_user_status_idx on public.subscriptions (user_id, status);

create trigger subscriptions_touch_updated_at
before update on public.subscriptions
for each row execute function public.touch_updated_at();

alter table public.subscriptions enable row level security;

create policy subscriptions_select on public.subscriptions for select using (user_id = auth.uid());
create policy subscriptions_insert on public.subscriptions for insert with check (user_id = auth.uid());
create policy subscriptions_update on public.subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy subscriptions_delete on public.subscriptions for delete using (user_id = auth.uid());

-- Grants come from 04_grants.sql's default privileges (authenticated,
-- service_role); 14_revoke_anon_dml.sql keeps anon out. Nothing to add here.
