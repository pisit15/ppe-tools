'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import { ArrowUpRight, ChevronDown, Info, Search, X } from 'lucide-react';
import type { PricePoint } from '@/lib/procurement/types';
import { taxLabel, unitPriceBasisLabel } from '@/lib/procurement/comparability';
import { priceMarkers, pricePointKey, priceRecordPage, searchChartModel, type PriceMarker } from '@/lib/procurement/search-chart-model';
import { baht, int, prHref, shortVendor, SourceBadge, thaiDate, usePeriodParam } from './ui';
import { niceMax } from './charts';
import styles from './SearchPriceCharts.module.css';

type Selection = { keys: string[]; nearby: boolean; label: string; active: string };
type SelectMarker = (marker: PriceMarker, label: string, event: MouseEvent<HTMLButtonElement>) => void;
const shortAmount = (value: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: value > 0 && value < 1 ? 6 : 0, notation: value >= 1_000_000 ? 'compact' : 'standard' }).format(value);
const shortDay = (value: number) => new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
const quantity = (value: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 6 }).format(value);

function RecordPicker({ points, active, currency, onChange }: { points: PricePoint[]; active: PricePoint; currency: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const result = useMemo(() => priceRecordPage(points, query, page), [points, query, page]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const label = (point: PricePoint) => `${point.source === 'po' ? 'PO' : 'ใบเสนอราคา'} · ${baht(point.unit_price)} ${point.currency || currency} / ${point.unit || 'ไม่ระบุหน่วย'} · ${point.pr_no}`;
  if (points.length <= 20) return <label className={styles.selectRecord}>รายการที่ต้องการตรวจ
    <select aria-label="รายการที่ต้องการตรวจ" value={pricePointKey(active)} onChange={event => onChange(event.target.value)}>
      {points.map((point, index) => <option key={pricePointKey(point)} value={pricePointKey(point)}>{index + 1}. {label(point)} · {point.vendor || 'ไม่ระบุผู้ขาย'}</option>)}
    </select>
  </label>;
  return <div ref={container} className={styles.recordPicker} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    <span className={styles.pickerLabel}>รายการที่ต้องการตรวจ · {int(points.length)} รายการ</span>
    <button ref={trigger} type="button" className={styles.pickerTrigger} aria-expanded={open} aria-controls={panelId} aria-label={`ค้นหาและเลือกรายการ ปัจจุบัน ${label(active)}`} onClick={() => setOpen(!open)}><span>{label(active)}</span><ChevronDown size={18} aria-hidden /></button>
    {open && <div id={panelId} className={styles.pickerPanel} role="region" aria-label="ค้นหาและเลือกรายการจากกราฟ">
      <div className={styles.pickerSearch}><Search size={16} aria-hidden /><input ref={search} type="search" aria-label="ค้นหาในรายการจากกราฟ" placeholder="ค้นหาสินค้า ผู้ขาย ราคา หรือเลข PR" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></div>
      <p className={styles.pickerStatus} role="status">พบ {int(result.total)} จาก {int(points.length)} รายการ · การค้นหาไม่เปลี่ยนรายการที่เลือก</p>
      <div className={styles.pickerOptions}>
        {result.records.map(point => <button type="button" key={pricePointKey(point)} className={styles.pickerOption} aria-pressed={pricePointKey(point) === pricePointKey(active)} onClick={() => { onChange(pricePointKey(point)); setOpen(false); trigger.current?.focus(); }}>
          <strong>{label(point)}</strong><span>{point.item || 'ไม่ระบุชื่อรายการ'}</span><small>{point.vendor || 'ไม่ระบุผู้ขาย'} · {point.ref || 'ไม่ระบุเลขเอกสาร'}</small>
        </button>)}
        {!result.records.length && <p className={styles.pickerEmpty}>ไม่พบรายการ ลองเปลี่ยนคำค้นหรือล้างช่องค้นหา</p>}
      </div>
      <div className={styles.pickerPagination}><button type="button" disabled={result.page === 0} aria-label="รายการหน้าก่อน" onClick={() => setPage(result.page - 1)}>ก่อนหน้า</button><span>หน้า {int(result.page + 1)} / {int(result.pages)}</span><button type="button" disabled={result.page + 1 >= result.pages} aria-label="รายการหน้าถัดไป" onClick={() => setPage(result.page + 1)}>ถัดไป</button></div>
    </div>}
  </div>;
}

function usePlotWidth(initialWidth: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initialWidth);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function Marker({ marker, currency, selected, select, label, detailId }: {
  marker: PriceMarker; currency: string; selected: Set<string>; select: SelectMarker; label: string; detailId: string;
}) {
  const first = marker.points[0];
  const count = marker.points.length;
  const poCount = marker.points.filter(point => point.source === 'po').length;
  const isSelected = marker.points.some(point => selected.has(pricePointKey(point)));
  const title = count > 1
    ? `${int(count)} รายการ${marker.nearby ? 'ที่อยู่ใกล้กัน' : 'ที่ตำแหน่งเดียวกัน'} · PO ${int(poCount)} · ใบเสนอราคา ${int(count - poCount)} · กดดูราคาจริงและหน่วยของทุกรายการ`
    : `${first.source === 'po' ? 'ราคาตาม PO' : 'ใบเสนอราคา'} · ${first.item} · ${baht(first.unit_price)} ${currency} / ${first.unit || 'ไม่ระบุหน่วย'} · ${taxLabel(first.tax_basis || 'unknown')}`;
  return <button type="button" className={`${styles.marker} ${isSelected ? styles.markerSelected : ''}`} style={{ left: marker.x, top: marker.y }}
    aria-label={`${label} · ${title}`} aria-pressed={isSelected} aria-controls={detailId} title={title} onClick={event => select(marker, label, event)}>
    <span aria-hidden className={count > 1 ? styles.countMarker : first.source === 'po' ? styles.poMarker : styles.quoteMarker}>{count > 1 ? int(count) : null}</span>
  </button>;
}

function VendorPlot({ points, currency, maximum, selected, select, detailId }: {
  points: PricePoint[]; currency: string; maximum: number; selected: Set<string>; select: SelectMarker; detailId: string;
}) {
  const model = useMemo(() => searchChartModel(points), [points]);
  const { ref, width } = usePlotWidth(420);
  const labelWidth = width < 380 ? 120 : 144;
  const plotWidth = Math.max(50, width - labelWidth - 12);
  const left = 22, right = Math.max(left, plotWidth - 22);
  return <div ref={ref} className={styles.vendorChart}>
    {model.valid.length > 0 && <div className={styles.vendorAxis} style={{ marginLeft: labelWidth + 12 }} aria-hidden>
      <span>0</span><span>{shortAmount(maximum / 2)}</span><span>{shortAmount(maximum)}</span>
    </div>}
    <div className={styles.vendorRows} tabIndex={model.vendors.length > 4 ? 0 : undefined} aria-label="ราคาตามผู้ขาย เลื่อนเพื่อดูผู้ขายทั้งหมด">
      {model.vendors.map(vendor => {
        const markers = priceMarkers(vendor.points.map(point => ({ point, x: left + (point.unit_price / maximum) * (right - left), y: 25 })));
        const po = vendor.points.filter(point => point.source === 'po').length;
        return <div className={styles.vendorRow} style={{ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` }} key={vendor.key}>
          <div className={styles.vendorLabel}><span title={vendor.name}>{shortVendor(vendor.name)}</span><small>PO {int(po)} · เสนอราคา {int(vendor.points.length - po)}</small></div>
          <div className={styles.vendorTrack}>
            <div className={styles.vendorGrid} aria-hidden />
            {markers.map(marker => <Marker key={marker.key} marker={marker} currency={currency} selected={selected} select={select} label={vendor.name} detailId={detailId} />)}
          </div>
        </div>;
      })}
    </div>
    {!model.valid.length && <p className={styles.emptyChart}>{model.unconfirmedCurrency.length > 0 ? 'ยังไม่แสดงราคาเป็นกราฟ เพราะยังไม่ยืนยันสกุลเงิน' : 'ยังไม่มีราคาที่ใช้วาดกราฟได้'}<br />ดูรายละเอียดในตารางด้านล่าง</p>}
  </div>;
}

function TimelinePlot({ points, currency, maximum, selected, select, detailId }: {
  points: PricePoint[]; currency: string; maximum: number; selected: Set<string>; select: SelectMarker; detailId: string;
}) {
  const { ref, width } = usePlotWidth(600);
  const model = useMemo(() => searchChartModel(points), [points]);
  const height = 218, left = width < 340 ? 58 : 68, right = Math.max(left, width - 22), top = 22, bottom = 176;
  const span = model.lastDay - model.firstDay;
  const markers = useMemo(() => priceMarkers(model.dated.map(({ point, day }) => ({ point,
    x: span ? left + (day - model.firstDay) / span * (right - left) : (left + right) / 2,
    y: bottom - point.unit_price / maximum * (bottom - top),
  }))), [model, span, left, right, maximum]);
  return <div ref={ref} className={styles.timeline} style={{ height }}>
    {model.dated.length ? <>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden focusable="false">
        {[0, 0.5, 1].map(ratio => <g key={ratio}>
          <line x1={left} x2={right} y1={bottom - ratio * (bottom - top)} y2={bottom - ratio * (bottom - top)} className={styles.axisLine} />
          <text x={left - 10} y={bottom - ratio * (bottom - top) + 4} textAnchor="end" className={styles.axisText}>{shortAmount(maximum * ratio)}</text>
        </g>)}
        {span ? <><text x={left} y={height - 9} className={styles.axisText}>{shortDay(model.firstDay)}</text>{width >= 390 && span >= 2 * 86400000 && <text x={(left + right) / 2} y={height - 9} textAnchor="middle" className={styles.axisText}>{shortDay(model.firstDay + span / 2)}</text>}<text x={right} y={height - 9} textAnchor="end" className={styles.axisText}>{shortDay(model.lastDay)}</text></>
          : <text x={(left + right) / 2} y={height - 9} textAnchor="middle" className={styles.axisText}>{shortDay(model.firstDay)}</text>}
      </svg>
      {markers.map(marker => <Marker key={marker.key} marker={marker} currency={currency} selected={selected} select={select} label="ประวัติราคา" detailId={detailId} />)}
    </> : <p className={styles.emptyChart}>{model.unconfirmedCurrency.length === points.length && points.length > 0 ? 'ยังไม่แสดงประวัติราคา เพราะยังไม่ยืนยันสกุลเงิน' : 'ยังไม่มีรายการที่ระบุราคา สกุลเงิน และวันที่เอกสารครบ'}<br />ดูรายการทั้งหมดในตารางด้านล่าง</p>}
  </div>;
}

/** Two document-price overviews. A marker is an entry into evidence, never a cheapest-vendor recommendation. */
export function SearchPriceCharts({ points, currency }: { points: PricePoint[]; currency: string }) {
  const model = useMemo(() => searchChartModel(points), [points]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectionKeys = selection?.keys;
  const origin = useRef<HTMLButtonElement | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const detailId = useId();
  const period = usePeriodParam();
  const lookup = useMemo(() => new Map(points.map(point => [pricePointKey(point), point])), [points]);
  const selectedPoints = selection?.keys.flatMap(key => lookup.has(key) ? [lookup.get(key)!] : []) || [];
  const active = selectedPoints.find(point => pricePointKey(point) === selection?.active) || selectedPoints[0];
  const selected = new Set(selectedPoints.map(pricePointKey));
  const maximum = niceMax(Number.isFinite(model.maxPrice * 1.08) ? model.maxPrice * 1.08 : model.maxPrice);
  const requestSelection: SelectMarker = (marker, label, event) => {
    origin.current = event.currentTarget;
    const keys = marker.points.map(pricePointKey);
    setSelection({ keys, nearby: marker.nearby, label, active: keys[0] });
  };
  useEffect(() => {
    if (!selectionKeys) return;
    detailHeading.current?.focus({ preventScroll: true });
    detailHeading.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [selectionKeys]);
  function closeDetails() {
    setSelection(null);
    if (origin.current?.isConnected) origin.current.focus();
  }
  const currencyOmission = model.unconfirmedCurrency.length ? `${int(model.unconfirmedCurrency.length)} รายการยังไม่ยืนยันสกุลเงิน จึงไม่วาดบนแกนราคา` : '';
  const priceOmission = model.invalid.length ? `${int(model.invalid.length)} รายการไม่มีราคาที่ใช้ได้` : '';
  const vendorOmission = [currencyOmission, priceOmission].filter(Boolean).join(' · ');
  const omission = [model.undated.length ? `${int(model.undated.length)} รายการไม่มีวันที่เอกสารที่ใช้ได้` : '', currencyOmission, priceOmission].filter(Boolean).join(' · ');
  return <section className={styles.analysis} aria-label="กราฟราคาและรายละเอียดเอกสาร">
    <div className={styles.context}>
      <div><h3>ราคาในเอกสารที่ค้นพบ <span>{currency}</span></h3><p>{model.valid.length > 0 ? 'จุดต่ำกว่าไม่ได้แปลว่าคุ้มกว่าเสมอ ตรวจหน่วย สเปก ฐานราคา และภาษีในเอกสารก่อนเปรียบเทียบ' : 'กราฟต้องมีราคาและสกุลเงินที่ตรวจสอบได้ รายการในชุดนี้ยังอยู่ในตารางด้านล่าง'}</p></div>
      {model.valid.length > 0 && <div className={styles.legend} aria-label="คำอธิบายสัญลักษณ์"><span><i className={styles.poMarker} />ราคาตาม PO</span><span><i className={styles.quoteMarker} />ใบเสนอราคา</span><span><i className={styles.legendCount}>2</i>หลายรายการ</span></div>}
    </div>
    <div className={styles.chartGrid}>
      <section className={styles.chartCard} aria-label="ราคาตามผู้ขาย">
        <div className={styles.cardHeader}><div><h4>ราคาตามผู้ขาย</h4><p>แสดง {int(model.valid.length)} จาก {int(points.length)} รายการ · {int(model.vendors.length)} ผู้ขายในกราฟ</p></div><span className={styles.axisUnit}>{currency}</span></div>
        <VendorPlot points={points} currency={currency} maximum={maximum} selected={selected} select={requestSelection} detailId={detailId} />
        {model.valid.length > 0 && <p className={styles.footnote}>เรียงผู้ขายตามชื่อ · กดจุดเพื่อดูราคา หน่วย และเอกสาร</p>}
        {vendorOmission && <p className={styles.omission}>{vendorOmission} · <a href="#price-records">ดูในตารางรายการ</a></p>}
      </section>
      <section className={styles.chartCard} aria-label="ประวัติราคาตามเวลา">
        <div className={styles.cardHeader}><div><h4>ประวัติราคาตามเวลา</h4><p>แสดง {int(model.dated.length)} จาก {int(points.length)} รายการ</p></div><span className={styles.axisUnit}>{currency}</span></div>
        <TimelinePlot points={points} currency={currency} maximum={maximum} selected={selected} select={requestSelection} detailId={detailId} />
        {model.dated.length > 0 && <p className={styles.footnote}>ตามวันที่ในเอกสาร · กดจุดเพื่อดูราคา หน่วย และเอกสาร</p>}
        {omission && <p className={styles.omission}>{omission} · <a href="#price-records">ดูในตารางรายการ</a></p>}
      </section>
    </div>
    {model.valid.length > 0 && <p className={styles.explainer}><Info size={14} aria-hidden /><span>ตัวเลขบนจุดรวมรายการที่ซ้อนหรืออยู่ใกล้กัน กดเพื่อดูราคาจริงของแต่ละรายการ{model.incomplete.length > 0 ? ` · ${int(model.incomplete.length)} รายการยังระบุหน่วย ฐานราคา หรือภาษีไม่ครบ` : ''}</span></p>}
    <div id={detailId}>
      {active && selection && <section className={styles.details} aria-labelledby={`${detailId}-heading`} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeDetails(); } }}>
        <div className={styles.detailHeader}><div><p className={styles.eyebrow}>รายละเอียดจากกราฟ</p><h4 id={`${detailId}-heading`} ref={detailHeading} tabIndex={-1}>{selectedPoints.length > 1 ? `${int(selectedPoints.length)} รายการ${selection.nearby ? 'ที่อยู่ใกล้กัน' : 'ที่ตำแหน่งนี้'}` : 'รายละเอียดราคา'}</h4>{selectedPoints.length > 1 && <p className={styles.eyebrow}>PO {int(selectedPoints.filter(point => point.source === 'po').length)} · ใบเสนอราคา {int(selectedPoints.filter(point => point.source === 'quote').length)}</p>}</div><button type="button" className={styles.close} aria-label="ปิดรายละเอียดราคา" onClick={closeDetails}><X size={20} /></button></div>
        {selectedPoints.length > 1 && <RecordPicker key={selection.keys.join('|')} points={selectedPoints} active={active} currency={currency} onChange={key => setSelection({ ...selection, active: key })} />}
        <div className={styles.detailBody}>
          <div className={styles.itemDetail}><SourceBadge source={active.source} /><h5>{active.item || 'ไม่ระบุชื่อรายการ'}</h5>{active.detail && <p>{active.detail}</p>}<p className={styles.vendorFull}>{active.vendor || 'ไม่ระบุผู้ขาย'}</p></div>
          <div className={styles.priceDetail}><p className={styles.price}>{baht(active.unit_price)} <span>{active.currency || currency}</span></p><p className={styles.unit}>ต่อ {active.unit || 'หน่วยที่ยังไม่ระบุ'}</p><p>{taxLabel(active.tax_basis || 'unknown')} · {unitPriceBasisLabel(active.price_basis || 'unknown')}</p></div>
        </div>
        <dl className={styles.facts}><div><dt>วันที่เอกสาร</dt><dd>{active.date && model.dated.some(record => pricePointKey(record.point) === pricePointKey(active)) ? thaiDate(active.date) : 'ไม่ระบุวันที่ที่ใช้ได้'}</dd></div><div><dt>จำนวนตามเอกสาร</dt><dd>{active.qty === null ? 'ไม่ระบุ' : `${quantity(active.qty)} ${active.unit}`}</dd></div><div><dt>เลขเอกสาร</dt><dd>{active.ref || 'ไม่ระบุ'}</dd></div><div><dt>เลข PR</dt><dd>{active.pr_no || 'ไม่ระบุ'}</dd></div></dl>
        <div className={styles.detailFooter}><p>ตรวจสเปก จำนวน และเงื่อนไขในเอกสารก่อนใช้ราคาอ้างอิง{active.duplicate ? ' · เอกสารนี้ถูกระบุว่าอาจซ้ำ' : ''}</p>{active.pr_no && <Link className={styles.openPr} href={prHref(active.pr_no, active.requester, period)}>เปิด PR <ArrowUpRight size={16} aria-hidden /></Link>}</div>
      </section>}
    </div>
  </section>;
}
