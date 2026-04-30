-- 0003_referrals — referral codes + reward tracking.
--
-- Two pieces:
--  1. `users.referral_code` (unique, not null after backfill) and
--     `users.referred_by_user_id` (nullable FK back to users).
--  2. `referrals` table — one row per referred user, with status that drives
--     whether the +15-day reward fires when the referee verifies (₹1).

-- ─── users: add referral columns ─────────────────────────────────────────
alter table users
  add column if not exists referral_code text,
  add column if not exists referred_by_user_id uuid references users(id);

create unique index if not exists users_referral_code_uidx on users(referral_code);
create index if not exists users_referred_by_idx on users(referred_by_user_id);

-- Backfill any pre-existing users with a code from the same human-friendly
-- alphabet the runtime generator uses (no 0/O/I/1 to avoid transcription
-- mistakes on shared links).
do $$
declare
  u record;
  c text;
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTVWXYZ';
  i int;
begin
  for u in select id from users where referral_code is null loop
    loop
      c := '';
      for i in 1..8 loop
        c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      end loop;
      begin
        update users set referral_code = c where id = u.id;
        exit;
      exception when unique_violation then
        -- 31^8 ≈ 850B — collision is astronomically unlikely, but the loop
        -- handles it deterministically if it ever happens.
      end;
    end loop;
  end loop;
end $$;

alter table users alter column referral_code set not null;

-- ─── referrals table ─────────────────────────────────────────────────────
create table if not exists referrals (
  id uuid primary key default uuid_generate_v4(),

  referrer_user_id uuid not null references users(id) on delete cascade,
  -- One row per referred user. The unique constraint is the structural
  -- guarantee that a given referee can only ever award ONE referrer.
  referred_user_id uuid not null unique references users(id) on delete cascade,

  -- pending  → referee hasn't verified yet
  -- completed → referee verified, reward credited to referrer
  -- flagged   → abuse heuristic tripped (e.g. shared signup IP); never rewards
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'flagged')),
  flagged_reason text,

  reward_days integer,
  reward_given_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists referrals_referrer_idx on referrals(referrer_user_id);
create index if not exists referrals_status_idx on referrals(status);

drop trigger if exists referrals_set_updated_at on referrals;
create trigger referrals_set_updated_at
before update on referrals
for each row execute function set_updated_at();
