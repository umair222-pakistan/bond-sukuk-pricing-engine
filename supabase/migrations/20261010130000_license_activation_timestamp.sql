alter table public.licenses
  add column if not exists activated_at timestamptz;
