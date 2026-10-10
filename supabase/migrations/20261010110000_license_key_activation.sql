alter table public.licenses
  add column if not exists license_key text;

alter table public.licenses
  drop constraint if exists licenses_pkey;

alter table public.licenses
  alter column lemon_order_id drop not null;

update public.licenses
set license_key = 'NF-MV1ZGIGV-S09H'
where license_key = 'NOOR-MV1ZGIGV-S09H';

create unique index if not exists licenses_license_key_uidx
  on public.licenses (license_key)
  where license_key is not null;
