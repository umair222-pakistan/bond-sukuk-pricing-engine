create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text,
  is_pro boolean not null default false,
  subscription_status text not null default 'inactive',
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists plan text,
  add column if not exists is_pro boolean not null default false,
  add column if not exists subscription_status text not null default 'inactive',
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles enable row level security;

revoke insert, update, delete on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
