-- 17_transaction_facets.sql — filter options for the transactions list.
--
-- The list used to fetch the 500 newest rows and both filter *and* build its
-- filter pickers from that array. Now that filtering and paging happen in the
-- database (see apps/mobile/src/lib/txFilters.ts), the pickers have no full
-- array to read: a bank the user last used 600 transactions ago would drop out
-- of the Bank sheet, and filtering by it would be impossible from the UI.
--
-- The distinct combinations are what the pickers need, and there are only ever
-- a handful of them — a user has a few cards at a couple of banks. Carrying
-- bank alongside card_last4 keeps the existing behaviour where the Card sheet
-- narrows to the banks currently selected.
--
-- security_invoker so the caller's RLS on transactions applies. Without it the
-- view would run as its owner and hand every user everyone else's card digits
-- (see 03_functions_views.sql for the same note on the totals views).
create view public.transaction_facets
with (security_invoker = true)
as
select distinct
  user_id,
  bank,
  card_last4,
  currency
from public.transactions;

-- Grants come from 04_grants.sql's default privileges (authenticated,
-- service_role); 14_revoke_anon_dml.sql keeps anon out.
