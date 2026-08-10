-- 26_heard_about.sql — optional "how did you hear about us?" answer on the
-- profile, collected once from Settings > About.
--
-- This is an aggregate marketing metric, not an individual event: the point
-- is to query counts per channel later ("17 from App Store search, 6 from
-- friends"), so it lives on the account row rather than in a write-only
-- feedback table with an email. Two nullable columns — the chosen channel
-- (allowlisted in the database, matching the repo rule that caps live in
-- Postgres, not application code) and an optional free-text detail shown only
-- for the `other` channel.
--
-- RLS needs no changes: `profiles_update` (02_rls.sql) already scopes updates
-- to auth.uid(), and the app writes through `useUpdateProfile`, the same path
-- that already owns display_name and monthly_income.

alter table public.profiles
  add column heard_about text,
  add column heard_about_detail text,
  add constraint profiles_heard_about_allowlist
    check (heard_about in ('app_store', 'friend_family', 'social_media', 'online_community', 'news_blog', 'other'))
    not valid,
  add constraint profiles_heard_about_detail_len
    check (length(heard_about_detail) <= 200) not valid;

-- Prove the back catalogue clean (nothing written yet, so this is cheap and
-- fails nothing). Kept out of the migration body for the same reason the
-- VALIDATE block in 20_input_bounds_and_quotas.sql is: a deploy should not be
-- blocked by historical rows. Run separately if ever needed:
--
--   alter table public.profiles validate constraint profiles_heard_about_allowlist;
--   alter table public.profiles validate constraint profiles_heard_about_detail_len;
