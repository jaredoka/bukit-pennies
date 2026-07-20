-- Bug reports submitted from Settings > Report a bug.
create table public.bug_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  short_id    text not null,
  app_version text not null,
  description text not null,
  created_at  timestamptz not null default now()
);

alter table public.bug_reports enable row level security;

-- Insert-only: users submit reports but cannot read them back.
create policy bug_reports_insert on public.bug_reports
  for insert with check (user_id = auth.uid());
