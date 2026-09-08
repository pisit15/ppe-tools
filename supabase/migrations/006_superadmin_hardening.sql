-- 006_superadmin_hardening.sql
-- Groundwork for the super-admin console at admin.eashe.org.
--
-- 1) Hash every plaintext password in admin_accounts with bcrypt.
--    Safe to run: /api/auth/login already accepts bcrypt hashes ($2a/$2b/$2y)
--    and falls back to plaintext only for rows that are still unhashed.
--    NOTE: company_users / company_credentials / company_auth are intentionally
--    left alone here — they are read by the separate safety-env-dashboard app,
--    which must be checked for bcrypt support before hashing them.
-- 2) Track the last successful super-admin login.

create extension if not exists pgcrypto;

update admin_accounts
   set password = crypt(password, gen_salt('bf', 10)),
       updated_at = now()
 where password is not null
   and password <> ''
   and password not like '$2a$%'
   and password not like '$2b$%'
   and password not like '$2y$%';

alter table admin_accounts
  add column if not exists last_login_at timestamptz;

create index if not exists idx_login_events_created_at on login_events (created_at desc);
create index if not exists idx_audit_log_created_at on audit_log (created_at desc);
