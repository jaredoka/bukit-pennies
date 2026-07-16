-- In-app account deletion (Apple guideline 5.1.1(v)). Every app table
-- references auth.users ON DELETE CASCADE (01_schema.sql), so removing the
-- auth user removes all of the user's data in one statement.
create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
