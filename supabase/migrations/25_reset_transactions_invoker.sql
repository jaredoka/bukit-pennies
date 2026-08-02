-- 25_reset_transactions_invoker.sql — migration 24 created reset_transactions as
-- SECURITY DEFINER, mirroring update_transaction, but this function has no need
-- to bypass RLS: DELETE is still granted to authenticated (04_grants.sql) and
-- the transactions_delete policy already bounds it to the caller's rows. Definer
-- would only have added a second audited exception (the
-- authenticated_security_definer_function_executable lint) to a data-destruction
-- RPC. Invoker keeps RLS as a second gate behind the explicit auth.uid() filter.
alter function public.reset_transactions() security invoker;
