"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ClipboardCheck,
  FileText,
  Users,
  LayoutDashboard,
  Plus,
  ArrowLeft,
  ShieldCheck,
  Clock3,
  Search,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  displayStatus,
  STATUS_LABELS,
  type Permit,
  type PermitActor,
  type PermitTemplate,
} from "@/lib/permit/types";
import { dateTime, permitApi, type DirectoryEntry } from "./api";
import PermitEditor from "./PermitEditor";
import PermitDetail from "./PermitDetail";
import PermitSettings from "./PermitSettings";
import PermitLocationSettings from "./PermitLocationSettings";
type Tab = "dashboard" | "templates" | "people" | "locations";
export default function PermitApp() {
  const sp = useSearchParams();
  const auth = useAuth();
  const [actor, setActor] = useState<PermitActor | null>(null),
    [loading, setLoading] = useState(true),
    [company, setCompany] = useState(sp.get("company_id") || "amt"),
    [companies, setCompanies] = useState<
      { company_id: string; company_name: string }[]
    >([]);
  const [permits, setPermits] = useState<Permit[]>([]),
    [templates, setTemplates] = useState<PermitTemplate[]>([]),
    [directory, setDirectory] = useState<DirectoryEntry[]>([]),
    [tab, setTab] = useState<Tab>("dashboard"),
    [selected, setSelected] = useState<Permit | null>(null),
    [editing, setEditing] = useState(false),
    [copy, setCopy] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const [searchDraft,setSearchDraft]=useState(""),[page,setPage]=useState(1),[queue,setQueue]=useState("all"),[total,setTotal]=useState(0),[summary,setSummary]=useState<Record<string,number>>({});
  const requestId=useRef(0);
  const authEpoch=useRef(0);
  const loadedCompany=useRef("");
  useEffect(()=>{const timer=setTimeout(()=>{setSearch(searchDraft);setPage(1);},350);return()=>clearTimeout(timer);},[searchDraft]);
  const [mode, setMode] = useState<"staff" | "contractor">("staff"),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [loginBusy, setLoginBusy] = useState(false),
    [loginCompanies, setLoginCompanies] = useState<
      { companyId: string; companyName: string }[]
    >([]),
    [loginCompany, setLoginCompany] = useState("");
  const load = useCallback(async () => {
    const id=++requestId.current;
    const [p, t, d, a] = await Promise.all([
      permitApi<{ data: Permit[];total:number;summary:Record<string,number> }>(`permits?page=${page}&q=${encodeURIComponent(search)}&status=${filter}&queue=${queue}`, company),
      permitApi<{ data: PermitTemplate[] }>("templates", company),
      permitApi<{ data: DirectoryEntry[] }>("directory", company),
      permitApi<{ actor: PermitActor }>("session", company),
    ]);
    if(id!==requestId.current)return;
    setPermits(p.data);
    setTotal(p.total);setSummary(p.summary);
    setTemplates(t.data);
    setDirectory(d.data);
    setActor(a.actor);
  }, [company,page,search,filter,queue]);
  useEffect(() => {
    let live = true;
    const epoch=authEpoch.current;
    if(loadedCompany.current!==company)setLoading(true);
    permitApi<{ actor: PermitActor }>("session", company)
      .then(async (r) => {
        if (!live||epoch!==authEpoch.current) return;
        setActor(r.actor);
        if (!r.actor.admin && company !== r.actor.companyId) {
          setCompany(r.actor.companyId);
          return;
        }
        await load();
        loadedCompany.current=company;
        if (r.actor.admin) {
          const c = await permitApi<{ data: typeof companies }>(
            "companies",
            company,
          );
          if (live) setCompanies(c.data);
        }
        const id = sp.get("id");
        if (id) {
          const p = await permitApi<{ data: Permit }>(`permits/${id}`, company);
          if (live) setSelected(p.data);
        }
      })
      .catch((e) => {
        if (live&&epoch===authEpoch.current) {
          setActor(null);
          if (!e.message.includes("เข้าสู่ระบบ")) setError(e.message);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [company, load, sp]);
  useEffect(()=>{
    if(!actor||editing||selected||tab!=="dashboard")return;
    const refresh=()=>{if(document.visibilityState==='visible')void load().catch(e=>setError(e.message));};
    const timer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[Boolean(actor),editing,selected,tab,load]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setError("");
    try {
      await permitApi("session", company, "DELETE");
      if (mode === "staff") {
        const r = await auth.login(
          username,
          password,
          loginCompany || undefined,
        );
        if (r.needCompanySelection) {
          setLoginCompanies(r.companies || []);
          return;
        }
        if (!r.success) throw new Error(r.error || "เข้าสู่ระบบไม่สำเร็จ");
      } else
        await permitApi("session", company, "POST", { username, password });
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoginBusy(false);
    }
  }
  async function open(p: Permit) {
    setError("");
    try {
      const r = await permitApi<{ data: Permit }>(`permits/${p.id}`, company);
      setSelected(r.data);
      setEditing(false);
      setCopy(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function changed(p: Permit) {
    setSelected(p);
    setEditing(false);
    setCopy(false);
    void load().catch((e) => setError(e.message));
  }
  async function logout() {
    ++authEpoch.current;++requestId.current;loadedCompany.current="";
    try {
      await permitApi("session", company, "DELETE");
      if (!actor?.contractor) await auth.logout();
      setActor(null);
      setSelected(null);
      setPermits([]);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading)
    return (
      <div className="wp-loading">
        <ClipboardCheck size={42} />
        <p>กำลังเปิด Work Permit…</p>
      </div>
    );
  if (!actor)
    return (
      <div className="wp-login">
        <div className="wp-login-brand">
          <span className="wp-eyebrow">EA SAFETY & ENVIRONMENT</span>
          <h1>
            ทุกงานเริ่มต้น
            <br />
            ด้วยความพร้อม
          </h1>
          <p>
            ขออนุญาต ตรวจทาน และลงนาม
            <br />
            ครบในพื้นที่ทำงานเดียว
          </p>
          <ClipboardCheck size={100} />
        </div>
        <div className="wp-login-form">
          <a href="/" className="wp-back">
            <ArrowLeft size={16} />
            กลับหน้าเครื่องมือ
          </a>
          <h2>Work Permit</h2>
          <p>เข้าสู่ระบบใบอนุญาตทำงาน</p>
          <div className="wp-tabs">
            <button
              className={mode === "staff" ? "active" : ""}
              onClick={() => {
                setMode("staff");
                setLoginCompanies([]);
              }}
            >
              ผู้ดูแลระบบ SHE
            </button>
            <button
              className={mode === "contractor" ? "active" : ""}
              onClick={() => {
                setMode("contractor");
                setLoginCompanies([]);
              }}
            >
              ผู้ขออนุญาตทำงาน
            </button>
          </div>
          <form onSubmit={login}>
            <label>
              ชื่อผู้ใช้
              <input
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label>
              รหัสผ่าน
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {loginCompanies.length > 0 && (
              <label>
                เลือกบริษัท
                <select
                  value={loginCompany}
                  required
                  onChange={(e) => setLoginCompany(e.target.value)}
                >
                  <option value="">เลือกบริษัท</option>
                  {loginCompanies.map((c) => (
                    <option key={c.companyId} value={c.companyId}>
                      {c.companyName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {error && (
              <p role="alert" className="wp-error">
                {error}
              </p>
            )}
            <button disabled={loginBusy} className="wp-primary">
              {loginBusy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ Work Permit"}
            </button>
          </form>
          <p className="wp-muted">
            {mode === "contractor"
              ? "พนักงานแผนกอื่นหรือผู้รับเหมา ใช้บัญชี Work Permit ที่ผู้ดูแลจัดให้"
              : "จป.วิชาชีพ / เจ้าหน้าที่สิ่งแวดล้อม ใช้บัญชี EA SHE Tools"}
          </p>
        </div>
      </div>
    );
  const visible = permits;
  const canManage=actor.admin||actor.manager;
  return (
    <div className="wp-shell">
      <aside className="wp-sidebar wp-no-print">
        <a href="/" className="wp-brand">
          <span>E@</span>
          <div>
            SAFETY TOOLS<small>Energy Absolute</small>
          </div>
        </a>
        <div className="wp-module">
          <ClipboardCheck />
          <div>
            <strong>Work Permit</strong>
            <small>ระบบใบอนุญาตทำงาน</small>
          </div>
        </div>
        <nav aria-label="Work Permit">
          {[
            {
              id: "dashboard",
              label: "ภาพรวมและใบอนุญาต",
              icon: LayoutDashboard,
            },
            ...(canManage
              ? [
                  { id: "templates", label: "แม่แบบเอกสาร", icon: FileText },
                  { id: "people", label: "ผู้ใช้และผู้ลงนาม", icon: Users },
                  { id: "locations", label: "พื้นที่และผู้รับผิดชอบ", icon: ShieldCheck },
                ]
              : []),
          ].map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => {
                setTab(n.id as Tab);
                setSelected(null);
                setEditing(false);
              }}
            >
              <n.icon size={19} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="wp-sidebar-bottom">
          <ShieldCheck size={20} />
          <p>
            {actor.contractor
              ? "บัญชีผู้ขออนุญาตทำงาน"
              : "พื้นที่ทำงานของบริษัท"}
            <strong>{company.toUpperCase()}</strong>
          </p>
          {actor.expiresAt && (
            <small>หมดอายุ {dateTime(actor.expiresAt)}</small>
          )}
          <a href="/">← กลับหน้าเครื่องมือ</a>
        </div>
      </aside>
      <div className="wp-main">
        <header className="wp-topbar wp-no-print">
          <div className="wp-breadcrumb">
            Safety & Environment <span>/</span> Work Permit
          </div>
          <div className="wp-inline">
            {actor.admin ? (
              <select
                aria-label="บริษัทที่กำลังจัดการ"
                value={company}
                onChange={(e) => {
                  setSelected(null);
                  setEditing(false);
                  setCompany(e.target.value);
                  setError("");
                }}
              >
                {companies.length ? (
                  companies.map((c) => (
                    <option key={c.company_id} value={c.company_id}>
                      {c.company_name}
                    </option>
                  ))
                ) : (
                  <option value={company}>{company.toUpperCase()}</option>
                )}
              </select>
            ) : (
              <b>{company.toUpperCase()}</b>
            )}
            <span className="wp-user">{actor.name}</span>
            <button
              title="ออกจากระบบ"
              aria-label="ออกจากระบบ"
              onClick={() => void logout()}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="wp-content">
          {process.env.NEXT_PUBLIC_PERMIT_DEMO === "true" && (
            <div className="wp-notice wp-no-print">
              ระบบทดสอบในเครื่อง · ข้อมูลจำลอง ไม่ใช่ใบอนุญาตใช้งานจริง
            </div>
          )}
          {error && (
            <div role="alert" className="wp-error wp-no-print">
              {error}
              <button
                className="wp-link"
                onClick={() =>
                  void load()
                    .then(() => setError(""))
                    .catch((e) => setError(e.message))
                }
              >
                ลองโหลดใหม่
              </button>
            </div>
          )}
          {editing ? (
            <PermitEditor
              key={(selected?.id || "new") + String(copy)}
              actor={actor}
              company={company}
              templates={templates}
              directory={directory}
              initial={selected || undefined}
              copy={copy}
              onSaved={changed}
              onCancel={() => setEditing(false)}
            />
          ) : selected ? (
            <PermitDetail
              key={selected.id}
              permit={selected}
              actor={actor}
              company={company}
              onChanged={changed}
              onBack={() => setSelected(null)}
              onEdit={() => {
                setCopy(false);
                setEditing(true);
              }}
              onCopy={() => {
                setCopy(true);
                setEditing(true);
              }}
            />
          ) : tab === "locations" && canManage ? (
            <PermitLocationSettings key={company} company={company} directory={directory}/>
          ) : (tab === "templates" || tab === "people") && canManage ? (
            <PermitSettings
              key={company + tab}
              company={company}
              tab={tab}
              templates={templates}
              directory={directory}
              onRefresh={load}
              globalAdmin={actor.admin}
            />
          ) : (
            <>
              <section className="wp-hero">
                <div>
                  <span className="wp-eyebrow">PERMIT TO WORK</span>
                  <h1>
                    พร้อมก่อนเริ่มงาน
                    <br />
                    <em>มั่นใจในทุกขั้นตอน</em>
                  </h1>
                  <p>ติดตามคำขอ ผู้อนุมัติ และสถานะหน้างานของคุณ</p>
                  <button
                    className="wp-primary"
                    onClick={() => {
                      setSelected(null);
                      setEditing(true);
                      setCopy(false);
                    }}
                  >
                    <Plus size={18} />
                    สร้างคำขอใหม่
                  </button>
                </div>
                <div className="wp-hero-mark">
                  <ClipboardCheck size={94} strokeWidth={1.2} />
                  <span>REQUEST · REVIEW · WORK · CLOSE</span>
                </div>
              </section>
              {(!directory.some(m=>m.role==='area_owner')||!directory.some(m=>m.role==='safety'))&&(
                <div className="wp-notice" role="status">บริษัทนี้ยังไม่ได้กำหนดเจ้าของพื้นที่หรือผู้ตรวจความปลอดภัยครบ บันทึกร่างได้และต้องตั้งค่าผู้ลงนามก่อนส่งคำขอ {canManage&&<button className="wp-link" onClick={()=>setTab('people')}>ตั้งค่าผู้ลงนาม</button>}</div>
              )}
              {summary.due>0&&<div className="wp-notice" role="status">มีใบอนุญาตใกล้หมดอายุภายใน 2 ชั่วโมง {summary.due} ใบ <button className="wp-link" onClick={()=>{setQueue('due');setPage(1);}}>ดูรายการ</button></div>}
              <div className="wp-inline" aria-label="คิวงาน">
                {[["all","ทั้งหมด"],["mine",`รอฉันดำเนินการ (${summary.mine||0})`],["today","งานวันนี้"],["due","ใกล้หมดอายุ"],["closing",`รอปิดงาน (${summary.closing||0})`]].map(([key,label])=><button key={key} className={queue===key?'wp-primary':'wp-secondary'} onClick={()=>{setQueue(key);setPage(1);}}>{label}</button>)}
              </div>
              <div className="wp-stats">
                {[
                  { label: "รออนุมัติ", status: "submitted", icon: FileText },
                  {
                    label: "กำลังทำงาน",
                    status: "active",
                    icon: ClipboardCheck,
                  },
                  {
                    label: "พักงาน / หมดอายุ",
                    status: "attention",
                    icon: Clock3,
                  },
                  { label: "ปิดงานแล้ว", status: "closed", icon: ShieldCheck },
                ].map((s) => (
                  <div className="wp-stat" key={s.status}>
                    <s.icon size={22} />
                    <strong>
                      {
                        summary[s.status]||0
                      }
                    </strong>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
              <section className="wp-panel">
                <div className="wp-section-heading">
                  <div>
                    <h2>รายการใบอนุญาต</h2>
                    <p className="wp-muted">
                      พบ {total} รายการ · ค้นได้จากประวัติทั้งหมด
                    </p>
                  </div>
                  <button
                    className="wp-secondary"
                    onClick={() =>
                      void load().catch((e) => setError(e.message))
                    }
                  >
                    รีเฟรช
                  </button>
                </div>
                <div className="wp-filters">
                  <label className="wp-search">
                    <Search size={18} />
                    <input
                      aria-label="ค้นหาใบอนุญาต"
                      placeholder="ค้นหาชื่องาน พื้นที่ แผนก หรือบริษัทผู้รับเหมา"
                      value={searchDraft}
                      onChange={(e) => setSearchDraft(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="กรองสถานะ"
                    value={filter}
                    onChange={(e) => {setFilter(e.target.value);setPage(1);}}
                  >
                    <option value="all">ทุกสถานะ</option>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                {!visible.length ? (
                  <div className="wp-empty">
                    <ClipboardCheck size={42} />
                    <h3>
                      {permits.length
                        ? "ไม่พบรายการที่ตรงกับการค้นหา"
                        : "เริ่มต้นใบอนุญาตงานแรก"}
                    </h3>
                    <p>
                      เลือกแบบฟอร์ม ระบุรายละเอียดงาน
                      และส่งให้ผู้เกี่ยวข้องตรวจทาน
                    </p>
                    {!templates.some((t) => t.active) && (
                      <p>
                        ยังไม่มีแม่แบบเปิดใช้{" "}
                        {actor.admin
                          ? "ไปที่แม่แบบเอกสารเพื่อนำเข้าและตรวจทาน"
                          : "ติดต่อผู้ดูแลเพื่อเปิดใช้แม่แบบ"}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="wp-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>งาน / เลขอ้างอิง</th>
                          <th>พื้นที่และผู้ปฏิบัติงาน</th>
                          <th>ช่วงเวลา</th>
                          <th>สถานะ</th>
                          <th>เอกสาร</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <button
                                className="wp-title-button"
                                onClick={() => void open(p)}
                              >
                                {p.data.title}
                              </button>
                              <small>
                                {p.id.slice(0, 8).toUpperCase()} · V{p.version}
                              </small>
                            </td>
                            <td>
                              {p.data.location}
                              <small>{p.data.contractorName}</small>
                            </td>
                            <td>
                              {dateTime(p.data.startsAt)}
                              <small>ถึง {dateTime(p.data.endsAt)}</small>
                            </td>
                            <td>
                              <span className={`wp-status ${displayStatus(p)}`}>
                                {STATUS_LABELS[displayStatus(p)]}
                              </span>
                            </td>
                            <td>{p.data.forms.length} ฉบับ</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="wp-inline" style={{justifyContent:'space-between',marginTop:16}}>
                  <button className="wp-secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>หน้าก่อน</button>
                  <span>หน้า {page} / {Math.max(1,Math.ceil(total/25))}</span>
                  <button className="wp-secondary" disabled={page*25>=total} onClick={()=>setPage(p=>p+1)}>หน้าถัดไป</button>
                </div>
              </section>
              <p className="wp-footnote">
                การอนุมัติเอกสารและการตรวจหน้างานเป็นคนละขั้นตอน ·
                เปิดงานได้หลังเจ้าของพื้นที่ยืนยัน
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
