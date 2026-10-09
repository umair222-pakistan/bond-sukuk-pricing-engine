alter table public.licenses
  add column if not exists lemon_customer_id text,
  add column if not exists variant_id text,
  add column if not exists subscription_id text;
