-- Company Auth table for tools.eashe.org
-- Uses same credentials as eashe.org Safety & Environment Dashboard

-- Create company_auth table (if not exists — eashe.org may already have it)
CREATE TABLE IF NOT EXISTS company_auth (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  display_name TEXT,
  nickname TEXT,
  position TEXT,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_company_auth_username ON company_auth(username);
CREATE INDEX IF NOT EXISTS idx_company_auth_company ON company_auth(company_id);

-- Enable RLS
ALTER TABLE company_auth ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can read (no anon access to passwords)
CREATE POLICY "Service role only" ON company_auth
  FOR ALL USING (auth.role() = 'service_role');

-- Insert admin user
INSERT INTO company_auth (company_id, company_name, username, password, display_name, role)
VALUES ('admin', 'EA SHE Admin', 'admin', 'admin@eashe', 'Administrator', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Insert company users from EA HSE User Credentials
INSERT INTO company_auth (company_id, company_name, username, password, display_name, nickname, position, email) VALUES
('ea-kabin', 'EA Kabin (โรงไฟฟ้ากบินทร์บุรี)', 'komsant', 'tpopC0lX', 'คมสันต์ ประภาพรดิลก', 'โต', 'HSE Manager', NULL),
('ea-kabin', 'EA Kabin (โรงไฟฟ้ากบินทร์บุรี)', 'nimnual', 'iTygPiI6', 'นิ่มนวล มงคลดี', 'นิ่ม', 'ผู้ช่วยผู้จัดการแผนกความปลอดภัย & DCC', 'nimnual.m@energyabsolute.co.th'),
('ea-kabin', 'EA Kabin (โรงไฟฟ้ากบินทร์บุรี)', 'sarawut', '4x9IEPhq', 'สราวุฒิ อรภาพ', 'หนุ่ย', NULL, 'sarawut.a@energyabsolute.co.th'),
('ea-kabin', 'EA Kabin (โรงไฟฟ้ากบินทร์บุรี)', 'kittisuk', '719CyCEu', 'นายกิตติศักดิ์ แสงบัลลัง', 'ตอง', NULL, 'kittisuk.s@energyabsolute.co.th'),
('ea-kabin', 'EA Kabin (โรงไฟฟ้ากบินทร์บุรี)', 'chitchanok', '9gAhtbkD', 'นางสาวชิดชนก ปิ่นทอง', 'นก', NULL, 'Chitchanok.pin@energyabsolute.co.th'),
('ebi', 'EBI (โรงไฟฟ้าชีวมวล)', 'teppratan', 'VEWGiP49', 'เทพประธาน เขียวดี', 'แจ็ค', NULL, 'Teppratan.kia@eabioinnovation.co.th'),
('ebi', 'EBI (โรงไฟฟ้าชีวมวล)', 'suwimol', 'LdZjy8dF', 'สุวิมล พวงแก้ว', 'เนย์', NULL, 'Suwimol.pou@eabioinnovation.co.th'),
('esp', 'ESP (โรงไฟฟ้าพลังงานแสงอาทิตย์ ปราจีนบุรี)', 'napalai', '8tqYfhdI', 'นภาลัย อยู่ยังเกตุ', 'แป้ง', 'Safety Officer', 'napalai.y@esmanagement.co.th'),
('esl', 'ESL (โรงไฟฟ้าพลังงานแสงอาทิตย์ ลำปาง)', 'orathai', 'dbPKcKE0', 'อรทัย เพลา', 'หนุงหนิง', 'Safety Officer', 'orathai.pae@esmanagement.co.th'),
('esn', 'ESN (โรงไฟฟ้าพลังงานแสงอาทิตย์ หนองคาย)', 'worapol1', 'D542twwt', 'วรพล สุขเสวต', 'เต้', 'Safety Officer', 'worapol.soo@esmanagement.co.th'),
('eslo', 'ESLO (โรงไฟฟ้าพลังงานแสงอาทิตย์ ลพบุรี)', 'worapol2', 'SGyJLV3I', 'วรพล สุขะเสวต', 'เต้', 'Safety Officer', 'worapol.soo@esmanagement.co.th'),
('hnm', 'HNM (โรงไฟฟ้าห้วยเหาะ)', 'angnatcha', '7pdfqX4F', 'อังนัฐชา บุญต่อ', 'แข', 'Safety Officer', 'angnatcha.bun@esmanagement.co.th'),
('hnm', 'HNM (โรงไฟฟ้าห้วยเหาะ)', 'pachara', 'pgv82jXF', 'พชร ตะริยะ', 'บูม', 'Safety Officer', 'pachara.tar@esmanagement.co.th'),
('ewhk', 'EWHK (พลังงานลม หาดกังหัน)', 'apinan', 'Rope7F1S', 'อภินันท์ เพชรกูล', 'กันต์', 'Safety Officer', 'apinan.pet@esmanagement.co.th'),
('amt', 'AMT (เอเอ็มที)', 'chirachanon', 'C1T3XkN8', 'จิรชานนท์ ใจศิล', 'บอนด์', 'HSE Manager', 'chirachanon.c@amitathailand.co.th'),
('amt', 'AMT (เอเอ็มที)', 'kalyanat', 'y8NV8j1A', 'กัลยณัฏฐ์ วงษ์ประสิทธิ์', 'มด', 'Safety Officer (Technician)', NULL),
('mmc', 'MMC (เมกะเมทัลคอมเพล็กซ์)', 'ammara', 'KC3oN5G5', 'อมรา ช่องทุมมินทร์', 'นุ่น', 'Safety Officer', 'ammara.c@minemobilitycorporation.co.th'),
('aab', 'AAB (เอเอบี)', 'vanida', 'XS3lOjL7', 'วนิดา หงษ์กรรณ์', 'ไก่', 'Safety Officer', 'vanida.hon@absoluteassembly.co.th'),
('esm', 'ESM (โรงไฟฟ้าพลังงานแสงอาทิตย์ มหาสารคาม)', 'dusit', 'ZjbA79o1', 'ดุษิต ส่งตระกูลศักด์', 'ต้อง', 'Safety Supervisor', 'dusit.son@esmanagement.co.th'),
('wmp', 'WMP (ดับบลิวเอ็มพี)', 'wachiraporn', '1a1VuLco', 'วชิราภรณ์ คงปาน', 'มินนี่', 'Safety Officer', NULL)
ON CONFLICT (username) DO UPDATE SET
  password = EXCLUDED.password,
  display_name = EXCLUDED.display_name,
  company_id = EXCLUDED.company_id,
  company_name = EXCLUDED.company_name;
