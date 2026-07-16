-- Bukit Pennies schema (HANDOFF.md §5)
create extension if not exists pgcrypto;

create type bank_id as enum ('baiduri', 'bibd', 'scb', 'unknown');
create type tx_source as enum ('android_listener', 'ios_shortcut', 'share', 'paste', 'manual');
create type parse_status as enum ('parsed', 'needs_review');

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  default_currency char(3) not null default 'BND',
  created_at timestamptz not null default now()
);

-- Every new auth user gets a profile row automatically.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- -------------------------------------------------------------- categories
-- user_id NULL = global default category visible to everyone.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  color text,
  unique nulls not distinct (user_id, name)
);

insert into public.categories (user_id, name, color) values
  (null, 'Food & Drink',  '#E4572E'),
  (null, 'Groceries',     '#76B041'),
  (null, 'Transport',     '#4C9FDC'),
  (null, 'Shopping',      '#B067C7'),
  (null, 'Bills',         '#E0A800'),
  (null, 'Entertainment', '#FF7BAC'),
  (null, 'Health',        '#2EB8A6'),
  (null, 'Other',         '#8A8F98');

-- -------------------------------------------------------------- user_cards
create table public.user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bank bank_id not null,
  card_last4 text not null check (card_last4 ~ '^\d{4}$'),
  label text,
  unique (user_id, bank, card_last4)
);

-- ---------------------------------------------------------- ingest_devices
-- Plaintext token bp_<base62> is shown ONCE at creation; only sha256 stored.
create table public.ingest_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind tx_source not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

-- ------------------------------------------------------------ transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurred_at timestamptz,
  amount numeric(12, 2),
  currency char(3) not null default 'BND',
  merchant text,
  merchant_normalized text, -- upper + collapsed spaces; dashboard grouping key
  bank bank_id not null default 'unknown',
  card_last4 text,
  category_id uuid references public.categories (id) on delete set null,
  notes text,
  source tx_source not null,
  parse_status parse_status not null default 'needs_review',
  confidence real,
  raw_text text not null,
  raw_hash text not null, -- sha256(user_id || ':' || normalized(raw_text))
  possible_duplicate_of uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, raw_hash) -- exact-dupe guard
);

create index transactions_user_occurred_idx on public.transactions (user_id, occurred_at desc);
create index transactions_user_status_idx on public.transactions (user_id, parse_status);
create index transactions_user_merchant_idx on public.transactions (user_id, merchant_normalized);

create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger transactions_touch_updated_at
before update on public.transactions
for each row execute function public.touch_updated_at();
