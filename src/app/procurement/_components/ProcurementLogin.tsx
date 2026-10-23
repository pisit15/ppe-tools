'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, FileCheck2, Search, Building2 } from 'lucide-react';
import { useAuth, type LoginCompanyOption } from '@/components/AuthProvider';
import styles from '../procurement.module.css';

export default function ProcurementLogin() {
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<LoginCompanyOption[] | null>(null);

  async function signIn(companyId?: string) {
    if (isLoading) return;
    setError('');
    const result = await login(username, password, companyId);
    if (result.success) { setPassword(''); return; }
    if (result.needCompanySelection && result.companies) setCompanies(result.companies);
    else setError(result.error || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) { setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'); return; }
    void signIn();
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ea-logo.svg" alt="EA" width={44} height={36} />
          <span><span className={styles.brandName}>EA SHE Tools</span><span className={styles.brandSub}>Procurement workspace</span></span>
        </Link>
        <Link href="/" className={styles.logout}><ArrowLeft size={15} aria-hidden />หน้าหลัก</Link>
      </header>
      <main className={styles.loginMain}>
        <section className={styles.intro}>
          <span className={styles.eyebrow}>EA PROCUREMENT</span>
          <h1>ข้อมูลจัดซื้อ<br />ในพื้นที่ทำงานเดียว</h1>
          <p>ค้นหาราคา ตรวจสอบผู้ขาย และติดตาม PR พร้อมเอกสารอ้างอิงของทีม SHE</p>
          <div className={styles.features}>
            <div className={styles.feature}><Search size={20} aria-hidden /><span>ค้นหาราคาสินค้าและบริการที่เคยจัดซื้อ</span></div>
            <div className={styles.feature}><Building2 size={20} aria-hidden /><span>ดูประวัติผู้ขายและใบเสนอราคา</span></div>
            <div className={styles.feature}><FileCheck2 size={20} aria-hidden /><span>ตรวจสอบข้อมูล PR และ PO ย้อนกลับได้</span></div>
          </div>
        </section>
        <section className={styles.loginCard} aria-labelledby="proc-login-heading">
          <h2 id="proc-login-heading">{companies ? 'เลือกบริษัท' : 'เข้าสู่ระบบ'}</h2>
          <p className={styles.loginHint}>{companies ? 'เลือกบริษัทที่ต้องการเข้าใช้งานด้วยบัญชีนี้' : 'ใช้บัญชีทีม SHE เดียวกับ eashe.org'}</p>
          {companies ? (
            <div aria-busy={isLoading}>
              {companies.map(company => <button key={company.companyId} type="button" className={styles.company} disabled={isLoading} onClick={() => void signIn(company.companyId)}>{company.companyName}<ArrowRight size={16} aria-hidden /></button>)}
              {error && <p role="alert" className={styles.loginError}>{error}</p>}
              {isLoading && <p role="status" className={styles.help}>กำลังเข้าสู่ระบบ…</p>}
              <button type="button" className={styles.cancel} disabled={isLoading} onClick={() => { setCompanies(null); setError(''); }}>กลับไปแก้ไขบัญชี</button>
            </div>
          ) : (
            <form onSubmit={submit} aria-busy={isLoading}>
              <label className={styles.field} htmlFor="proc-username"><span>ชื่อผู้ใช้</span>
                <input id="proc-username" name="username" value={username} onChange={e => { setUsername(e.target.value); setError(''); }} autoComplete="username" autoCapitalize="none" spellCheck={false} required disabled={isLoading} />
              </label>
              <div className={styles.field}><label htmlFor="proc-password">รหัสผ่าน</label>
                <div className={styles.password}>
                  <input id="proc-password" name="password" type={visible ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }} autoComplete="current-password" required disabled={isLoading} />
                  <button className={styles.reveal} type="button" aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-pressed={visible} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}{visible ? 'ซ่อน' : 'แสดง'}</button>
                </div>
              </div>
              {error && <p role="alert" className={styles.loginError}>{error}</p>}
              <button type="submit" className={styles.submit} disabled={isLoading}>{isLoading ? <span role="status">กำลังเข้าสู่ระบบ…</span> : <>เข้าสู่ระบบ<ArrowRight size={16} aria-hidden /></>}</button>
            </form>
          )}
          <p className={styles.help}>หากเข้าใช้งานไม่ได้ กรุณาติดต่อผู้ดูแลระบบ SHE ของบริษัท</p>
        </section>
      </main>
    </div>
  );
}
