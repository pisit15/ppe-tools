-- 004: Auth hardening (applied 2026-07-09 directly on production DB)
--
-- 1) Passwords in company_users / tools_users / admin_accounts were migrated
--    from plaintext to bcrypt using pgcrypto:
--      UPDATE <table> SET password = crypt(password, gen_salt('bf', 10))
--      WHERE password NOT LIKE '$2%';
--    The login route (src/app/api/auth/login/route.ts) verifies with bcryptjs
--    and still accepts legacy plaintext values as a fallback for rows created
--    manually before hashing.
--
-- 2) All anon/public RLS policies on user tables were dropped. These tables
--    are now accessible ONLY via the service-role key (used by API routes).
--    Never re-add anon policies to these tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hash any plaintext passwords (idempotent)
UPDATE company_users  SET password = crypt(password, gen_salt('bf', 10)), updated_at = now() WHERE password NOT LIKE '$2%';
UPDATE tools_users    SET password = crypt(password, gen_salt('bf', 10)), updated_at = now() WHERE password NOT LIKE '$2%';
UPDATE admin_accounts SET password = crypt(password, gen_salt('bf', 10))                    WHERE password NOT LIKE '$2%';

-- Remove anon/public access (idempotent)
DROP POLICY IF EXISTS "Allow anon select company_users" ON company_users;
DROP POLICY IF EXISTS "Allow anon insert company_users" ON company_users;
DROP POLICY IF EXISTS "Allow anon update company_users" ON company_users;
DROP POLICY IF EXISTS "Allow anon delete company_users" ON company_users;
DROP POLICY IF EXISTS "Allow anon select admin_accounts" ON admin_accounts;
DROP POLICY IF EXISTS "Allow anon insert admin_accounts" ON admin_accounts;
DROP POLICY IF EXISTS "Allow anon update admin_accounts" ON admin_accounts;
DROP POLICY IF EXISTS "Allow anon delete admin_accounts" ON admin_accounts;
DROP POLICY IF EXISTS "Service role only" ON tools_users;
DROP POLICY IF EXISTS "Allow all for service role" ON company_settings;

-- RLS stays enabled with zero policies => only service role can access
ALTER TABLE company_users  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tools_users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
