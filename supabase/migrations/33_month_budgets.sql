-- 33_month_budgets.sql — a budget that can differ month to month.
--
-- `profiles.monthly_income` (migration 07) is one figure applied to every
-- month. That is wrong for the way people actually budget: December is a
-- Christmas month and needs a bigger number than a quiet February.
--
-- The shape is deliberately "override or inherit". A row exists only for a
-- month the user priced differently; every other month keeps using the
-- Settings default, so changing that default still moves all the months that
-- never had an opinion. Storing twelve rows per user to repeat the same figure
-- would make the default impossible to change in one place.
--
-- The currency is stored with the amount. Budgets are entered in whatever the
-- user's primary currency is at the time, and a later switch must not silently
-- reinterpret 500 SGD as 500 USD. Display converts with `fx_rates` (migration
-- 29) for the month in question, which is fixed once that month closes, so a
-- past month's budget never drifts.
--
-- `month` is always the first of the month, matching every other month bucket
-- in the schema (`transaction_month_summary`, `fx_rates`).
--
-- Table grants arrive via the default privileges set up in 04_grants.sql.

create table public.month_budgets (
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency char(3) not null default 'BND',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month),
  constraint month_budgets_first_of_month check (month = date_trunc('month', month)::date)
);

create trigger month_budgets_touch_updated_at
before update on public.month_budgets
for each row execute function public.touch_updated_at();

alter table public.month_budgets enable row level security;

create policy month_budgets_select on public.month_budgets
  for select using (user_id = auth.uid());
create policy month_budgets_insert on public.month_budgets
  for insert with check (user_id = auth.uid());
create policy month_budgets_update on public.month_budgets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy month_budgets_delete on public.month_budgets
  for delete using (user_id = auth.uid());

-- The default budget gets the same treatment: it now records which currency it
-- was entered in. Existing rows were BND by definition (the dashboard only ever
-- used the figure when the primary currency was BND), so the default is exact
-- and no backfill is needed.
alter table public.profiles
  add column monthly_income_currency char(3) not null default 'BND';
