// Chemical registry (tools.eashe.org/chemical) for the LINE bot: search, list and SDS detail cards.
// Pure (no I/O). bot.ts loads the rows for the account's company scope and re-checks every tap.
import type { ChemCompanySettings, ChemSubstance, FirstAid } from '../types';
import { GHS_PICTOGRAMS, H_STATEMENTS, ghsPictogram } from '../chemical/ghs';
import { storageClassDef } from '../chemical/storage-classes';
import { sdsState } from '../chemical/data-quality';
import { publicSdsUrl } from '../chemical/label';
import { C, flex, header, pill, type Json, type LineMessage } from './flex';
import { postbackAction } from './browse';

export const CHEM_PAGE_SIZE = 10;
const SITE = 'https://tools.eashe.org';
const CHEM_COLOR = '#0F766E';

/** Fields the bot needs (no import receipts, no internal provenance). */
export const CHEM_SELECT =
  'id, company_id, name, chemical_name, cas_no, un_no, supplier, document_code, physical_state, ghs_pictograms, signal_word, h_codes, storage_class, storage_location, ppe_required, first_aid, fire_fighting, spill_response, emergency_contact, sds_url, sds_file_path, sds_revision_date, components, review_status, is_active, chem_storage_areas!chem_substances_area_company_fk(id, name)';

export type ChemRow = Pick<
  ChemSubstance,
  | 'id'
  | 'company_id'
  | 'name'
  | 'chemical_name'
  | 'cas_no'
  | 'un_no'
  | 'supplier'
  | 'document_code'
  | 'physical_state'
  | 'ghs_pictograms'
  | 'signal_word'
  | 'h_codes'
  | 'storage_class'
  | 'storage_location'
  | 'ppe_required'
  | 'first_aid'
  | 'fire_fighting'
  | 'spill_response'
  | 'emergency_contact'
  | 'sds_url'
  | 'sds_file_path'
  | 'sds_revision_date'
  | 'components'
  | 'review_status'
  | 'chem_storage_areas'
>;
export type ChemPolicy = Pick<ChemCompanySettings, 'company_id' | 'sds_review_years' | 'sds_review_policy'>;

/* ---------- Search ---------- */

/** Typed hazard words → a test on the substance (so "ไวไฟ" finds every GHS02 product). */
const HAZARD_WORDS: { words: string[]; test: (s: ChemRow) => boolean; label: string }[] = [
  { words: ['ไวไฟ', 'ติดไฟ', 'flammable'], test: s => has(s, 'GHS02') || /^(2B|3A|3B|4\.1B|4\.2|4\.3)$/.test(s.storage_class || ''), label: 'ไวไฟ' },
  { words: ['ระเบิด', 'explosive'], test: s => has(s, 'GHS01'), label: 'ระเบิดได้' },
  { words: ['ออกซิไดส์', 'oxidizer', 'oxidizing'], test: s => has(s, 'GHS03'), label: 'ออกซิไดส์' },
  { words: ['ก๊าซ', 'แก๊ส', 'gas'], test: s => has(s, 'GHS04') || s.physical_state === 'gas', label: 'ก๊าซ' },
  { words: ['กัดกร่อน', 'corrosive'], test: s => has(s, 'GHS05'), label: 'กัดกร่อน' },
  { words: ['พิษ', 'เป็นพิษ', 'toxic'], test: s => has(s, 'GHS06'), label: 'เป็นพิษ' },
  { words: ['ระคายเคือง', 'irritant'], test: s => has(s, 'GHS07'), label: 'ระคายเคือง' },
  { words: ['มะเร็ง', 'สุขภาพ', 'carcinogen'], test: s => has(s, 'GHS08'), label: 'อันตรายต่อสุขภาพ' },
  { words: ['สิ่งแวดล้อม', 'environment'], test: s => has(s, 'GHS09'), label: 'สิ่งแวดล้อม' },
  { words: ['อันตราย', 'danger'], test: s => s.signal_word === 'Danger', label: 'อันตราย (Danger)' },
  { words: ['สเปรย์', 'aerosol'], test: s => s.physical_state === 'aerosol' || s.storage_class === '2B', label: 'สเปรย์' },
];
const DUE_WORDS = ['ครบทบทวน', 'ทบทวน', 'หมดอายุ', 'sdsเก่า'];

