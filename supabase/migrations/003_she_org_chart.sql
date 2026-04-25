-- ============================================================
-- Migration 003: SHE Org Chart support
-- - Adds hierarchy & metadata columns to she_personnel
-- - Creates org_view_codes table for public PIN-based viewing
-- ============================================================

-- 1) Extend she_personnel with org-chart metadata --------------
ALTER TABLE she_personnel
  ADD COLUMN IF NOT EXISTS parent_id          UUID REFERENCES she_personnel(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chart_sort_order   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chart_node_color   TEXT,
  ADD COLUMN IF NOT EXISTS details            TEXT,
  ADD COLUMN IF NOT EXISTS status             TEXT NOT NULL DEFAULT 'active';

-- Helpful indexes for tree traversal
CREATE INDEX IF NOT EXISTS idx_she_personnel_parent
  ON she_personnel(parent_id);

CREATE INDEX IF NOT EXISTS idx_she_personnel_company_parent
  ON she_personnel(company_id, parent_id);

-- 2) Public access codes for org chart viewing ------------------
CREATE TABLE IF NOT EXISTS org_view_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) UNIQUE NOT NULL,
  label       TEXT,
  company_id  TEXT,                 -- NULL = all companies
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_org_view_codes_active
  ON org_view_codes(code) WHERE is_active = TRUE;

-- 3) Cycle-prevention trigger -----------------------------------
CREATE OR REPLACE FUNCTION she_personnel_prevent_cycle() RETURNS TRIGGER AS $func$
DECLARE
  cur UUID := NEW.parent_id;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Cannot set parent_id equal to id';
  END IF;
  FOR i IN 1..50 LOOP
    IF cur IS NULL THEN EXIT; END IF;
    IF cur = NEW.id THEN
      RAISE EXCEPTION 'Setting parent_id would create a cycle';
    END IF;
    SELECT parent_id INTO cur FROM she_personnel WHERE id = cur;
  END LOOP;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_she_personnel_prevent_cycle ON she_personnel;
CREATE TRIGGER trg_she_personnel_prevent_cycle
  BEFORE INSERT OR UPDATE OF parent_id ON she_personnel
  FOR EACH ROW EXECUTE FUNCTION she_personnel_prevent_cycle();
