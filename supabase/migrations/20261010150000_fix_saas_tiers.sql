alter table public.licenses
  add column if not exists license_key text,
  add column if not exists plan text,
  add column if not exists tier text,
  add column if not exists status text,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists claimed_by_email text,
  add column if not exists activated_at timestamptz,
  add column if not exists lemon_order_id text,
  add column if not exists subscription_id text,
  add column if not exists variant_id text,
  add column if not exists lemon_customer_id text;

alter table public.profiles
  add column if not exists tier text not null default 'free',
  add column if not exists plan text not null default 'free',
  add column if not exists subscription_status text not null default 'inactive',
  add column if not exists license_key text,
  add column if not exists lemon_customer_id text,
  add column if not exists is_pro boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

update public.licenses
set tier = lower(plan)
where tier is null
  and lower(plan) in ('basic', 'pro', 'enterprise');

update public.profiles
set tier = lower(plan)
where tier = 'free'
  and lower(plan) in ('basic', 'pro', 'enterprise');

create unique index if not exists licenses_license_key_uidx
  on public.licenses (license_key)
  where license_key is not null;

create index if not exists licenses_claimed_by_email_status_idx
  on public.licenses (lower(claimed_by_email), status);

create index if not exists licenses_user_id_status_idx
  on public.licenses (user_id, status);

alter table public.licenses enable row level security;
alter table public.profiles enable row level security;

grant all on public.licenses to service_role;
grant select on public.profiles to authenticated;
