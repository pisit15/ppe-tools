'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, FileText } from 'lucide-react';
import {
  PRICE_BASIS_LABEL, PR_STATE_LABEL, type ProcPr, type ProcPrLine, type ProcPoLine, type ProcQuote, type ProcQuoteItem,
} from '@/lib/procurement/types';
import { offerComparison, offerCurrency, offerGroups, type OfferGroup } from '@/lib/procurement/offers';
import { Card, DRIVE_ROOT, ErrorBox, Kpi, Loading, PrLink, VIZ, VendorLink, baht, driveLink, int, thaiDate, useJson } from '../_components/ui';
import { ChartTitle, HBarList } from '../_components/charts';
import { usePeriodParam, withPeriod } from '../_components/period';

type Choice = Pick<ProcPr, 'pr_no' | 'requester' | 'company' | 'title' | 'request_date'>;
type DetailResp = { choices?: Choice[]; pr: ProcPr; lines: ProcPrLine[]; po: ProcPoLine[]; quotes: (ProcQuote & { selected: boolean; vendor_key: string })[]; items: ProcQuoteItem[] };
const TABS = [
  { id: 'overview', label: 'ภาพรวม' }, { id: 'items', label: 'รายการ' }, { id: 'quotes', label: 'ใบเสนอราคา' },
  { id: 'po', label: 'ใบสั่งซื้อ PO' }, { id: 'documents', label: 'เอกสาร' },
] as const;
const TAX_LABEL = { excluding_vat: 'ไม่รวม VAT', including_vat: 'รวม VAT', unknown: 'ยังไม่ทราบฐาน VAT' };
const money = (value: number | null, currency: string | null) => `${baht(value)}${value === null ? '' : ` ${currency || '(ไม่ระบุสกุลเงิน)'}`}`;
const groupLabel = (g: OfferGroup) => `${g.basis ? PRICE_BASIS_LABEL[g.basis] : 'ไม่ระบุฐานราคา'} · ${g.currency || 'ไม่ระบุสกุลเงิน'} · ${TAX_LABEL[g.taxBasis]}`;
const filename = (path: string) => path.split(/[\\/]/).pop() || path;

