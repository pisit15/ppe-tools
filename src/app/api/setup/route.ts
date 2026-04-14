import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase config');
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = getSupabase();

    // 1) Create tools_users table via RPC (raw SQL)
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS tools_users (
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
    `;

    // Try creating table via rpc
    const { error: createError } = await supabase.rpc('exec_sql', { sql: createTableSQL });

    // If rpc doesn't exist, try direct insert (table might already exist)
    if (createError) {
      console.log('RPC exec_sql not available, trying direct upsert. Error:', createError.message);
    }

    // 2) Upsert all users (works whether table was just created or already existed)
    const users = [
      { company_id: 'admin', company_name: 'EA SHE Admin', username: 'admin', password: 'admin@eashe', display_name: 'Administrator', nickname: '', position: 'Super Admin', email: '', role: 'admin' },
      // EA Kabin - company login
      { company_id: 'ea-kabin', company_name: 'EA Kabin (โรงไฟฟ้ากบินทร์บุรี)', username: 'eakabin', password: 'eakabin2026', display_name: 'EA Kabin', nickname: '', position: 'Company Account', email: '', role: 'user' },
      // EA Kabin - individual users
      { company_id: 'ea-kabin', company_name: 'EA Kabin (โรงไฟฟ้ากบินทร์บุรี)', username: 'komsant', password: 'tpopC0lX', display_name: 'คมสันต์ ประภาพรดิลก', nickname: 'โต', position: 'HSE Manager', email: '', role: 'user' },
      { company_id: 'ea-kabin', company_name: 'EA Kabin (โรงไฟฟ้ากบินทร์บุรี)', username: 'nimnual', password: 'iTygPiI6', display_name: 'นิ่มนวล มงคลดี', nickname: 'นิ่ม', position: 'ผู้ช่วยผู้จัดการแผนกความปลอดภัย & DCC', email: 'nimnual.m@energyabsolute.co.th', role: 'user' },
      { company_id: 'ea-kabin', company_name: 'EA Kabin (โรงไฟฟ้ากบินทร์บุรี)', username: 'sarawut', password: '4x9IEPhq', display_name: 'สราวุฒิ อรภาพ', nickname: 'หนุ่ย', position: '', email: 'sarawut.a@energyabsolute.co.th', role: 'user' },
      { company_id: 'ea-kabin', company_name: 'EA Kabin (โรงไฟฟ้ากบินทร์บุรี)', username: 'kittisuk', password: '719CyCEu', display_name: 'นายกิตติศักดิ์ แสงบัลลัง', nickname: 'ตอง', position: '', email: 'kittisuk.s@energyabsolute.co.th', role: 'user' },
      { company_id: 'ea-kabin', company_name: 'EA Kabin (โรงไฟฟ้ากบินทร์บุรี)', username: 'chitchanok', password: '9gAhtbkD', display_name: 'นางสาวชิดชนก ปิ่นทอง', nickname: 'นก', position: '', email: 'Chitchanok.pin@energyabsolute.co.th', role: 'user' },
      // EBI
      { company_id: 'ebi', company_name: 'EBI (โรงไฟฟ้าชีวมวล)', username: 'teppratan', password: 'VEWGiP49', display_name: 'เทพประธาน เขียวดี', nickname: 'แจ็ค', position: '', email: 'Teppratan.kia@eabioinnovation.co.th', role: 'user' },
      { company_id: 'ebi', company_name: 'EBI (โรงไฟฟ้าชีวมวล)', username: 'suwimol', password: 'LdZjy8dF', display_name: 'สุวิมล พวงแก้ว', nickname: 'เนย์', position: '', email: 'Suwimol.pou@eabioinnovation.co.th', role: 'user' },
      // ESP
      { company_id: 'esp', company_name: 'ESP (โรงไฟฟ้าพลังงานแสงอาทิตย์ ปราจีนบุรี)', username: 'napalai', password: '8tqYfhdI', display_name: 'นภาลัย อยู่ยังเกตุ', nickname: 'แป้ง', position: 'Safety Officer', email: 'napalai.y@esmanagement.co.th', role: 'user' },
      // ESL
      { company_id: 'esl', company_name: 'ESL (โรงไฟฟ้าพลังงานแสงอาทิตย์ ลำปาง)', username: 'orathai', password: 'dbPKcKE0', display_name: 'อรทัย เพลา', nickname: 'หนุงหนิง', position: 'Safety Officer', email: 'orathai.pae@esmanagement.co.th', role: 'user' },
      // ESN
      { company_id: 'esn', company_name: 'ESN (โรงไฟฟ้าพลังงานแสงอาทิตย์ หนองคาย)', username: 'worapol1', password: 'D542twwt', display_name: 'วรพล สุขเสวต', nickname: 'เต้', position: 'Safety Officer', email: 'worapol.soo@esmanagement.co.th', role: 'user' },
      // ESLO
      { company_id: 'eslo', company_name: 'ESLO (โรงไฟฟ้าพลังงานแสงอาทิตย์ ลพบุรี)', username: 'worapol2', password: 'SGyJLV3I', display_name: 'วรพล สุขะเสวต', nickname: 'เต้', position: 'Safety Officer', email: 'worapol.soo@esmanagement.co.th', role: 'user' },
      // HNM
      { company_id: 'hnm', company_name: 'HNM (โรงไฟฟ้าห้วยเหาะ)', username: 'angnatcha', password: '7pdfqX4F', display_name: 'อังนัฐชา บุญต่อ', nickname: 'แข', position: 'Safety Officer', email: 'angnatcha.bun@esmanagement.co.th', role: 'user' },
      { company_id: 'hnm', company_name: 'HNM (โรงไฟฟ้าห้วยเหาะ)', username: 'pachara', password: 'pgv82jXF', display_name: 'พชร ตะริยะ', nickname: 'บูม', position: 'Safety Officer', email: 'pachara.tar@esmanagement.co.th', role: 'user' },
      // EWHK
      { company_id: 'ewhk', company_name: 'EWHK (พลังงานลม หาดกังหัน)', username: 'apinan', password: 'Rope7F1S', display_name: 'อภินันท์ เพชรกูล', nickname: 'กันต์', position: 'Safety Officer', email: 'apinan.pet@esmanagement.co.th', role: 'user' },
      // AMT
      { company_id: 'amt', company_name: 'AMT (เอเอ็มที)', username: 'chirachanon', password: 'C1T3XkN8', display_name: 'จิรชานนท์ ใจศิล', nickname: 'บอนด์', position: 'HSE Manager', email: 'chirachanon.c@amitathailand.co.th', role: 'user' },
      { company_id: 'amt', company_name: 'AMT (เอเอ็มที)', username: 'kalyanat', password: 'y8NV8j1A', display_name: 'กัลยณัฏฐ์ วงษ์ประสิทธิ์', nickname: 'มด', position: 'Safety Officer (Technician)', email: '', role: 'user' },
      // MMC
      { company_id: 'mmc', company_name: 'MMC (เมกะเมทัลคอมเพล็กซ์)', username: 'ammara', password: 'KC3oN5G5', display_name: 'อมรา ช่องทุมมินทร์', nickname: 'นุ่น', position: 'Safety Officer', email: 'ammara.c@minemobilitycorporation.co.th', role: 'user' },
      // AAB
      { company_id: 'aab', company_name: 'AAB (เอเอบี)', username: 'vanida', password: 'XS3lOjL7', display_name: 'วนิดา หงษ์กรรณ์', nickname: 'ไก่', position: 'Safety Officer', email: 'vanida.hon@absoluteassembly.co.th', role: 'user' },
      // ESM
      { company_id: 'esm', company_name: 'ESM (โรงไฟฟ้าพลังงานแสงอาทิตย์ มหาสารคาม)', username: 'dusit', password: 'ZjbA79o1', display_name: 'ดุษิต ส่งตระกูลศักด์', nickname: 'ต้อง', position: 'Safety Supervisor', email: 'dusit.son@esmanagement.co.th', role: 'user' },
      // WMP
      { company_id: 'wmp', company_name: 'WMP (ดับบลิวเอ็มพี)', username: 'wachiraporn', password: '1a1VuLco', display_name: 'วชิราภรณ์ คงปาน', nickname: 'มินนี่', position: 'Safety Officer', email: '', role: 'user' },
    ];

    const results: { username: string; status: string }[] = [];

    for (const user of users) {
      const { error } = await supabase
        .from('tools_users')
        .upsert(user, { onConflict: 'username' });

      results.push({
        username: user.username,
        status: error ? `Error: ${error.message}` : 'OK',
      });
    }

    // Also try inserting into company_users if it exists
    const cuResults: { username: string; status: string }[] = [];
    for (const user of users) {
      const { error } = await supabase
        .from('company_users')
        .upsert(user, { onConflict: 'username' });

      cuResults.push({
        username: user.username,
        status: error ? `Error: ${error.message}` : 'OK',
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Setup complete',
      tools_users: results,
      company_users: cuResults,
    });
  } catch (err) {
    console.error('Setup error:', err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
