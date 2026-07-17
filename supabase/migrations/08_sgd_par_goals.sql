-- 08 — SGD-at-par + savings goals (field-testing follow-ups, HANDOFF §15).
--
-- SGD at par: under the BND–SGD Currency Interchangeability Agreement the
-- two currencies circulate 1:1 in Brunei, so SGD spends belong in the BND
-- totals. The dashboard views fold SGD into the BND bucket; other foreign
-- currencies stay separate (their true BND cost isn't knowable — see the
-- no-FX-conversion decision).

create or replace view public.monthly_totals
with (security_invoker = true)
as
select
  user_id,
  (date_trunc('month', occurred_at at time zone 'Asia/Brunei'))::date as month,
  case when currency in ('BND', 'SGD') then 'BND' else currency end as currency,
  sum(amount) as total,
  count(*) as tx_count
from public.transactions
where parse_status = 'parsed' and amount is not null and occurred_at is not null
group by user_id, 2, 3;

create or replace view public.merchant_totals
with (security_invoker = true)
as
select
  user_id,
  merchant_normalized,
  case when currency in ('BND', 'SGD') then 'BND' else currency end as currency,
  sum(amount) as total,
  count(*) as tx_count,
  max(occurred_at) as last_seen
from public.transactions
where parse_status = 'parsed' and amount is not null and merchant_normalized is not null
group by user_id, merchant_normalized, 3;

-- Savings goals: "save `target_amount` for `name`"; `saved_amount` is
-- incremented manually by the user (no bank balance exists by design).
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  target_amount numeric(12, 2) not null check (target_amount > 0),
  saved_amount numeric(12, 2) not null default 0 check (saved_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger savings_goals_touch_updated_at
before update on public.savings_goals
for each row execute function public.touch_updated_at();

alter table public.savings_goals enable row level security;

create policy savings_goals_select on public.savings_goals for select using (user_id = auth.uid());
create policy savings_goals_insert on public.savings_goals for insert with check (user_id = auth.uid());
create policy savings_goals_update on public.savings_goals for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy savings_goals_delete on public.savings_goals for delete using (user_id = auth.uid());
