alter table public.savings_goals
  add column if not exists currency text not null default 'BND';
