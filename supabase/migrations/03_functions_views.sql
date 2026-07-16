-- Token RPC + dashboard views (HANDOFF.md §5, migration 03).

-- Base62 encoding for opaque ingest tokens. 32 random bytes ≈ 43 base62 chars.
create function public.base62_encode(data bytea)
returns text
language plpgsql
immutable
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  n numeric := 0;
  remainder int;
  result text := '';
  i int;
begin
  for i in 0 .. length(data) - 1 loop
    n := n * 256 + get_byte(data, i);
  end loop;
  if n = 0 then
    return '0';
  end if;
  while n > 0 loop
    remainder := (n % 62)::int;
    result := substr(alphabet, remainder + 1, 1) || result;
    n := trunc(n / 62);
  end loop;
  return result;
end;
$$;

-- Returns the plaintext token exactly ONCE; only its sha256 is persisted.
create function public.create_ingest_token(p_name text, p_kind tx_source)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  plaintext text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'device name required';
  end if;

  plaintext := 'bp_' || public.base62_encode(gen_random_bytes(32));

  insert into public.ingest_devices (user_id, name, kind, token_hash)
  values (auth.uid(), btrim(p_name), p_kind, encode(digest(plaintext, 'sha256'), 'hex'));

  return plaintext;
end;
$$;

revoke execute on function public.create_ingest_token(text, tx_source) from public, anon;
grant execute on function public.create_ingest_token(text, tx_source) to authenticated;

-- Dashboard views: parsed rows only; months bucketed in Asia/Brunei (+08, no DST).
-- security_invoker so the caller's RLS applies.
create view public.monthly_totals
with (security_invoker = true)
as
select
  user_id,
  (date_trunc('month', occurred_at at time zone 'Asia/Brunei'))::date as month,
  currency,
  sum(amount) as total,
  count(*) as tx_count
from public.transactions
where parse_status = 'parsed' and amount is not null and occurred_at is not null
group by user_id, 2, currency;

create view public.merchant_totals
with (security_invoker = true)
as
select
  user_id,
  merchant_normalized,
  currency,
  sum(amount) as total,
  count(*) as tx_count,
  max(occurred_at) as last_seen
from public.transactions
where parse_status = 'parsed' and amount is not null and merchant_normalized is not null
group by user_id, merchant_normalized, currency;
