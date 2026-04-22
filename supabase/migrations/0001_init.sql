-- 0001_init — baseline DocuWriter schema.
--
-- Safe to re-run: every object uses `if not exists`. This is the only
-- migration that creates the full schema from scratch; every later change
-- is an additive migration file (ALTER TABLE, CREATE INDEX, etc).

-- ─── extensions ───────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─── shared trigger fn ────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─── users ────────────────────────────────────────────────────────────────
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text unique not null,
  password_hash text not null,

  trial_ends_at timestamptz not null default (now() + interval '30 days'),
  subscription_active_until timestamptz,
  razorpay_customer_id text,

  terms_accepted_at timestamptz,
  terms_version text,

  is_admin boolean not null default false,

  verified_at timestamptz,

  signup_ip text,
  signup_user_agent text,
  signup_locale text,

  mobile_number text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_email_idx on users(lower(email));
create index if not exists users_signup_ip_idx on users(signup_ip);
create unique index if not exists users_mobile_unique
  on users(mobile_number)
  where mobile_number is not null;

drop trigger if exists users_set_updated_at on users;
create trigger users_set_updated_at
before update on users
for each row execute function set_updated_at();

-- ─── refresh_tokens ───────────────────────────────────────────────────────
create table if not exists refresh_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists refresh_tokens_user_id_idx on refresh_tokens(user_id);
create index if not exists refresh_tokens_token_hash_idx on refresh_tokens(token_hash);

-- ─── password_reset_tokens ───────────────────────────────────────────────
create table if not exists password_reset_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  requester_ip text,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_id_idx on password_reset_tokens(user_id);
create index if not exists password_reset_tokens_token_hash_idx on password_reset_tokens(token_hash);

-- ─── transactions ────────────────────────────────────────────────────────
create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,

  razorpay_order_id text unique not null,
  razorpay_payment_id text,
  razorpay_signature text,

  amount_paise integer not null,
  currency text not null default 'INR',
  status text not null check (status in ('created', 'paid', 'failed', 'refunded')),
  plan_id text,
  duration_days integer,

  invoice_number text unique,
  invoiced_at timestamptz,
  invoice_email_sent_at timestamptz,

  receipt text,
  notes jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists invoice_number_seq;

create index if not exists transactions_user_id_idx on transactions(user_id);
create index if not exists transactions_status_idx on transactions(status);
create index if not exists transactions_payment_id_idx on transactions(razorpay_payment_id);
create index if not exists transactions_invoice_number_idx on transactions(invoice_number);

drop trigger if exists transactions_set_updated_at on transactions;
create trigger transactions_set_updated_at
before update on transactions
for each row execute function set_updated_at();

-- ─── billing_events ───────────────────────────────────────────────────────
create table if not exists billing_events (
  id uuid primary key default uuid_generate_v4(),
  razorpay_event_id text unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists billing_events_event_type_idx on billing_events(event_type);