/** Thai ↔ English words for products registered under English trade names (and the reverse). */
const ALIAS_GROUPS: string[][] = [
  ['ทินเนอร์', 'thinner'],
  ['แอลกอฮอล์', 'alcohol', 'ethanol', 'เอทานอล', 'isopropyl', 'ไอโซโพรพิล', 'ipa'],
  ['เมทานอล', 'methanol'],
  ['อะซิโตน', 'acetone'],
  ['โทลูอีน', 'toluene'],
  ['ไซลีน', 'xylene'],
  ['กรด', 'acid'],
  ['ด่าง', 'โซดาไฟ', 'hydroxide', 'ไฮดรอกไซด์', 'caustic'],
  ['กำมะถัน', 'ซัลฟิวริก', 'sulfuric', 'sulphuric'],
  ['สี', 'paint', 'coat', 'basecoat', 'lacquer', 'แลคเกอร์'],
  ['สีรองพื้น', 'ไพรเมอร์', 'primer'],
  ['สีโป๊ว', 'พุตตี้', 'putty'],
  ['ตัวเร่ง', 'ฮาร์ดเดนเนอร์', 'hardener', 'catalyst'],
  ['น้ำมัน', 'oil', 'diesel', 'ดีเซล', 'lubricant', 'หล่อลื่น'],
  ['จาระบี', 'grease'],
  ['เบนซิน', 'gasoline', 'benzine'],
  ['กาว', 'adhesive', 'glue', 'sealant'],
  ['น้ำยาทำความสะอาด', 'ทำความสะอาด', 'cleaner', 'cleaning', 'degreaser'],
  ['น้ำยาลอกสี', 'remover', 'stripper'],
  ['ขัดเงา', 'ยาขัด', 'polish', 'compound'],
  ['ออกซิเจน', 'oxygen'],
  ['อาร์กอน', 'argon'],
  ['ไนโตรเจน', 'nitrogen'],
  ['คาร์บอนไดออกไซด์', 'co2', 'carbon dioxide'],
  ['แอมโมเนีย', 'ammonia'],
  ['คลอรีน', 'chlorine', 'hypochlorite'],
  ['เปอร์ออกไซด์', 'peroxide'],
  ['ลวดเชื่อม', 'เชื่อม', 'welding', 'aws'],
  ['ซิลิโคน', 'silicone'],
  ['บัฟเฟอร์', 'buffer'],
  ['ไฟเบอร์กลาส', 'fiberglass', 'fibreglass'],
];
const ALIASES = new Map<string, string[]>();
for (const g of ALIAS_GROUPS) for (const w of g) ALIASES.set(w, g);
/** The token itself plus its Thai/English equivalents. */
export function tokenTerms(t: string): string[] {
  const key = t.toLowerCase().normalize('NFC');
  const group = ALIASES.get(key);
  // Short aliases ("ipa", "co2", "สี") hide inside other words; use them only when typed.
  return group ? Array.from(new Set([key, ...group.filter(w => [...w].length >= 4)])) : [t];
}

function has(s: ChemRow, code: string) {
  return (s.ghs_pictograms || []).includes(code as never);
}
const norm = (v: string) => v.toLowerCase().normalize('NFC');
const compact = (v: string) => norm(v).replace(/[\s\-–._/]/g, '');

function haystack(s: ChemRow): { text: string; tight: string } {
  const parts = [
    s.name,
    s.chemical_name,
    s.cas_no,
    s.un_no ? `un${s.un_no} ${s.un_no}` : '',
    s.supplier,
    s.document_code,
    s.company_id,
    s.storage_location,
    s.chem_storage_areas?.name,
    ...(s.components || []).flatMap(c => [c.name, c.cas_no]),
  ]
    .filter(Boolean)
    .join(' ');
  return { text: norm(parts), tight: compact(parts) };
}

export function searchTokens(q: string): string[] {
  return q
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 6);
}

