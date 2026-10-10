CREATE TABLE deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  calculator_type text,
  title text,
  inputs jsonb,
  results jsonb,
  created_at timestamp default now()
);

CREATE TABLE shared_links (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deals(id) on delete cascade,
  token text unique,
  created_at timestamp default now(),
  views int default 0
);
