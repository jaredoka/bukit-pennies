-- 06_budgets.sql — per-category monthly spending limits (HANDOFF §14, Phase 5).
--
-- One row per (user, category): "spend at most `amount` per Brunei month on
-- this category". Global default categories (categories.user_id is null) can
-- be budgeted too — the budget row itself is always user-owned. Monthly spend
-- comes from the existing monthly bucketing client-side; no view needed.
-- Table grants arrive via the default privileges set up in 04_grants.sql.

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  currency char(3) not null default 'BND',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id)
);

create trigger budgets_touch_updated_at
before update on public.budgets
for each row execute function public.touch_updated_at();

alter table public.budgets enable row level security;

create policy budgets_select on public.budgets for select using (user_id = auth.uid());
create policy budgets_insert on public.budgets for insert with check (user_id = auth.uid());
create policy budgets_update on public.budgets for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy budgets_delete on public.budgets for delete using (user_id = auth.uid());