/**
 * Every token must match: in the names/CAS/UN/supplier/components/storage text,
 * or as a hazard word ("ไวไฟ", "กัดกร่อน", "อันตราย") or "ครบทบทวน" (SDS due for review).
 * Ranked: name starts with the query, name contains it, then the rest; alphabetical within.
 */
export function searchChemicals(rows: ChemRow[], query: string, policies: Record<string, ChemPolicy | undefined> = {}, today = new Date()): ChemRow[] {
  const tokens = searchTokens(query);
  if (!tokens.length) return [...rows].sort(byName);
  const hits = rows.filter(s => {
    const h = haystack(s);
    return tokens.every(t => {
      const n = norm(t);
      if (tokenTerms(t).some(term => h.text.includes(norm(term)))) return true;
      const tight = compact(t);
      if (tight.length >= 3 && h.tight.includes(tight)) return true;
      const hz = HAZARD_WORDS.find(x => x.words.includes(n));
      if (hz) return hz.test(s);
      if (DUE_WORDS.includes(tight)) return sdsState(s as ChemSubstance, policies[s.company_id] as ChemCompanySettings | undefined, today) === 'due';
      return false;
    });
  });
  const q = norm(tokens.join(' '));
  const rank = (s: ChemRow) => (norm(s.name).startsWith(q) ? 0 : norm(s.name).includes(q) ? 1 : 2);
  return hits.sort((a, b) => rank(a) - rank(b) || byName(a, b));
}
const byName = (a: ChemRow, b: ChemRow) => a.name.localeCompare(b.name, 'th');

/* ---------- Shared bits ---------- */

