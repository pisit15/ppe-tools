-- 005: Per-company department list (applied 2026-08-17 on production DB)
-- Departments were previously a hardcoded 6-item enum in src/lib/constants.ts.
-- Now each company manages its own list; dropdowns read from this table.

CREATE TABLE IF NOT EXISTS ppe_departments (
  id SERIAL PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, name)
);
ALTER TABLE ppe_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon select ppe_departments" ON ppe_departments FOR SELECT TO anon USING (true);

-- Seed: distinct department strings already used by each company
INSERT INTO ppe_departments (company_id, name)
SELECT DISTINCT company_id, trim(department) FROM (
  SELECT company_id, department FROM ppe_employees WHERE department IS NOT NULL AND trim(department) <> ''
  UNION
  SELECT company_id, department FROM ppe_transactions WHERE department IS NOT NULL AND trim(department) <> ''
) x
ON CONFLICT (company_id, name) DO NOTHING;

-- Thai defaults for companies with no existing departments
INSERT INTO ppe_departments (company_id, name)
SELECT cs.company_id, d.name
FROM company_settings cs
CROSS JOIN (VALUES ('ฝ่ายผลิต'),('ฝ่ายโลจิสติกส์'),('ฝ่ายบริหาร'),('ฝ่าย HR'),('ฝ่ายบำรุงรักษา'),('ฝ่ายควบคุมคุณภาพ')) AS d(name)
WHERE NOT EXISTS (SELECT 1 FROM ppe_departments pd WHERE pd.company_id = cs.company_id)
ON CONFLICT (company_id, name) DO NOTHING;
