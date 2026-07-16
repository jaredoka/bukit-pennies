-- DEV-ONLY SEED — never run against production.
-- Demo user:      demo@bukitpennies.test / demo12345
-- RLS-proof user: rls@bukitpennies.test  / rls12345
-- Seeded ingest token (plaintext, dev only): bp_devSeedToken0000000000000000000000000001

-- ------------------------------------------------------------- auth users
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, is_super_admin
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated', 'demo@bukitpennies.test',
    extensions.crypt('demo12345', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Demo"}',
    now(), now(), '', '', '', '', false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated', 'rls@bukitpennies.test',
    extensions.crypt('rls12345', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"RLS Test"}',
    now(), now(), '', '', '', '', false
  );

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email in ('demo@bukitpennies.test', 'rls@bukitpennies.test');

-- ------------------------------------------------------ demo card + device
insert into public.user_cards (user_id, bank, card_last4, label)
values ('11111111-1111-1111-1111-111111111111', 'baiduri', '0213', 'Baiduri Visa');

-- token_hash = sha256 of the dev token above
insert into public.ingest_devices (user_id, name, kind, token_hash)
values (
  '11111111-1111-1111-1111-111111111111',
  'Dev seed device', 'paste',
  encode(extensions.digest('bp_devSeedToken0000000000000000000000000001', 'sha256'), 'hex')
);

-- ------------------------------------------- ~60 parsed tx across 3 months
do $$
declare
  demo uuid := '11111111-1111-1111-1111-111111111111';
  merchants text[] := array[
    'GALORIES SMOOTHIES BSB BN', 'SUPA SAVE MATA-MATA', 'HUA HO MANGGIS',
    'KFC GADONG', 'PIZZA HUT KIULAP', 'TIMES CINEPLEX', 'THE COFFEE BEAN BSB',
    'SHELL SERI COMPLEX', 'GUARDIAN AIRPORT MALL', 'BOOST JUICE TIMES SQUARE'
  ];
  i int;
  ts timestamptz;
  amt numeric(12, 2);
  m text;
  raw text;
  cat uuid;
begin
  for i in 0 .. 59 loop
    ts := date_trunc('hour', now()) - (i * interval '36 hours') - interval '2 hours';
    amt := round((((i * 37) % 4200) + 250)::numeric / 100, 2);
    m := merchants[(i % array_length(merchants, 1)) + 1];
    raw := format(
      'Card No.: 4x0213 Amount: BND %s Merchant: %s Date: %s If suspicious, please call 2449666.',
      to_char(amt, 'FM999990.00'), m,
      to_char(ts at time zone 'Asia/Brunei', 'DD-MM-YYYY HH24:MI:SS')
    );
    -- Categorize by merchant so the dashboard's category donut has real data.
    select id into cat from public.categories where user_id is null and name = case
      when m like '%SUPA SAVE%' or m like '%HUA HO%' then 'Groceries'
      when m like '%SHELL%' then 'Transport'
      when m like '%CINEPLEX%' then 'Entertainment'
      when m like '%GUARDIAN%' then 'Health'
      else 'Food & Drink'
    end;
    insert into public.transactions (
      user_id, occurred_at, amount, currency, merchant, merchant_normalized,
      bank, card_last4, category_id, source, parse_status, confidence, raw_text, raw_hash
    ) values (
      demo, ts, amt, 'BND', m, m, 'baiduri', '0213', cat, 'paste', 'parsed', 1.0,
      raw, encode(extensions.digest(demo::text || ':' || raw, 'sha256'), 'hex')
    );
  end loop;
end;
$$;

-- ----------------------------------------- review-inbox material (dev only)
-- Two needs_review rows (unparseable / low-confidence generic)
insert into public.transactions (user_id, amount, currency, merchant, merchant_normalized, bank, source, parse_status, confidence, raw_text, raw_hash)
values
  (
    '11111111-1111-1111-1111-111111111111',
    null, 'BND', null, null, 'unknown', 'paste', 'needs_review', 0,
    'Thank you for shopping with us! Ref 88213 total due settled.',
    encode(extensions.digest('11111111-1111-1111-1111-111111111111:Thank you for shopping with us! Ref 88213 total due settled.', 'sha256'), 'hex')
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    18.90, 'BND', 'AMAN HILLS RESTAURANT', 'AMAN HILLS RESTAURANT', 'unknown', 'share', 'needs_review', 0.58,
    'Purchase of BND 18.90 at AMAN HILLS RESTAURANT approved. Thank you.',
    encode(extensions.digest('11111111-1111-1111-1111-111111111111:Purchase of BND 18.90 at AMAN HILLS RESTAURANT approved. Thank you.', 'sha256'), 'hex')
  );

-- A near-duplicate pair (same amount/card within 3 minutes, different wording)
with original as (
  insert into public.transactions (user_id, occurred_at, amount, currency, merchant, merchant_normalized, bank, card_last4, source, parse_status, confidence, raw_text, raw_hash)
  values (
    '11111111-1111-1111-1111-111111111111',
    now() - interval '5 hours', 12.00, 'BND', 'EXCAPADE SUSHI GADONG', 'EXCAPADE SUSHI GADONG', 'baiduri', '0213', 'ios_shortcut', 'parsed', 1.0,
    'Card No.: 4x0213 Amount: BND 12.00 Merchant: EXCAPADE SUSHI GADONG Date: 15-07-2026 19:02:11 If suspicious, please call 2449666.',
    encode(extensions.digest('11111111-1111-1111-1111-111111111111:dupe-original', 'sha256'), 'hex')
  )
  returning id
)
insert into public.transactions (user_id, occurred_at, amount, currency, merchant, merchant_normalized, bank, card_last4, source, parse_status, confidence, raw_text, raw_hash, possible_duplicate_of)
select
  '11111111-1111-1111-1111-111111111111',
  now() - interval '5 hours' + interval '40 seconds', 12.00, 'BND', 'EXCAPADE SUSHI', 'EXCAPADE SUSHI', 'unknown', '0213', 'share', 'needs_review', 0.65,
  'BND 12.00 spent at EXCAPADE SUSHI card ending 0213.',
  encode(extensions.digest('11111111-1111-1111-1111-111111111111:dupe-echo', 'sha256'), 'hex'),
  original.id
from original;

-- One parsed row for the RLS-proof user (user B must never see demo rows and vice versa)
insert into public.transactions (user_id, occurred_at, amount, currency, merchant, merchant_normalized, bank, card_last4, source, parse_status, confidence, raw_text, raw_hash)
values (
  '22222222-2222-2222-2222-222222222222',
  now() - interval '1 day', 7.50, 'BND', 'RLS CANARY CAFE', 'RLS CANARY CAFE', 'baiduri', '9999', 'manual', 'parsed', 1.0,
  'manual entry', encode(extensions.digest('22222222-2222-2222-2222-222222222222:manual entry', 'sha256'), 'hex')
);
