"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ClipboardCheck, FileText, Users, LayoutDashboard, Plus, ArrowLeft,
  ArrowUpRight, ArrowRight, ShieldCheck, Clock3, Search, LogOut,
  RefreshCw, MapPin, Check, ChevronRight, X, Building2, CircleHelp,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { displayStatus, STATUS_LABELS, type Permit, type PermitActor, type PermitTemplate } from "@/lib/permit/types";
import { dateTime, permitApi, type DirectoryEntry } from "./api";

function LoadingPanel() {
  return <div className="wp-view-loading" role="status"><span className="wp-loading-symbol" />กำลังเปิดพื้นที่ทำงาน…</div>;
}
const PermitEditor = dynamic(() => import("./PermitEditor"), { loading: LoadingPanel });
const PermitDetail = dynamic(() => import("./PermitDetail"), { loading: LoadingPanel });
const PermitSettings = dynamic(() => import("./PermitSettings"), { loading: LoadingPanel });
const PermitLocationSettings = dynamic(() => import("./PermitLocationSettings"), { loading: LoadingPanel });
type Tab = "dashboard" | "templates" | "people" | "locations";
type Company = { company_id: string; company_name: string };
type PermitList = { data: Permit[]; total: number; summary: Record<string, number> };

export default function PermitApp() {
  const sp = useSearchParams();
  const linkedPermit = sp.get("id");
  const auth = useAuth();
  const [actor, setActor] = useState<PermitActor | null>(null);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(sp.get("company_id") || "amt");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [templates, setTemplates] = useState<PermitTemplate[]>([]);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [selected, setSelected] = useState<Permit | null>(null);
  const [editing, setEditing] = useState(false);
  const [copy, setCopy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState("all");
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [listBusy, setListBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const requestId = useRef(0);
  const detailRequestId = useRef(0);
  const authEpoch = useRef(0);
  const loadedCompany = useRef("");
  const handledLink = useRef<string | null>(null);
  const [mode, setMode] = useState<"staff" | "contractor">("staff");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginCompanies, setLoginCompanies] = useState<{ companyId: string; companyName: string }[]>([]);
  const [loginCompany, setLoginCompany] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchDraft); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  const loadMetadata = useCallback(async () => {
    const epoch = authEpoch.current;
    const [t, d] = await Promise.all([
      permitApi<{ data: PermitTemplate[] }>("templates", company),
      permitApi<{ data: DirectoryEntry[] }>("directory", company),
    ]);
    if (epoch !== authEpoch.current) return;
    setTemplates(t.data);
    setDirectory(d.data);
  }, [company]);

  const loadPermits = useCallback(async () => {
    const id = ++requestId.current;
    setListBusy(true);
    try {
      const p = await permitApi<PermitList>(
        `permits?page=${page}&q=${encodeURIComponent(search)}&status=${filter}&queue=${queue}`, company,
      );
      if (id !== requestId.current) return;
      setPermits(p.data);
      setTotal(p.total);
      setSummary(p.summary);
      setUpdatedAt(new Date());
      const lastPage = Math.max(1, Math.ceil(p.total / 25));
      if (page > lastPage) setPage(lastPage);
    } catch (e) {
      if (id === requestId.current) throw e;
    } finally {
      if (id === requestId.current) setListBusy(false);
    }
  }, [company, page, search, filter, queue]);

  const load = useCallback(async () => {
    const epoch = authEpoch.current;
    try { await Promise.all([loadMetadata(), loadPermits()]); }
    catch (e) { if (epoch === authEpoch.current) throw e; }
  }, [loadMetadata, loadPermits]);

  // Company/session metadata is independent of search, queue and pagination.
  useEffect(() => {
    let live = true;
    const epoch = ++authEpoch.current;
    ++requestId.current;
    loadedCompany.current = "";
      setLoading(true);
    setPermits([]);
    setTotal(0);
    setSummary({});
    setUpdatedAt(null);
    setError("");
    async function bootstrap() {
      const r = await permitApi<{ actor: PermitActor }>("session", company);
      if (!live || epoch !== authEpoch.current) return;
      if (!r.actor.admin && company !== r.actor.companyId) {
        setCompany(r.actor.companyId);
        return;
      }
      const [t, d, c, p] = await Promise.all([
        permitApi<{ data: PermitTemplate[] }>("templates", company),
        permitApi<{ data: DirectoryEntry[] }>("directory", company),
        r.actor.admin ? permitApi<{ data: Company[] }>("companies", company) : Promise.resolve({ data: [] as Company[] }),
        linkedPermit && handledLink.current !== linkedPermit ? permitApi<{ data: Permit }>(`permits/${linkedPermit}`, company).catch((e: Error) => {
          if (live && epoch === authEpoch.current) setError(e.message);
          return null;
        }) : Promise.resolve(null),
      ]);
      if (!live || epoch !== authEpoch.current) return;
      handledLink.current = linkedPermit;
      setTemplates(t.data);
      setDirectory(d.data);
      setCompanies(c.data);
      setActor(r.actor);
      if (p) setSelected(p.data);
      loadedCompany.current = company;
    }
    void bootstrap().catch((e: Error) => {
      if (live && epoch === authEpoch.current) {
        setActor(null);
        if (!e.message.includes("เข้าสู่ระบบ")) setError(e.message);
      }
    }).finally(() => { if (live && epoch === authEpoch.current) setLoading(false); });
    return () => { live = false; };
  }, [company, linkedPermit]);

  useEffect(() => {
    if (!actor || loading || loadedCompany.current !== company) return;
    void loadPermits().catch((e: Error) => setError(e.message));
  }, [actor, loading, company, loadPermits]);

  useEffect(() => {
    if (!actor || editing || selected || tab !== "dashboard") return;
    const refresh = () => {
      if (document.visibilityState === "visible") void loadPermits().catch((e: Error) => setError(e.message));
    };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [actor, editing, selected, tab, loadPermits]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setError("");
    try {
      await permitApi("session", company, "DELETE");
      if (mode === "staff") {
        const r = await auth.login(username, password, loginCompany || undefined);
        if (r.needCompanySelection) { setLoginCompanies(r.companies || []); return; }
        if (!r.success) throw new Error(r.error || "เข้าสู่ระบบไม่สำเร็จ");
      } else await permitApi("session", company, "POST", { username, password });
      window.location.reload();
    } catch (e) { setError((e as Error).message); }
    finally { setLoginBusy(false); }
  }
  async function open(p: Permit) {
    const epoch = authEpoch.current;
    const id = ++detailRequestId.current;
    setError("");
    try {
      const r = await permitApi<{ data: Permit }>(`permits/${p.id}`, company);
      if (id !== detailRequestId.current || epoch !== authEpoch.current || loadedCompany.current !== company) return;
      setSelected(r.data);
      setEditing(false);
      setCopy(false);
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (e) { if (id === detailRequestId.current && epoch === authEpoch.current) setError((e as Error).message); }
  }
  function changed(p: Permit) {
    if (loadedCompany.current !== company || p.company_id !== company) return;
    ++detailRequestId.current;
    setSelected(p);
    setEditing(false);
    setCopy(false);
    void loadPermits().catch((e: Error) => setError(e.message));
  }
  function navigate(next: Tab) {
    ++detailRequestId.current;
    setTab(next);
    setSelected(null);
    setEditing(false);
    setError("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function create() {
    ++detailRequestId.current;
    setSelected(null);
    setEditing(true);
    setCopy(false);
    setError("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function logout() {
    ++detailRequestId.current;
    ++authEpoch.current;
    ++requestId.current;
    loadedCompany.current = "";
    try {
      await permitApi("session", company, "DELETE");
      if (!actor?.contractor) await auth.logout();
      setActor(null);
      setSelected(null);
      setPermits([]);
      setSummary({});
      setTotal(0);
    } catch (e) { setError((e as Error).message); }
  }

  if (loading) return <div className="wp-loading" role="status"><span className="wp-loading-symbol" /><p>กำลังเปิด Work Permit…</p></div>;
  if (!actor) return (
    <div className="wp-login">
      <section className="wp-login-brand" aria-label="ระบบใบอนุญาตทำงาน">
        <Link href="/" className="wp-brand"><span>E@</span><div>EA SHE TOOLS<small>Safety & Environment</small></div></Link>
        <div className="wp-login-intro">
          <span className="wp-eyebrow">WORK PERMIT</span>
          <h1>พร้อมก่อนเริ่มงาน<br /><em>ทุกขั้นตอน ตรวจสอบได้</em></h1>
          <p>พื้นที่ทำงานเดียวสำหรับขออนุญาต<br />ตรวจความพร้อม และลงนามออนไลน์</p>
          <div className="wp-login-journey" aria-label="ขั้นตอนใบอนุญาต">
            {[["01", "ขออนุญาต", FileText], ["02", "ตรวจและลงนาม", ShieldCheck], ["03", "ทำงานและปิดงาน", ClipboardCheck]].map(([n, label, Icon]) => {
              const StepIcon = Icon as typeof FileText;
              return <div key={n as string}><span><StepIcon size={18} aria-hidden="true" /></span><small>{n as string}</small><strong>{label as string}</strong></div>;
            })}
          </div>
        </div>
        <div className="wp-login-footer"><span className="wp-live-dot" />EA Safety & Environment<span>Permit to work</span></div>
      </section>
      <section className="wp-login-form">
        <Link href="/" className="wp-back"><ArrowLeft size={16} aria-hidden="true" />กลับหน้าเครื่องมือ</Link>
        <div className="wp-login-heading"><span className="wp-login-icon"><ClipboardCheck size={26} aria-hidden="true" /></span><div><span className="wp-eyebrow">WORKSPACE ACCESS</span><h2>เข้าสู่ Work Permit</h2></div></div>
        <p>เลือกประเภทบัญชีเพื่อเข้าสู่พื้นที่ทำงานของคุณ</p>
        <div className="wp-tabs" aria-label="ประเภทบัญชี">
          <button type="button" aria-pressed={mode === "staff"} className={mode === "staff" ? "active" : ""} onClick={() => { setMode("staff"); setLoginCompanies([]); setLoginCompany(""); setError(""); }}><ShieldCheck size={17} aria-hidden="true" />ผู้ดูแลระบบ SHE</button>
          <button type="button" aria-pressed={mode === "contractor"} className={mode === "contractor" ? "active" : ""} onClick={() => { setMode("contractor"); setLoginCompanies([]); setLoginCompany(""); setError(""); }}><Users size={17} aria-hidden="true" />ผู้ขออนุญาตทำงาน</button>
        </div>
        <p className="wp-account-help" id="wp-account-help">{mode === "contractor" ? "สำหรับพนักงานแผนกอื่นและผู้รับเหมา ใช้บัญชี Work Permit ที่ผู้ดูแลจัดให้" : "สำหรับ จป.วิชาชีพ / เจ้าหน้าที่สิ่งแวดล้อม ใช้บัญชี EA SHE Tools"}</p>
        <form onSubmit={login} aria-describedby="wp-account-help">
          <label>ชื่อผู้ใช้<input required autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="กรอกชื่อผู้ใช้" /></label>
          <label>รหัสผ่าน<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="กรอกรหัสผ่าน" /></label>
          {loginCompanies.length > 0 && <label>เลือกบริษัท<select value={loginCompany} required onChange={e => setLoginCompany(e.target.value)}><option value="">เลือกบริษัท</option>{loginCompanies.map(c => <option key={c.companyId} value={c.companyId}>{c.companyName}</option>)}</select></label>}
          {error && <p role="alert" className="wp-error">{error}</p>}
          <button disabled={loginBusy} className="wp-primary">{loginBusy ? <><RefreshCw className="wp-spin" size={17} aria-hidden="true" />กำลังเข้าสู่ระบบ…</> : <>เข้าสู่ Work Permit<ArrowRight size={18} aria-hidden="true" /></>}</button>
        </form>
        <div className="wp-login-support"><CircleHelp size={16} aria-hidden="true" /><p>ยังไม่มีบัญชีหรือเข้าใช้งานไม่ได้<br /><strong>ติดต่อผู้ดูแล SHE ของบริษัทคุณ</strong></p></div>
      </section>
    </div>
  );

  const canManage = actor.admin || actor.manager;
  const hasFilters = Boolean(search || filter !== "all" || queue !== "all");
  const needsSetup = !directory.some(m => m.role === "area_owner") || !directory.some(m => m.role === "safety");
  const nav = [
    { id: "dashboard", label: "ภาพรวมและใบอนุญาต", icon: LayoutDashboard },
    ...(canManage ? [
      { id: "templates", label: "แม่แบบเอกสาร", icon: FileText },
      { id: "people", label: "ผู้ใช้และผู้ลงนาม", icon: Users },
      { id: "locations", label: "พื้นที่และผู้รับผิดชอบ", icon: MapPin },
    ] : []),
  ];
  return (
    <div className="wp-shell">
      <a className="wp-skip-link" href="#wp-main-content">ข้ามไปเนื้อหา</a>
      <aside className="wp-sidebar wp-no-print">
        <Link href="/" className="wp-brand"><span>E@</span><div>EA SHE TOOLS<small>Safety & Environment</small></div></Link>
        <div className="wp-module"><span className="wp-module-icon"><ClipboardCheck size={22} aria-hidden="true" /></span><div><strong>Work Permit</strong><small>ระบบใบอนุญาตทำงาน</small></div></div>
        <span className="wp-nav-caption">พื้นที่ทำงาน</span>
        <nav aria-label="Work Permit">{nav.map(n => <button key={n.id} aria-label={n.label} aria-current={tab === n.id ? "page" : undefined} className={tab === n.id ? "active" : ""} onClick={() => navigate(n.id as Tab)}><n.icon size={18} aria-hidden="true" /><span>{n.id === "dashboard" ? "ภาพรวมใบอนุญาต" : n.label}</span>{tab === n.id && <ChevronRight size={14} aria-hidden="true" />}</button>)}</nav>
        <div className="wp-sidebar-bottom">
          <div className="wp-workspace-card"><Building2 size={18} aria-hidden="true" /><p>พื้นที่ทำงาน<strong>{company.toUpperCase()}</strong></p><span className="wp-live-dot" /></div>
          {actor.expiresAt && <small>บัญชีหมดอายุ {dateTime(actor.expiresAt)}</small>}
          <Link href="/"><ArrowUpRight size={15} aria-hidden="true" />กลับหน้าเครื่องมือ</Link>
        </div>
      </aside>
      <div className="wp-main">
        <header className="wp-topbar wp-no-print">
          <div className="wp-breadcrumb"><span className="wp-mobile-mark">E@</span><span>EA SHE Tools</span><ChevronRight size={14} aria-hidden="true" /><strong>Work Permit</strong></div>
          <div className="wp-topbar-account">
            {actor.admin ? <select aria-label="บริษัทที่กำลังจัดการ" value={company} onChange={e => { ++authEpoch.current; ++requestId.current; loadedCompany.current = ""; handledLink.current = linkedPermit; setLoading(true); setSelected(null); setEditing(false); setPage(1); setCompany(e.target.value); setError(""); }}>{companies.length ? companies.map(c => <option key={c.company_id} value={c.company_id}>{c.company_name}</option>) : <option value={company}>{company.toUpperCase()}</option>}</select> : <span className="wp-company-chip"><Building2 size={14} aria-hidden="true" />{company.toUpperCase()}</span>}
            <div className="wp-user-block"><span className="wp-avatar" aria-hidden="true">{actor.name.slice(0, 1)}</span><span className="wp-user"><strong>{actor.name}</strong><small>{actor.contractor ? (actor.requesterType === "employee" ? actor.department || "ผู้ขออนุญาต · พนักงาน" : "ผู้ขออนุญาต · ผู้รับเหมา") : canManage ? "ผู้ดูแล Work Permit" : "เจ้าหน้าที่ SHE"}</small></span></div>
            <button title="ออกจากระบบ" aria-label="ออกจากระบบ" className="wp-icon-button" onClick={() => void logout()}><LogOut size={18} aria-hidden="true" /></button>
          </div>
        </header>
        <main className={`wp-content${editing ? " wp-content-editor" : ""}`} id="wp-main-content" tabIndex={-1}>
          {process.env.NEXT_PUBLIC_PERMIT_DEMO === "true" && <div className="wp-demo-label wp-no-print">พื้นที่ทดสอบ · ข้อมูลจำลอง</div>}
          {error && <div role="alert" className="wp-error wp-no-print">{error}<button className="wp-link" onClick={() => void load().then(() => setError("")).catch(e => setError(e.message))}>ลองโหลดใหม่</button></div>}
          {editing ? <PermitEditor key={(selected?.id || "new") + String(copy)} actor={actor} company={company} templates={templates} directory={directory} initial={selected || undefined} copy={copy} onSaved={changed} onCancel={() => setEditing(false)} />
            : selected ? <PermitDetail key={selected.id} permit={selected} actor={actor} company={company} onChanged={changed} onBack={() => setSelected(null)} onEdit={() => { setCopy(false); setEditing(true); }} onCopy={() => { setCopy(true); setEditing(true); }} />
            : tab === "locations" && canManage ? <PermitLocationSettings key={company} company={company} directory={directory} />
            : (tab === "templates" || tab === "people") && canManage ? <PermitSettings key={company + tab} company={company} tab={tab} templates={templates} directory={directory} onRefresh={load} globalAdmin={actor.admin} />
            : <>
              <section className="wp-dashboard-heading">
                <div><span className="wp-eyebrow">PERMIT WORKSPACE <span>/ {company.toUpperCase()}</span></span><h1>ภาพรวมใบอนุญาตทำงาน</h1><p>{actor.contractor ? "จัดการคำขอ ติดตามการอนุมัติ และความพร้อมก่อนเริ่มงาน" : "เห็นงานที่ต้องดูแล และดำเนินการต่อได้ในที่เดียว"}</p></div>
                <button className="wp-primary" onClick={create}><Plus size={18} aria-hidden="true" />สร้างคำขอใหม่</button>
              </section>
              <div className="wp-stats" aria-label="สรุปใบอนุญาต">
                {[
                  { label: "รออนุมัติ", status: "submitted", icon: FileText, tone: "amber" },
                  { label: "กำลังทำงาน", status: "active", icon: ClipboardCheck, tone: "green" },
                  { label: "พักงาน / หมดอายุ", status: "attention", icon: Clock3, tone: "red" },
                  { label: "ปิดงานแล้ว", status: "closed", icon: ShieldCheck, tone: "blue" },
                ].map(s => <div key={s.status} className={`wp-stat wp-stat-${s.tone}`}><span className="wp-stat-icon"><s.icon size={20} aria-hidden="true" /></span><span className="wp-stat-label">{s.label}</span><strong>{summary[s.status] || 0}</strong></div>)}
              </div>
              {needsSetup && <div className="wp-setup-notice" role="status"><ShieldCheck size={20} aria-hidden="true" /><div><strong>เตรียมผู้ลงนามให้พร้อมก่อนส่งคำขอ</strong><p>ยังไม่ได้กำหนดเจ้าของพื้นที่หรือผู้ตรวจความปลอดภัยครบ ขณะนี้บันทึกร่างได้</p></div>{canManage && <button className="wp-secondary" onClick={() => navigate("people")}>ตั้งค่าผู้ลงนาม<ArrowRight size={15} aria-hidden="true" /></button>}</div>}
              {summary.due > 0 && <div className="wp-notice" role="status">มีใบอนุญาตใกล้หมดอายุภายใน 2 ชั่วโมง {summary.due} ใบ <button className="wp-link" onClick={() => { setQueue("due"); setPage(1); }}>ดูรายการ</button></div>}
              <section className="wp-panel wp-register" aria-labelledby="wp-register-heading">
                <div className="wp-section-heading"><div><h2 id="wp-register-heading">รายการใบอนุญาต <span className="wp-count">{total}</span></h2><p className="wp-muted">ค้นหาและติดตามใบอนุญาตจากประวัติทั้งหมด</p></div><button className="wp-secondary wp-refresh" disabled={listBusy} onClick={() => void loadPermits().catch(e => setError(e.message))}><RefreshCw size={15} aria-hidden="true" className={listBusy ? "wp-spin" : ""} /><span>รีเฟรช</span></button></div>
                <div className="wp-queue-tabs" aria-label="คิวงาน">{[["all", "ทั้งหมด", undefined], ["mine", "รอฉันดำเนินการ", summary.mine || 0], ["today", "งานวันนี้", undefined], ["due", "ใกล้หมดอายุ", summary.due || 0], ["closing", "รอปิดงาน", summary.closing || 0]].map(([key, label, count]) => <button key={String(key)} aria-pressed={queue === key} className={queue === key ? "active" : ""} onClick={() => { setQueue(String(key)); setPage(1); }}>{label}{typeof count === "number" && <span>{count}</span>}</button>)}</div>
                <div className="wp-filters">
                  <label className="wp-search"><Search size={18} aria-hidden="true" /><input aria-label="ค้นหาใบอนุญาต" maxLength={200} placeholder="ค้นหาชื่องาน พื้นที่ แผนก หรือผู้รับเหมา" value={searchDraft} onChange={e => setSearchDraft(e.target.value)} />{searchDraft && <button type="button" className="wp-icon-button" aria-label="ล้างการค้นหา" onClick={() => setSearchDraft("")}><X size={15} aria-hidden="true" /></button>}</label>
                  <select aria-label="กรองสถานะ" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="all">ทุกสถานะ</option>{Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  {hasFilters && <button className="wp-link wp-clear-filter" onClick={() => { setSearchDraft(""); setSearch(""); setFilter("all"); setQueue("all"); setPage(1); }}>ล้างตัวกรอง</button>}
                </div>
                <div className="wp-list-region" aria-busy={listBusy}>
                  {listBusy && <div className="wp-list-progress" role="status"><RefreshCw size={13} className="wp-spin" aria-hidden="true" />กำลังอัปเดตรายการ…</div>}
                  {!updatedAt ? <div className="wp-initial-list" role="status"><div className="wp-skeleton-row"/><div className="wp-skeleton-row"/><div className="wp-skeleton-row"/><span>กำลังโหลดใบอนุญาต…</span></div> : !permits.length ? <div className="wp-empty"><span className="wp-empty-symbol"><ClipboardCheck size={30} aria-hidden="true" /></span><h3>{hasFilters ? "ไม่พบรายการที่ตรงกับการค้นหา" : "เริ่มต้นใบอนุญาตงานแรก"}</h3><p>{hasFilters ? "ลองเปลี่ยนคำค้นหรือเลือกสถานะอื่น" : "เลือกประเภทงาน กรอกรายละเอียด และส่งให้ผู้เกี่ยวข้องตรวจทาน"}</p>{hasFilters ? <button className="wp-secondary" onClick={() => { setSearchDraft(""); setSearch(""); setFilter("all"); setQueue("all"); setPage(1); }}>แสดงทั้งหมด</button> : <button className="wp-secondary" onClick={create}><Plus size={16} aria-hidden="true" />เริ่มคำขอแรก</button>}{!templates.some(t => t.active) && <p className="wp-muted">ยังไม่มีแม่แบบเปิดใช้ · {canManage ? "ไปที่แม่แบบเอกสารเพื่อนำเข้าและตรวจทาน" : "ติดต่อผู้ดูแลเพื่อเปิดใช้แม่แบบ"}</p>}</div>
                    : <div className="wp-table-scroll"><table className="wp-permit-table"><caption className="wp-sr-only">ใบอนุญาตทำงาน {total} รายการ</caption><thead><tr><th scope="col">งาน / เลขอ้างอิง</th><th scope="col">พื้นที่และผู้ปฏิบัติงาน</th><th scope="col">ช่วงเวลา</th><th scope="col">สถานะ</th><th scope="col">เอกสาร</th></tr></thead><tbody>{permits.map(p => <tr key={p.id}><td data-label="งาน"><button className="wp-title-button" onClick={() => void open(p)}>{p.data.title}<ChevronRight size={15} aria-hidden="true" /></button><small>{p.id.slice(0, 8).toUpperCase()} <span>·</span> V{p.version}</small></td><td data-label="พื้นที่"><span className="wp-cell-location"><MapPin size={13} aria-hidden="true" />{p.data.location}</span><small>{p.data.contractorName}</small></td><td data-label="ช่วงเวลา">{dateTime(p.data.startsAt)}<small>ถึง {dateTime(p.data.endsAt)}</small></td><td data-label="สถานะ"><span className={`wp-status ${displayStatus(p)}`}><span className="wp-status-dot" />{STATUS_LABELS[displayStatus(p)]}</span></td><td data-label="เอกสาร"><span className="wp-doc-count"><FileText size={14} aria-hidden="true" />{p.data.forms.length} ฉบับ</span></td></tr>)}</tbody></table></div>}
                </div>
                <div className="wp-pagination"><span>{total ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, total)} จาก ${total} รายการ` : "0 รายการ"}</span><div><button className="wp-secondary" disabled={page <= 1 || listBusy} onClick={() => setPage(p => p - 1)}>หน้าก่อน</button><span>หน้า {page} / {Math.max(1, Math.ceil(total / 25))}</span><button className="wp-secondary" disabled={page * 25 >= total || listBusy} onClick={() => setPage(p => p + 1)}>หน้าถัดไป</button></div></div>
              </section>
              <footer className="wp-dashboard-footer"><span><ShieldCheck size={14} aria-hidden="true" />เปิดงานได้หลังเจ้าของพื้นที่ยืนยันความพร้อม</span>{updatedAt && <span><Check size={13} aria-hidden="true" />อัปเดต {updatedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>}</footer>
            </>}
        </main>
      </div>
    </div>
  );
}
