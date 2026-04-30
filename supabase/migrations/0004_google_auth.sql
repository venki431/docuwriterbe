-- 0004_google_auth — Google Identity Services sign-in support.
--
-- Adds two columns + one constraint:
--  * users.google_id      → Google's stable subject identifier (sub claim).
--                           Nullable; unique among non-null values so a Google
--                           account links to at most one DocGen account.
--  * users.auth_provider  → How the user originally signed up: 'email' or
--                           'google'. We KEEP this stable across linking — if
--                           a user signs up with email/password and later
--                           clicks "Continue with Google" with the same email,
--                           we attach `google_id` but leave `auth_provider`
--                           as 'email' so their password access still works.

alter table users
  add column if not exists google_id text,
  add column if not exists auth_provider text not null default 'email';

-- Check constraint added separately so re-running the migration is idempotent.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_auth_provider_check'
  ) then
    alter table users
      add constraint users_auth_provider_check
      check (auth_provider in ('email', 'google'));
  end if;
end $$;

-- Partial unique index — multiple users may have NULL google_id, but the same
-- non-null google_id can never appear twice.
create unique index if not exists users_google_id_uidx
  on users(google_id) where google_id is not null;