export function PrDetail({ no, by }: { no: string; by: string }) {
  const { data, error, loading } = useJson<DetailResp>(`/api/procurement/pr?no=${encodeURIComponent(no)}${by ? `&by=${encodeURIComponent(by)}` : ''}`);
  const sp = useSearchParams();
  const active = TABS.find(t => t.id === sp.get('tab'))?.id || 'overview';
  const y = usePeriodParam();
  const href = (tab: string) => {
    const query = new URLSearchParams(sp.toString());
    query.set('tab', tab);
    return `/procurement/pr?${query}`;
  };
  const back = <Link href={withPeriod('/procurement/pr', y)} className="inline-flex items-center gap-2 text-sm font-medium hover:underline" style={{ color: VIZ.primary }}><ArrowLeft size={16} />รายการ PR</Link>;
  if (error) return <div className="space-y-4">{back}<ErrorBox error={error} /></div>;
  if (loading || !data) return <div className="space-y-4">{back}<Loading /></div>;
  if (data.choices) return <div className="space-y-4">{back}<Card>
    <h2 className="font-semibold">เลือก PR ที่ต้องการ</h2><p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>เลข {no} มีในหลายบริษัท</p>
    <ul className="mt-3 divide-y divide-gray-100 text-sm">{data.choices.map(c => <li key={`${c.requester}|${c.company}`} className="py-3"><PrLink no={c.pr_no} by={c.requester} /> · {c.company}<p className="mt-1">{c.title}</p><p className="mt-1 text-xs" style={{ color: VIZ.lightText }}>{c.requester} · {thaiDate(c.request_date)}</p></li>)}</ul>
  </Card></div>;
  const { pr, lines, po, quotes, items } = data;
  const uniqueQuotes = quotes.filter(q => !q.duplicate_file);
  const vendors = new Set(uniqueQuotes.map(q => q.vendor_key || q.vendor_group || q.vendor).filter(Boolean));
  const { groups, mixed } = offerGroups(quotes);
  const comparableGroups = groups.filter(g => g.comparable);
  const count: Record<string, number | undefined> = { items: lines.length, quotes: quotes.length, po: new Set(po.map(p => p.po_no)).size, documents: pr.n_attachments };
  const itemsByQuote = new Map<number, ProcQuoteItem[]>();
  for (const item of items) itemsByQuote.set(item.quote_id, [...(itemsByQuote.get(item.quote_id) || []), item]);

  return <div className="space-y-6">
    {back}
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 max-w-4xl">
        <div className="flex flex-wrap items-center gap-3"><p className="text-sm font-semibold tracking-wide" style={{ color: VIZ.primary }}>{pr.pr_no}</p><span className="rounded-full border border-current px-2.5 py-1 text-xs font-medium" style={{ color: pr.state === 'rejected' ? VIZ.accent : pr.state === 'to_approve' ? VIZ.secondary : VIZ.primary }}>{PR_STATE_LABEL[pr.state]}</span></div>
        <h2 className="mt-3 text-xl font-semibold leading-snug tracking-tight md:text-2xl">{pr.title || pr.pr_no}</h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: VIZ.lightText }}>ผู้ขอซื้อ {pr.requester} · {pr.company} · {thaiDate(pr.request_date)}</p>
      </div>
      <a href={driveLink(pr.pr_no, pr.drive_folder_id)} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50" style={{ borderColor: VIZ.muted, color: VIZ.primary }}><FileText size={16} />เปิดเอกสารต้นฉบับ<ArrowUpRight size={16} /></a>
    </div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi label="ประมาณการใน PR" value={baht(pr.estimated_cost)} sub="ตามข้อมูลคำขอซื้อ" color={VIZ.text} />
      <Kpi label="ยอด PO ใน PR · ไม่รวม VAT" value={pr.po_count ? baht(pr.po_amount) : '–'} sub={pr.po_count ? `${int(pr.po_count)} ใบสั่งซื้อ` : 'ยังไม่พบใบสั่งซื้อ'} color={VIZ.primary} />
      <Kpi label="ใบเสนอราคาที่อ่านได้" value={int(uniqueQuotes.length)} sub={`${int(vendors.size)} ผู้ขาย · ไม่นับไฟล์ซ้ำ`} color={VIZ.text} />
      <Kpi label="เอกสารแนบใน PR" value={int(pr.n_attachments)} sub="จำนวนไฟล์ที่ระบบบันทึก" color={VIZ.text} />
    </div>

    <nav aria-label="ส่วนรายละเอียด PR" className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: VIZ.muted }}>
      {TABS.map(t => <Link key={t.id} href={href(t.id)} scroll={false} aria-current={active === t.id ? 'page' : undefined} className={`flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm ${active === t.id ? 'font-semibold' : 'font-medium'}`} style={{ borderColor: active === t.id ? VIZ.primary : 'transparent', color: active === t.id ? VIZ.primary : VIZ.lightText }}>{t.label}{count[t.id] !== undefined && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] tabular-nums" style={{ color: VIZ.lightText }}>{int(count[t.id])}</span>}</Link>)}
    </nav>

    {active === 'overview' && <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]">
      <Card><h3 className="font-semibold">ข้อมูลคำขอซื้อ</h3>
        <dl className="mt-5 grid gap-x-6 gap-y-5 text-sm sm:grid-cols-2">
          <Field label="ผู้ขอซื้อ" value={pr.requester} /><Field label="บริษัท" value={pr.company} />
          <Field label="หน่วยปฏิบัติการ" value={pr.operating_unit} /><Field label="ประเภทคำขอ" value={pr.request_type} />
          <Field label="วันที่ขอซื้อ" value={thaiDate(pr.request_date)} /><Field label="สถานะจาก Odoo" value={PR_STATE_LABEL[pr.state]} />
        </dl>
        <div className="mt-6 border-t border-slate-100 pt-5"><h4 className="text-sm font-medium">รายละเอียดและเหตุผล</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-7" style={{ color: VIZ.lightText }}>{pr.description || 'ไม่พบรายละเอียดเพิ่มเติมในข้อมูลที่นำเข้า'}</p></div>
      </Card>
      <div className="space-y-4">
        <Card><h3 className="font-semibold">หลักฐานใบเสนอราคา</h3><p className="mt-3 text-sm leading-6" style={{ color: VIZ.lightText }}>{uniqueQuotes.length === 0 ? 'ยังไม่พบใบเสนอราคาที่อ่านได้' : vendors.size < 2 ? `อ่านได้ ${int(uniqueQuotes.length)} ใบจาก ${int(vendors.size)} ผู้ขาย ยังไม่มีข้อมูลสำหรับเปรียบเทียบระหว่างผู้ขาย` : comparableGroups.length ? `มี ${int(comparableGroups.length)} กลุ่มที่ทราบฐานราคา สกุลเงิน และฐาน VAT ตรงกัน` : 'พบหลายผู้ขาย แต่ข้อมูลฐานราคา สกุลเงิน หรือฐาน VAT ยังไม่เพียงพอสำหรับเปรียบเทียบ'}</p><p className="mt-2 text-xs leading-5" style={{ color: VIZ.lightText }}>จำนวนที่อ่านได้ไม่ยืนยันว่าเอกสารครบทุกฉบับ ตรวจสเปก ปริมาณ และเงื่อนไขในต้นฉบับก่อนตัดสินใจ</p><Link href={href('quotes')} scroll={false} className="mt-4 inline-flex items-center gap-1 text-sm font-medium hover:underline" style={{ color: VIZ.primary }}>ตรวจใบเสนอราคา<ArrowUpRight size={15} /></Link></Card>
        <Card><h3 className="font-semibold">ผู้ขายที่พบใน PO</h3><p className="mt-3 text-sm leading-6">{pr.vendors || 'ยังไม่พบผู้ขายในใบสั่งซื้อ'}</p><p className="mt-2 break-words text-xs" style={{ color: VIZ.lightText }}>{pr.po_list || 'ยังไม่มีเลข PO'}</p><Link href={href('po')} scroll={false} className="mt-4 inline-flex items-center gap-1 text-sm font-medium hover:underline" style={{ color: VIZ.primary }}>ตรวจรายการใบสั่งซื้อ<ArrowUpRight size={15} /></Link></Card>
      </div>
    </div>}

    {active === 'items' && <Card className="!p-0 overflow-hidden">
      <SectionHeader title={`รายการใน PR (${int(lines.length)})`} sub="ราคาประมาณการจากคำขอซื้อ" />
      {lines.length === 0 ? <Empty text="ไม่พบรายการในข้อมูล PR นี้" /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead style={{ background: VIZ.bg }}><tr><Th>รายการ / รายละเอียด</Th><Th right>จำนวน</Th><Th right>ประมาณการต่อหน่วย</Th><Th right>ประมาณการรวม</Th></tr></thead><tbody>{lines.map(l => <tr key={l.odoo_id} className="border-t border-slate-100 align-top"><td className="min-w-72 px-4 py-4"><p className="font-medium">{l.name}</p>{l.product && l.product !== l.name && <p className="mt-1 text-xs" style={{ color: VIZ.lightText }}>{l.product}</p>}{l.specifications && <p className="mt-2 whitespace-pre-wrap text-xs leading-5" style={{ color: VIZ.lightText }}>{l.specifications}</p>}{(l.date_required || l.analytic_account) && <p className="mt-2 text-xs" style={{ color: VIZ.lightText }}>{l.date_required && `ต้องการวันที่ ${thaiDate(l.date_required)}`}{l.analytic_account && ` · ${l.analytic_account}`}</p>}</td><td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">{int(l.qty)} {l.uom}</td><td className="px-4 py-4 text-right tabular-nums">{baht(l.est_unit_price)}</td><td className="px-4 py-4 text-right font-medium tabular-nums">{baht(l.qty * l.est_unit_price)}</td></tr>)}</tbody></table></div>}
    </Card>}

    {active === 'quotes' && <div className="space-y-4">
      <Card><ChartTitle title="เปรียบเทียบจากใบเสนอราคาที่อ่านได้" sub="เปรียบเทียบเฉพาะผู้ขายต่างรายที่มีฐานราคา สกุลเงิน และฐาน VAT ตรงกัน" />
        {mixed && <p className="mb-4 text-sm leading-6" style={{ color: VIZ.lightText }}>แยก {int(groups.length)} กลุ่มตามข้อมูลในเอกสาร จึงไม่มีราคาต่ำสุดหรือส่วนต่างรวมข้ามกลุ่ม</p>}
        {groups.length === 0 ? <Empty text="ยังไม่พบยอดใบเสนอราคาที่อ่านได้สำหรับเปรียบเทียบ" /> : groups.map(g => <OfferEvidence key={g.key} group={g} />)}
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5" style={{ color: VIZ.lightText }}>ใช้ยอดต่ำสุดที่อ่านได้ต่อผู้ขายในแต่ละกลุ่ม ไม่นับไฟล์ซ้ำ · การพบชื่อผู้ขายใน PO ไม่ยืนยันว่าใช้ใบเสนอราคาฉบับนี้ และยอดรวมยังต้องตรวจสเปก ปริมาณ ส่วนลด และขอบเขตงานกับต้นฉบับ</p>
      </Card>
      <Card className="!p-0 overflow-hidden"><SectionHeader title="ใบเสนอราคาทั้งหมดที่อ่านได้" sub="เปิดแต่ละรายการเพื่อดูสินค้า เงื่อนไข และไฟล์อ้างอิง" />
        {quotes.length === 0 ? <Empty text="ยังไม่พบใบเสนอราคาในข้อมูลที่นำเข้า เปิดเอกสารต้นฉบับเพื่อตรวจสอบไฟล์แนบ" /> : <div className="divide-y divide-slate-100">{quotes.map(q => <details key={q.id} className="group px-4 py-4 md:px-6">
          <summary className="cursor-pointer text-sm"><span className="font-medium" style={{ color: VIZ.text }}>{q.vendor_group || q.vendor || 'ไม่ระบุผู้ขาย'}</span><span className="ml-3 text-xs" style={{ color: VIZ.lightText }}>{q.quote_no || 'ไม่มีเลขใบเสนอราคา'} · {thaiDate(q.quote_date)}</span>{q.selected && <span className="ml-2 rounded border px-2 py-0.5 text-xs" style={{ color: VIZ.primary, borderColor: VIZ.muted }}>พบผู้ขายใน PO</span>}{q.duplicate_file && <span className="ml-2 text-xs" style={{ color: VIZ.lightText }}>ไฟล์ซ้ำ · ไม่นับในการเปรียบเทียบ</span>}<span className="mt-2 block text-xs" style={{ color: VIZ.lightText }}>{q.price_basis ? PRICE_BASIS_LABEL[q.price_basis] : 'ไม่ระบุฐานราคา'} · {offerCurrency(q.currency) || 'ไม่ระบุสกุลเงิน'} · {int(itemsByQuote.get(q.id)?.length || 0)} รายการ</span></summary>
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg p-4 text-sm" style={{ background: VIZ.bg }}><QuoteAmount label="ก่อน VAT" value={q.subtotal} currency={q.currency} /><QuoteAmount label="ส่วนลดตามเอกสาร" value={q.discount} currency={q.currency} /><QuoteAmount label="VAT" value={q.vat} currency={q.currency} /><QuoteAmount label={q.vat === null ? 'ยอดรวม · ไม่ระบุฐาน VAT' : 'ยอดรวม VAT'} value={q.total} currency={q.currency} /></div>
            <div className="flex flex-wrap items-center gap-3 text-xs"><VendorLink name={q.vendor_group || q.vendor} /><span style={{ color: VIZ.lightText }}>{q.doc_type === 'comparison_table' ? 'อ่านจากตารางเทียบราคา' : 'อ่านจากเอกสารแนบ'}{q.customer && ` · ลูกค้า ${q.customer}`}</span></div>
            {(itemsByQuote.get(q.id) || []).length > 0 ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead style={{ background: VIZ.bg }}><tr><Th>รายการ / สเปก</Th><Th right>จำนวน</Th><Th right>ราคาต่อหน่วย</Th><Th right>ยอดรายการ</Th></tr></thead><tbody>{(itemsByQuote.get(q.id) || []).map(item => <tr key={item.id} className="border-t border-slate-100 align-top"><td className="min-w-60 px-4 py-3">{item.name}{item.spec && <p className="mt-1" style={{ color: VIZ.lightText }}>{item.spec}</p>}{item.check_note && <p className="mt-1" style={{ color: VIZ.secondary }}>{item.check_note}</p>}</td><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{int(item.qty)} {item.unit}</td><td className="px-4 py-3 text-right tabular-nums">{baht(item.unit_price)}</td><td className="px-4 py-3 text-right tabular-nums">{baht(item.amount)}</td></tr>)}</tbody></table></div> : <p className="text-xs" style={{ color: VIZ.lightText }}>ไม่พบรายละเอียดสินค้าในข้อมูลที่อ่านได้</p>}
            {q.notes && <p className="whitespace-pre-wrap text-xs leading-6" style={{ color: VIZ.lightText }}>{q.notes}</p>}
            {q.file_path && <p className="break-all text-xs" style={{ color: VIZ.lightText }}>ไฟล์อ้างอิง: {filename(q.file_path)}</p>}
          </div>
        </details>)}</div>}
      </Card>
    </div>}

    {active === 'po' && <Card className="!p-0 overflow-hidden"><SectionHeader title={`รายการตามใบสั่งซื้อ (${int(po.length)})`} sub="ราคาและยอดรายการไม่รวม VAT · สถานะใบสั่งซื้อไม่ใช่หลักฐานการชำระเงิน" />
      {po.length === 0 ? <Empty text="ยังไม่พบรายการ PO ในข้อมูลที่นำเข้า" /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead style={{ background: VIZ.bg }}><tr><Th>PO / วันที่</Th><Th>ผู้ขาย</Th><Th>รายการ</Th><Th right>จำนวน</Th><Th right>ราคาต่อหน่วย</Th><Th right>ยอดรายการ</Th></tr></thead><tbody>{po.map(l => <tr key={l.odoo_id} className="border-t border-slate-100 align-top" style={l.po_state === 'cancel' ? { color: VIZ.lightText, background: VIZ.bg } : undefined}><td className="whitespace-nowrap px-4 py-4 font-medium">{l.po_no}<p className="mt-1 text-xs font-normal" style={{ color: VIZ.lightText }}>{thaiDate(l.order_date)}</p>{l.po_state === 'cancel' && <span className="mt-2 inline-block text-xs" style={{ color: VIZ.accent }}>ยกเลิก</span>}</td><td className="min-w-44 px-4 py-4"><VendorLink name={l.vendor} /></td><td className="min-w-60 whitespace-pre-line px-4 py-4">{l.item}</td><td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">{int(l.qty)} {l.uom}</td><td className="whitespace-nowrap px-4 py-4 text-right tabular-nums">{money(l.unit_price, offerCurrency(l.currency))}</td><td className="whitespace-nowrap px-4 py-4 text-right font-medium tabular-nums">{money(l.subtotal, offerCurrency(l.currency))}</td></tr>)}</tbody></table></div>}
    </Card>}

    {active === 'documents' && <div className="space-y-4"><Card><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="font-semibold">เอกสารต้นฉบับใน Google Drive</h3><p className="mt-2 text-sm leading-6" style={{ color: VIZ.lightText }}>PR นี้บันทึกไฟล์แนบ {int(pr.n_attachments)} ไฟล์ เอกสารที่อ่านได้ด้านล่างอาจไม่ครอบคลุมทุกไฟล์</p></div><a href={driveLink(pr.pr_no, pr.drive_folder_id)} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: VIZ.primary }}>เปิดไฟล์แนบ<ArrowUpRight size={16} /></a></div><a href={DRIVE_ROOT} target="_blank" rel="noreferrer" className="mt-4 inline-block text-xs hover:underline" style={{ color: VIZ.lightText }}>เปิดโฟลเดอร์รวม Odoo PR</a></Card>
      <Card className="!p-0 overflow-hidden"><SectionHeader title="ไฟล์อ้างอิงของใบเสนอราคาที่อ่านได้" />{quotes.length === 0 ? <Empty text="ยังไม่มีข้อมูลไฟล์ใบเสนอราคาที่อ่านได้" /> : <ul className="divide-y divide-slate-100">{quotes.map(q => <li key={q.id} className="flex items-start gap-3 px-4 py-4 md:px-6"><FileText size={18} className="mt-1 shrink-0" style={{ color: VIZ.lightText }} /><div className="min-w-0"><p className="break-all text-sm font-medium">{q.file_path ? filename(q.file_path) : 'ไม่ระบุชื่อไฟล์'}</p><p className="mt-1 text-xs leading-5" style={{ color: VIZ.lightText }}>{q.vendor_group || q.vendor || 'ไม่ระบุผู้ขาย'} · {q.quote_no || 'ไม่ระบุเลขใบเสนอราคา'}{q.duplicate_file && ' · ไฟล์ซ้ำ'}</p></div></li>)}</ul>}</Card>
    </div>}
  </div>;
}

function Field({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs" style={{ color: VIZ.lightText }}>{label}</dt><dd className="mt-1.5 font-medium">{value || 'ไม่ระบุ'}</dd></div>; }
function Empty({ text }: { text: string }) { return <p className="px-4 py-10 text-center text-sm leading-6" style={{ color: VIZ.lightText }}>{text}</p>; }
function SectionHeader({ title, sub }: { title: string; sub?: string }) { return <div className="px-4 py-5 md:px-6"><h3 className="font-semibold">{title}</h3>{sub && <p className="mt-1 text-xs leading-5" style={{ color: VIZ.lightText }}>{sub}</p>}</div>; }
function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) { return <th scope="col" className={`whitespace-nowrap px-4 py-3 text-xs font-medium ${right ? 'text-right' : 'text-left'}`} style={{ color: VIZ.lightText }}>{children}</th>; }
function QuoteAmount({ label, value, currency }: { label: string; value: number | null; currency: string }) { return <div><p className="text-xs" style={{ color: VIZ.lightText }}>{label}</p><p className="mt-1 font-medium tabular-nums">{money(value, offerCurrency(currency))}</p></div>; }

function OfferEvidence({ group }: { group: OfferGroup }) {
  const comparison = offerComparison(group);
  const lowest = comparison?.lowest[0];
  return <section className="mt-4 rounded-lg border border-slate-200 p-4">
    <h4 className="text-sm font-semibold">{groupLabel(group)}</h4>
    {comparison && lowest ? <>
      <p className="mt-2 text-xs leading-5" style={{ color: VIZ.lightText }}>ยอดต่ำสุดในกลุ่มใบเสนอราคาที่อ่านได้จาก {int(comparison.vendorCount)} ผู้ขาย: {comparison.lowest.map(o => o.name).join(', ')} · {money(lowest.value, group.currency)}</p>
      <div className="mt-4"><HBarList ariaLabel={`ยอดใบเสนอราคาที่อ่านได้ ${groupLabel(group)}`} rows={group.offers.map(o => ({ key: o.key, label: <VendorLink name={o.name} />, value: o.value, display: money(o.value, group.currency), highlight: o.selected, color: o.selected ? VIZ.primary : '#BAC8C1', note: [o.value === lowest.value ? 'ต่ำสุดในกลุ่มนี้' : `+${Math.round((o.value - lowest.value) / lowest.value * 100)}% จากต่ำสุดในกลุ่ม`, o.selected ? 'พบผู้ขายใน PO' : ''].filter(Boolean).join(' · ') }))} /></div>
    </> : <>
      <p className="mt-2 text-xs leading-5" style={{ color: VIZ.lightText }}>{group.offers.length < 2 ? 'มีผู้ขายเพียง 1 รายในกลุ่มนี้ จึงยังไม่สรุปราคาต่ำสุด' : 'ข้อมูลฐานราคา สกุลเงิน ฐาน VAT หรือผู้ขายยังไม่ครบ จึงไม่จัดอันดับราคา'}</p>
      <ul className="mt-3 divide-y divide-slate-100 text-sm">{group.offers.map(o => <li key={o.key} className="flex flex-wrap justify-between gap-2 py-2"><span><VendorLink name={o.name} />{o.selected && <span className="ml-2 text-xs" style={{ color: VIZ.lightText }}>พบผู้ขายใน PO</span>}</span><span className="tabular-nums">{money(o.value, group.currency)}</span></li>)}</ul>
    </>}
  </section>;
}
