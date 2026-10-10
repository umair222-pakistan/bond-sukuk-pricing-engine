alter table public.licenses
  add column if not exists tier text,
  add column if not exists claimed_by_email text;

alter table public.licenses
  add column if not exists activated_at timestamptz;

update public.licenses
set tier = lower(plan)
where tier is null
  and lower(plan) in ('basic', 'pro', 'enterprise');

alter table public.profiles
  add column if not exists tier text not null default 'free',
  add column if not exists license_key text;

update public.profiles
set tier = lower(plan)
where tier = 'free'
  and lower(plan) in ('basic', 'pro', 'enterprise');

create index if not exists licenses_claimed_by_email_status_idx
  on public.licenses (lower(claimed_by_email), status);

create index if not exists licenses_user_id_status_idx
  on public.licenses (user_id, status);

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

grant select on public.profiles to authenticated;
grant all on public.licenses to service_role;
