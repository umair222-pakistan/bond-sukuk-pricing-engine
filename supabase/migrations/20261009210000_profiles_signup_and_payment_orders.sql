create table if not exists public.licenses (
  email text not null,
  plan text not null,
  status text not null,
  lemon_order_id text primary key,
  created_at timestamptz not null default now()
);

alter table public.licenses
  add column if not exists email text,
  add column if not exists plan text,
  add column if not exists status text,
  add column if not exists lemon_order_id text,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists licenses_lemon_order_id_uidx
  on public.licenses (lemon_order_id);

alter table public.licenses enable row level security;
revoke all on public.licenses from public, anon, authenticated;
grant all on public.licenses to service_role;

alter table public.profiles
  add column if not exists email text,
  add column if not exists plan text default 'free',
  add column if not exists lemon_customer_id text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists is_pro boolean not null default false,
  add column if not exists subscription_status text not null default 'inactive',
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles alter column plan set default 'free';

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, plan)
  values (new.id, new.email, 'free')
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();
