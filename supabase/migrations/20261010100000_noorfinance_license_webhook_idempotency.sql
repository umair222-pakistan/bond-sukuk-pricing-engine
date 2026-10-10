alter table public.noorfinance_licenses
  add column if not exists webhook_event_id text;

create unique index if not exists noorfinance_licenses_webhook_event_id_uidx
  on public.noorfinance_licenses (webhook_event_id);
