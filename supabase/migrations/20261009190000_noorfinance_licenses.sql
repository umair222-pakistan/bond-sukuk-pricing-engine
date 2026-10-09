create table if not exists public.noorfinance_licenses (
  license_key_id text primary key,
  user_email text not null,
  status text not null check (status in ('active', 'inactive', 'disabled', 'expired')),
  expires_at timestamptz,
  product_id text,
  order_id text,
  updated_at timestamptz not null default now()
);

create index if not exists noorfinance_licenses_user_email_idx
  on public.noorfinance_licenses (user_email);

alter table public.noorfinance_licenses enable row level security;

revoke all on public.noorfinance_licenses from anon, authenticated;
grant all on public.noorfinance_licenses to service_role;
