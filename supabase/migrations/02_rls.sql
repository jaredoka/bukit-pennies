-- Row Level Security: per-user isolation on every table (HANDOFF.md §5).
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.user_cards enable row level security;
alter table public.ingest_devices enable row level security;
alter table public.transactions enable row level security;

-- profiles: keyed on id = auth.uid()
create policy profiles_select on public.profiles for select using (id = auth.uid());
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete on public.profiles for delete using (id = auth.uid());

-- categories: readable when own OR global default (user_id is null); writable only when own
create policy categories_select on public.categories for select using (user_id = auth.uid() or user_id is null);
create policy categories_insert on public.categories for insert with check (user_id = auth.uid());
create policy categories_update on public.categories for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy categories_delete on public.categories for delete using (user_id = auth.uid());

-- user_cards
create policy user_cards_select on public.user_cards for select using (user_id = auth.uid());
create policy user_cards_insert on public.user_cards for insert with check (user_id = auth.uid());
create policy user_cards_update on public.user_cards for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_cards_delete on public.user_cards for delete using (user_id = auth.uid());

-- ingest_devices (token_hash is only ever written by the security-definer RPC)
create policy ingest_devices_select on public.ingest_devices for select using (user_id = auth.uid());
create policy ingest_devices_insert on public.ingest_devices for insert with check (user_id = auth.uid());
create policy ingest_devices_update on public.ingest_devices for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ingest_devices_delete on public.ingest_devices for delete using (user_id = auth.uid());

-- transactions
create policy transactions_select on public.transactions for select using (user_id = auth.uid());
create policy transactions_insert on public.transactions for insert with check (user_id = auth.uid());
create policy transactions_update on public.transactions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transactions_delete on public.transactions for delete using (user_id = auth.uid());
