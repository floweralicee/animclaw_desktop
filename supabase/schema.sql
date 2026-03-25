-- Supabase schema for AnimClaw Desktop (NextAuth + Stripe)
-- Run this in your Supabase SQL Editor to set up the required tables.

-- ============================================================
-- 1. next_auth schema — required by @auth/supabase-adapter
--    The adapter queries next_auth.users, next_auth.accounts, etc.
-- ============================================================

create schema if not exists next_auth;

create table if not exists next_auth.users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique,
  "emailVerified" timestamptz,
  image text,
  gateway_api_key text,
  created_at timestamptz default now()
);

create table if not exists next_auth.accounts (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references next_auth.users(id) on delete cascade,
  type text not null,
  provider text not null,
  "providerAccountId" text not null,
  refresh_token text,
  access_token text,
  expires_at bigint,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  unique(provider, "providerAccountId")
);

create table if not exists next_auth.sessions (
  id uuid primary key default gen_random_uuid(),
  "sessionToken" text unique not null,
  "userId" uuid not null references next_auth.users(id) on delete cascade,
  expires timestamptz not null
);

create table if not exists next_auth.verification_tokens (
  identifier text not null,
  token text unique not null,
  expires timestamptz not null,
  primary key (identifier, token)
);

-- Grant the service_role access to next_auth schema
grant usage on schema next_auth to service_role;
grant all on all tables in schema next_auth to service_role;
alter default privileges in schema next_auth grant all on tables to service_role;

-- ============================================================
-- 2. public.subscriptions — Stripe subscription tracking
--    user_id references next_auth.users so both systems share IDs.
--    status values: 'inactive' (default), 'trialing' (7-day free
--    trial via Stripe), 'active' (paid), 'cancelled'.
-- ============================================================

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references next_auth.users(id) on delete cascade unique,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_stripe_customer_id on public.subscriptions(stripe_customer_id);

-- ============================================================
-- 3. public.bypass_codes — reusable subscription bypass codes
--    Codes are stored as SHA-256 hashes. Create one via:
--      insert into public.bypass_codes (code_hash, label, max_uses)
--      values (encode(sha256('YOUR_CODE'), 'hex'), 'note', 5);
-- ============================================================

create table if not exists public.bypass_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text,
  max_uses int not null default 1,
  uses_count int not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.bypass_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.bypass_codes(id),
  user_id uuid not null references next_auth.users(id) on delete cascade,
  redeemed_at timestamptz default now(),
  unique(code_id, user_id)
);

-- ============================================================
-- 4. public.api_keys — Animclaw AI Gateway API keys
--    Keys are stored as SHA-256 hashes. The raw key (ac_<hex>)
--    is returned once at creation time and never stored.
-- ============================================================

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references next_auth.users(id) on delete cascade,
  key_hash text not null unique,
  key_prefix text not null,
  name text not null default 'Default',
  last_used_at timestamptz,
  created_at timestamptz default now(),
  revoked_at timestamptz
);

create index if not exists idx_api_keys_user_id on public.api_keys(user_id);
create index if not exists idx_api_keys_key_hash on public.api_keys(key_hash);

-- ============================================================
-- 5. public.usage_logs — per-request AI gateway token usage
-- ============================================================

create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references next_auth.users(id) on delete cascade,
  api_key_id uuid references public.api_keys(id),
  model text not null,
  provider text not null,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  total_tokens int not null default 0,
  cost_microcents bigint not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_usage_logs_user_id on public.usage_logs(user_id);
create index if not exists idx_usage_logs_created_at on public.usage_logs(created_at);

-- ============================================================
-- 6. public.usage_summaries — monthly aggregates for billing
-- ============================================================

create table if not exists public.usage_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references next_auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  total_tokens bigint default 0,
  total_cost_microcents bigint default 0,
  reported_to_stripe boolean default false,
  unique(user_id, period_start)
);

create index if not exists idx_usage_summaries_user_period on public.usage_summaries(user_id, period_start);