const ghsImg = (code: string) => `${SITE}/ghs/${code}.png`;
const sdsLink = (s: ChemRow) => (s.sds_file_path || s.sds_url ? publicSdsUrl(s.id) : null);
const webLink = (s: ChemRow) => `${SITE}/chemical/${encodeURIComponent(s.id)}/poster`;
const thaiDate = (d?: string | null) => {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])}/${Number(m[2])}/${Number(m[1]) + 543}` : '';
};

function signalPill(s: ChemRow): Json | null {
  if (s.signal_word === 'Danger') return pill('อันตราย', C.danger, C.dangerBg);
  if (s.signal_word === 'Warning') return pill('ระวัง', C.warn, C.warnBg);
  return null;
}

function pictos(codes: string[], size: string): Json[] {
  return codes
    .filter(c => ghsPictogram(c))
    .slice(0, 5)
    .map(c => ({ type: 'image', url: ghsImg(c), size, aspectRatio: '1:1', aspectMode: 'fit', flex: 0 }) as Json);
}

/* ---------- Cards ---------- */

export const CHEM_EXAMPLES = ['ไวไฟ', 'กัดกร่อน', 'อันตราย', 'ทินเนอร์', 'ครบทบทวน'];

/** "สารเคมี" with no words: counts for the account's scope + how to search. */
export function chemSummaryCard(rows: ChemRow[], scopeName: string, policies: Record<string, ChemPolicy | undefined> = {}, today = new Date()): LineMessage {
  const count = (f: (s: ChemRow) => boolean) => rows.filter(f).length;
  const due = count(s => sdsState(s as ChemSubstance, policies[s.company_id] as ChemCompanySettings | undefined, today) === 'due');
  const policySet = rows.some(s => policies[s.company_id]?.sds_review_years);
  const stat = (label: string, value: number, color: string, query: string): Json => ({
    type: 'box',
    layout: 'vertical',
    flex: 1,
    paddingAll: '8px',
    backgroundColor: '#F3F7F7',
    cornerRadius: '8px',
    action: { type: 'message', label: label.slice(0, 20), text: `สารเคมี ${query}`.trim() },
    contents: [
      { type: 'text', text: value.toLocaleString('en-US'), size: 'xl', weight: 'bold', color, align: 'center' },
      { type: 'text', text: label, size: 'xxs', color: C.sub, align: 'center', wrap: true },
    ],
  });
  return flex(`สารเคมี ${scopeName}: ${rows.length} รายการ`, {
    type: 'bubble',
    size: 'mega',
    header: header('ทะเบียนสารเคมี · SDS', scopeName, CHEM_COLOR),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          contents: [
            stat('ทั้งหมด', rows.length, CHEM_COLOR, 'ทั้งหมด'),
            stat('อันตราย (Danger)', count(s => s.signal_word === 'Danger'), C.danger, 'อันตราย'),
            stat('ไวไฟ', count(HAZARD_WORDS[0].test), C.warn, 'ไวไฟ'),
          ],
        },
        ...(policySet
          ? [
              {
                type: 'box',
                layout: 'horizontal',
                spacing: 'sm',
                margin: 'sm',
                contents: [stat('SDS ครบรอบทบทวน', due, due ? C.danger : C.ok, 'ครบทบทวน'), stat('กัดกร่อน', count(HAZARD_WORDS[4].test), C.text, 'กัดกร่อน')],
              } as Json,
            ]
          : []),
        { type: 'text', text: 'ค้นหา: พิมพ์ "สารเคมี" ตามด้วยชื่อ, CAS, UN หรือชื่อผู้ผลิต', size: 'sm', color: C.text, wrap: true, margin: 'lg' },
        { type: 'text', text: 'สารเคมี ทินเนอร์', size: 'md', weight: 'bold', color: CHEM_COLOR, margin: 'sm' },
        { type: 'text', text: 'พิมพ์ประเภทอันตรายได้ เช่น ไวไฟ กัดกร่อน เป็นพิษ อันตราย', size: 'xs', color: C.faint, wrap: true, margin: 'sm' },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'เปิดทะเบียนบนเว็บ', uri: `${SITE}/chemical` } }],
    },
  });
}

function listRow(s: ChemRow, showCompany: boolean): Json {
  const sub = [s.chemical_name && s.chemical_name !== s.name ? s.chemical_name : '', s.cas_no ? `CAS ${s.cas_no}` : '', showCompany ? s.company_id.toUpperCase() : '']
    .filter(Boolean)
    .join(' · ');
  const sp = signalPill(s);
  const icons = pictos(s.ghs_pictograms || [], '22px');
  return {
    type: 'box',
    layout: 'vertical',
    paddingTop: '10px',
    paddingBottom: '10px',
    action: postbackAction(s.name, { a: 'chem', c: s.company_id, id: s.id }, `SDS ${s.name}`),
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        alignItems: 'center',
        contents: [{ type: 'text', text: s.name, size: 'sm', weight: 'bold', color: C.text, wrap: true, maxLines: 2, flex: 1 }, ...(sp ? [sp] : []), { type: 'text', text: '›', size: 'sm', color: C.faint, flex: 0 }],
      },
      ...(sub ? [{ type: 'text', text: sub, size: 'xxs', color: C.faint, wrap: true, maxLines: 2, margin: 'xs' } as Json] : []),
      ...(icons.length ? [{ type: 'box', layout: 'horizontal', spacing: 'xs', margin: 'sm', contents: icons } as Json] : []),
    ],
  };
}

/** Search results; page is 1-based. Paging buttons resend "สารเคมี <q> หน้า N". */
export function chemListCard(hits: ChemRow[], query: string, page: number, scopeName: string, showCompany: boolean): LineMessage {
  const total = hits.length;
  const pages = Math.max(1, Math.ceil(total / CHEM_PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  const shown = query.trim() || 'ทั้งหมด';
  if (!total) {
    return flex(`ไม่พบสารเคมี "${shown}"`, {
      type: 'bubble',
      size: 'mega',
      header: header(`สารเคมี · ${scopeName}`, `ไม่พบ "${shown.slice(0, 40)}"`, CHEM_COLOR),
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'ลองพิมพ์ชื่อสั้นลง เลข CAS / UN ชื่อผู้ผลิต หรือประเภทอันตราย เช่น "ไวไฟ"', size: 'sm', color: C.sub, wrap: true },
          { type: 'text', text: 'ถ้ายังไม่มีในทะเบียน แจ้งผู้ดูแลสารเคมีให้เพิ่มพร้อมไฟล์ SDS', size: 'xs', color: C.faint, wrap: true, margin: 'md' },
        ],
      },
      footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'เปิดทะเบียนบนเว็บ', uri: `${SITE}/chemical` } }] },
    });
  }
  const rows = hits.slice((p - 1) * CHEM_PAGE_SIZE, p * CHEM_PAGE_SIZE);
  const base = query.trim() ? `สารเคมี ${query.trim()}` : 'สารเคมี ทั้งหมด';
  const nav: Json[] = [];
  if (p > 1) nav.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '‹ ก่อนหน้า', text: `${base} หน้า ${p - 1}` } });
  if (p < pages) nav.push({ type: 'button', style: 'primary', color: CHEM_COLOR, height: 'sm', action: { type: 'message', label: 'ถัดไป ›', text: `${base} หน้า ${p + 1}` } });
  return flex(`สารเคมี "${shown}": ${total} รายการ`, {
    type: 'bubble',
    size: 'giga',
    header: header(`สารเคมี · ${scopeName} · พบ ${total.toLocaleString('en-US')} รายการ`, `"${shown.slice(0, 40)}"`, CHEM_COLOR),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'แตะชื่อเพื่อดูอันตราย PPE การปฐมพยาบาล และเปิด SDS', size: 'xxs', color: C.faint, wrap: true },
        ...rows.flatMap((r, k) => (k === 0 ? [listRow(r, showCompany)] : [{ type: 'separator' } as Json, listRow(r, showCompany)])),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: `หน้า ${p} / ${pages}`, size: 'xxs', color: C.faint, align: 'center' },
        ...(nav.length ? [{ type: 'box', layout: 'horizontal', spacing: 'sm', contents: nav } as Json] : []),
      ],
    },
  });
}

const section = (title: string, body: Json[]): Json[] =>
  body.length ? [{ type: 'separator', margin: 'lg' }, { type: 'text', text: title, size: 'sm', weight: 'bold', color: CHEM_COLOR, margin: 'lg' }, ...body] : [];
const line = (label: string, value?: string | null, maxLines = 8): Json[] =>
  value && value.trim()
    ? [
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          margin: 'sm',
          contents: [
            { type: 'text', text: label, size: 'xs', color: C.faint, flex: 2, wrap: true },
            { type: 'text', text: value.trim().slice(0, 400), size: 'xs', color: C.text, flex: 5, wrap: true, maxLines },
          ],
        },
      ]
    : [];

const FIRST_AID: [keyof FirstAid, string][] = [
  ['eye', '👁️ เข้าตา'],
  ['skin', '✋ สัมผัสผิว'],
  ['inhalation', '👃 สูดดม'],
  ['ingestion', '👄 กลืนกิน'],
];

/** One substance: hazards, PPE, first aid, fire/spill, storage, SDS. */
export function chemDetailCard(s: ChemRow, companyName: string, policy?: ChemPolicy, today = new Date()): LineMessage {
  const color = s.signal_word === 'Danger' ? C.danger : s.signal_word === 'Warning' ? C.warn : CHEM_COLOR;
  const codes = (s.ghs_pictograms || []).filter(c => ghsPictogram(c));
  const hazards: Json[] = [];
  if (codes.length)
    hazards.push({
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      margin: 'md',
      contents: codes.slice(0, 5).map(
        c =>
          ({
            type: 'box',
            layout: 'vertical',
            flex: 0,
            width: '56px',
            contents: [
              { type: 'image', url: ghsImg(c), size: '48px', aspectRatio: '1:1', aspectMode: 'fit' },
              { type: 'text', text: GHS_PICTOGRAMS.find(p => p.code === c)!.nameTh, size: 'xxs', color: C.sub, wrap: true, align: 'center', maxLines: 2 },
            ],
          }) as Json,
      ),
    });
  const hs = [...new Set((s.h_codes || []).map(h => h.trim().toUpperCase()))].slice(0, 6);
  const moreH = new Set((s.h_codes || []).map(h => h.trim().toUpperCase())).size - hs.length;
  for (const h of hs) hazards.push({ type: 'text', text: `• ${h} ${H_STATEMENTS[h] || ''}`.trim(), size: 'xs', color: C.text, wrap: true, margin: 'sm' });
  if (moreH > 0) hazards.push({ type: 'text', text: `และอีก ${moreH} ข้อใน SDS`, size: 'xxs', color: C.faint, margin: 'sm' });
  if (!hazards.length) hazards.push({ type: 'text', text: 'ไม่มีรูปสัญลักษณ์ GHS ในข้อมูล (ตรวจสอบใน SDS)', size: 'xs', color: C.faint, wrap: true, margin: 'sm' });

  const ppe = (s.ppe_required || []).filter(Boolean);
  const fa = s.first_aid || {};
  const firstAid = FIRST_AID.flatMap(([k, label]) => line(label, fa[k]));
  const cls = storageClassDef(s.storage_class);
  const storage = [
    ...line('ประเภท กรอ.', cls ? `${cls.code} ${cls.nameTh}` : null),
    ...line('พื้นที่', [s.chem_storage_areas?.name, s.storage_location].filter(Boolean).join(' · ') || null),
  ];
  const state = sdsState(s as ChemSubstance, policy as ChemCompanySettings | undefined, today);
  const sdsInfo = [
    ...line('ฉบับวันที่', thaiDate(s.sds_revision_date) || 'ไม่ระบุ'),
    ...(state === 'due' ? [{ type: 'text', text: '⚠️ SDS ครบรอบทบทวนแล้ว ควรขอฉบับใหม่จากผู้ผลิต', size: 'xs', color: C.danger, wrap: true, margin: 'sm' } as Json] : []),
  ];
  const sds = sdsLink(s);

  return flex(`SDS ${s.name}`, {
    type: 'bubble',
    size: 'giga',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: color,
      paddingAll: '16px',
      contents: [
        { type: 'text', text: `สารเคมี · ${companyName}`, size: 'xs', color: '#FFFFFFCC' },
        { type: 'text', text: s.name, size: 'lg', weight: 'bold', color: '#FFFFFF', wrap: true, maxLines: 3 },
        ...(s.signal_word === 'Danger' || s.signal_word === 'Warning'
          ? [{ type: 'text', text: s.signal_word === 'Danger' ? 'คำสัญญาณ: อันตราย (Danger)' : 'คำสัญญาณ: ระวัง (Warning)', size: 'xs', color: '#FFFFFF', weight: 'bold', margin: 'sm' } as Json]
          : []),
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        ...line('ชื่อสาร', s.chemical_name && norm(s.chemical_name) !== norm(s.name) ? s.chemical_name : null),
        ...line('CAS', s.cas_no),
        ...line('UN', s.un_no),
        ...line('ผู้ผลิต', s.supplier, 2),
        ...(s.review_status !== 'reviewed'
          ? [{ type: 'text', text: 'ข้อมูลสรุปจาก SDS ยังไม่ผ่านการตรวจทาน ใช้ SDS ฉบับเต็มเป็นหลัก', size: 'xxs', color: C.warn, wrap: true, margin: 'md' } as Json]
          : []),
        ...section('อันตราย', hazards),
        ...section('PPE ที่ต้องใช้', ppe.length ? [{ type: 'text', text: ppe.slice(0, 8).join(' · '), size: 'xs', color: C.text, wrap: true, margin: 'sm' }] : []),
        ...section('ปฐมพยาบาล', firstAid),
        ...section('เกิดเหตุ', [...line('🔥 ไฟไหม้', s.fire_fighting), ...line('💧 หกรั่วไหล', s.spill_response), ...line('☎️ ฉุกเฉิน', s.emergency_contact)]),
        ...section('การจัดเก็บ', storage),
        ...section('SDS', sdsInfo),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        ...(sds ? [{ type: 'button', style: 'primary', color: CHEM_COLOR, height: 'sm', action: { type: 'uri', label: '📄 เปิด SDS ฉบับเต็ม', uri: sds } } as Json] : []),
        { type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'โปสเตอร์ SDS บนเว็บ', uri: webLink(s) } },
      ],
    },
  });
}
