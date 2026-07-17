-- Monthly income on the profile: the dashboard donut's reference amount
-- ("remaining to spend" = monthly_income - month spend). One figure applied
-- to every month; NULL = not set (dashboard falls back to spend-only view).
alter table public.profiles
  add column monthly_income numeric(12,2) check (monthly_income > 0);
