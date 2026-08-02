-- 24_reset_transactions.sql — "start fresh": delete every transaction (and with
-- each row its category mapping — category_id is a column on the row, there is
-- no assignment table) for the calling user. Budgets, goals, subscriptions,
-- cards, capture tokens and settings survive.
--
-- Mirrors update_transaction (migration 23): SECURITY DEFINER because the
-- app's write surface on transactions is RPC-only now, with ownership enforced
-- explicitly since RLS does not apply to definer functions. Returns the number
-- of rows removed so the UI can say what happened.
create function public.reset_transactions()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from public.transactions where user_id = auth.uid();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.reset_transactions() from public, anon;
grant execute on function public.reset_transactions() to authenticated;
