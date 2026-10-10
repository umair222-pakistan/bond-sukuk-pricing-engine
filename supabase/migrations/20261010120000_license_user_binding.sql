alter table public.licenses
  add column if not exists user_id uuid references auth.users(id) on delete set null;
