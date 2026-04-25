'use client';

/**
 * OrgChart — pure-SVG hierarchy renderer (no external chart libs)
 * - Auto layout: tidy-tree (left-to-right cursor with parent centering)
 * - Pan (drag empty area) + Zoom (mouse wheel)
 * - Optional drag-drop reparenting (admin mode)
 * - Click node → emits onNodeClick
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { PALETTE, RESP_COLORS } from '@/lib/she-theme';

export type OrgPerson = {
  id: string;
  company_id: string;
  full_name: string;
  nick_name?: string | null;
  position?: string | null;
  department?: string | null;
  responsibility?: string | null;
  status?: string | null;
  details?: string | null;
  parent_id?: string | null;
  chart_sort_order?: number | null;
  chart_node_color?: string | null;
};

type LayoutNode = OrgPerson & {
  children: LayoutNode[];
  width: number;   // subtree width
  x: number;       // top-left of node box
  y: number;
};

const NODE_W = 200;
const NODE_H = 78;
const H_GAP = 28;
const V_GAP = 56;

// ── Build forest from flat list ──────────────────────────────
function buildForest(people: OrgPerson[]): LayoutNode[] {
  const map = new Map<string, LayoutNode>();
  for (const p of people) {
    map.set(p.id, { ...p, children: [], width: NODE_W, x: 0, y: 0 });
  }
  const roots: LayoutNode[] = [];
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Sort siblings by chart_sort_order then name
  const sortKids = (n: LayoutNode) => {
    n.children.sort((a, b) => {
      const sa = a.chart_sort_order ?? 0;
      const sb = b.chart_sort_order ?? 0;
      if (sa !== sb) return sa - sb;
      return a.full_name.localeCompare(b.full_name, 'th');
    });
    n.children.forEach(sortKids);
  };
  roots.forEach(sortKids);
  return roots;
}

function computeWidth(n: LayoutNode): number {
  if (n.children.length === 0) {
    n.width = NODE_W;
    return n.width;
  }
  let total = 0;
  for (const c of n.children) total += computeWidth(c);
  total += (n.children.length - 1) * H_GAP;
  n.width = Math.max(NODE_W, total);
  return n.width;
}

function assignXY(n: LayoutNode, leftX: number, y: number): void {
  if (n.children.length === 0) {
    n.x = leftX;
    n.y = y;
    return;
  }
  let totalChildren = 0;
  for (const c of n.children) totalChildren += c.width;
  totalChildren += (n.children.length - 1) * H_GAP;

  const childStart = leftX + (n.width - totalChildren) / 2;
  let cursor = childStart;
  const childY = y + NODE_H + V_GAP;
  for (const c of n.children) {
    assignXY(c, cursor, childY);
    cursor += c.width + H_GAP;
  }
  n.x = leftX + (n.width - NODE_W) / 2;
  n.y = y;
}

// Flatten layout tree to render lists
function flatten(roots: LayoutNode[]): LayoutNode[] {
  const out: LayoutNode[] = [];
  const visit = (n: LayoutNode) => {
    out.push(n);
    n.children.forEach(visit);
  };
  roots.forEach(visit);
  return out;
}

// Returns true if "candidate" is descendant of (or equal to) "ancestorId"
function isDescendant(nodes: LayoutNode[], candidateId: string, ancestorId: string): boolean {
  if (candidateId === ancestorId) return true;
  const map = new Map<string, LayoutNode>();
  nodes.forEach((n) => map.set(n.id, n));
  // walk children of ancestor
  const stack = [ancestorId];
  while (stack.length) {
    const cur = stack.pop()!;
    const node = map.get(cur);
    if (!node) continue;
    for (const c of node.children) {
      if (c.id === candidateId) return true;
      stack.push(c.id);
    }
  }
  return false;
}

function colorForNode(p: OrgPerson): string {
  if (p.chart_node_color) return p.chart_node_color;
  if (p.responsibility && RESP_COLORS[p.responsibility]) return RESP_COLORS[p.responsibility];
  return PALETTE.primary;
}

// ──────────────────────────────────────────────────────────────
type Props = {
  people: OrgPerson[];
  /** Show drag handles + accept drag-drop reparenting */
  editable?: boolean;
  /** Emitted on node click (modal trigger) */
  onNodeClick?: (p: OrgPerson) => void;
  /** Emitted on successful reparent */
  onReparent?: (childId: string, newParentId: string | null) => void;
  /** Highlight matching name */
  searchQuery?: string;
};

export default function OrgChart({
  people,
  editable = false,
  onNodeClick,
  onReparent,
  searchQuery = '',
}: Props) {
  // ── Layout ──────────────────────────────────────────────
  const { nodes, totalWidth, totalHeight, roots } = useMemo(() => {
    const roots = buildForest(people);
    let cursorX = 0;
    let maxH = 0;
    for (const r of roots) {
      computeWidth(r);
      assignXY(r, cursorX, 0);
      cursorX += r.width + H_GAP * 2;
      // depth-based height
      const depth = (n: LayoutNode): number =>
        n.children.length === 0 ? 1 : 1 + Math.max(...n.children.map(depth));
      const h = depth(r) * (NODE_H + V_GAP);
      if (h > maxH) maxH = h;
    }
    const all = flatten(roots);
    const totalWidth = Math.max(NODE_W, cursorX - H_GAP * 2);
    const totalHeight = Math.max(NODE_H, maxH);
    return { nodes: all, totalWidth, totalHeight, roots };
  }, [people]);

  // ── Pan & Zoom ──────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const onMouseDownBg = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
  };

  useEffect(() => {
    if (!panning) return;
    const onMove = (e: MouseEvent) => {
      setPan({
        x: panStart.current.ox + (e.clientX - panStart.current.x),
        y: panStart.current.oy + (e.clientY - panStart.current.y),
      });
    };
    const onUp = () => setPanning(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [panning]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setZoom((z) => Math.min(2.5, Math.max(0.3, z + delta)));
  };

  // ── Drag & drop reparent ───────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragXY, setDragXY] = useState<{ x: number; y: number } | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | 'ROOT' | null>(null);

  const onNodeMouseDown = (e: React.MouseEvent, id: string) => {
    if (!editable) return;
    e.stopPropagation();
    setDragId(id);
    setDragXY({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!dragId) return;
    const onMove = (e: MouseEvent) => setDragXY({ x: e.clientX, y: e.clientY });
    const onUp = () => {
      if (dragId && hoverTarget !== null) {
        const newParent = hoverTarget === 'ROOT' ? null : hoverTarget;
        // prevent self / cycle
        if (newParent !== dragId) {
          if (!newParent || !isDescendant(nodes, newParent, dragId)) {
            onReparent?.(dragId, newParent);
          }
        }
      }
      setDragId(null);
      setDragXY(null);
      setHoverTarget(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragId, hoverTarget, nodes, onReparent]);

  // ── Click / search ──────────────────────────────────────
  const handleClick = useCallback(
    (p: OrgPerson) => {
      if (dragId) return; // ignore click during drag
      onNodeClick?.(p);
    },
    [dragId, onNodeClick]
  );

  const matches = (p: OrgPerson) => {
    if (!searchQuery) return false;
    const q = searchQuery.toLowerCase();
    return (
      p.full_name?.toLowerCase().includes(q) ||
      (p.nick_name || '').toLowerCase().includes(q) ||
      (p.position || '').toLowerCase().includes(q) ||
      (p.department || '').toLowerCase().includes(q)
    );
  };

  // ── Render edges (parent → child) ───────────────────────
  const edges: Array<{ from: LayoutNode; to: LayoutNode }> = [];
  for (const n of nodes) {
    for (const c of n.children) edges.push({ from: n, to: c });
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDownBg}
      onWheel={onWheel}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 540,
        overflow: 'hidden',
        background: '#f9fafb',
        cursor: panning ? 'grabbing' : 'grab',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
      }}
    >
      {/* Empty state */}
      {nodes.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 14 }}>
          ยังไม่มีข้อมูลในผังองค์กร — เพิ่มพนักงานคนแรกเพื่อเริ่มต้น
        </div>
      )}

      {/* Drop target indicator: ROOT zone (when dragging) */}
      {editable && dragId && (
        <div
          onMouseEnter={() => setHoverTarget('ROOT')}
          onMouseLeave={() => setHoverTarget(null)}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 36,
            background: hoverTarget === 'ROOT' ? '#fef3c7' : 'transparent',
            border: hoverTarget === 'ROOT' ? '2px dashed #f59e0b' : '2px dashed transparent',
            zIndex: 5, fontSize: 12, color: '#92400e', display: 'flex',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto',
          }}
        >
          {hoverTarget === 'ROOT' ? 'วางที่นี่เพื่อย้ายเป็นระดับบนสุด (ไม่มีหัวหน้า)' : ''}
        </div>
      )}

      <svg
        width={(totalWidth + 80) * zoom}
        height={(totalHeight + 80) * zoom}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          userSelect: 'none',
        }}
      >
        {/* Edges */}
        {edges.map((e, i) => {
          const x1 = e.from.x + NODE_W / 2;
          const y1 = e.from.y + NODE_H;
          const x2 = e.to.x + NODE_W / 2;
          const y2 = e.to.y;
          const midY = (y1 + y2) / 2;
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
              stroke="#94a3b8"
              strokeWidth={1.5}
              fill="none"
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const isDrag = dragId === n.id;
          const isHoverDrop = editable && dragId && hoverTarget === n.id && dragId !== n.id;
          const isMatch = matches(n);
          const color = colorForNode(n);
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              style={{ cursor: editable ? 'move' : 'pointer', opacity: isDrag ? 0.4 : 1 }}
              onMouseDown={(e) => onNodeMouseDown(e, n.id)}
              onMouseEnter={() => editable && dragId && dragId !== n.id && !isDescendant(nodes, n.id, dragId) && setHoverTarget(n.id)}
              onMouseLeave={() => editable && dragId && setHoverTarget(null)}
              onClick={(e) => { e.stopPropagation(); handleClick(n); }}
            >
              {/* drop highlight */}
              {isHoverDrop && (
                <rect width={NODE_W} height={NODE_H} rx={10} ry={10}
                  fill="#fef3c7" stroke="#f59e0b" strokeWidth={3} strokeDasharray="6 3" />
              )}
              {/* main box */}
              <rect width={NODE_W} height={NODE_H} rx={10} ry={10}
                fill="#ffffff"
                stroke={isMatch ? '#fbbf24' : color}
                strokeWidth={isMatch ? 3 : 1.5}
              />
              {/* color stripe */}
              <rect width={6} height={NODE_H} rx={3} ry={3} fill={color} />
              {/* name */}
              <text x={16} y={22} fontSize={13} fontWeight={700} fill="#111827">
                {(n.full_name || '').slice(0, 22)}
                {n.full_name && n.full_name.length > 22 ? '…' : ''}
              </text>
              {/* position */}
              <text x={16} y={40} fontSize={11} fill="#374151">
                {(n.position || '').slice(0, 28)}
                {n.position && n.position.length > 28 ? '…' : ''}
              </text>
              {/* department / responsibility */}
              <text x={16} y={56} fontSize={10} fill="#6b7280">
                {(n.department || n.responsibility || '').slice(0, 30)}
              </text>
              {/* status dot */}
              {n.status && n.status !== 'active' && (
                <circle cx={NODE_W - 12} cy={12} r={5} fill="#f59e0b" />
              )}
              {/* nickname badge */}
              {n.nick_name && (
                <text x={NODE_W - 12} y={NODE_H - 8} fontSize={9}
                  fill="#9ca3af" textAnchor="end">
                  ({n.nick_name})
                </text>
              )}
            </g>
          );
        })}

        {/* Ghost while dragging */}
        {editable && dragId && dragXY && containerRef.current && (() => {
          const rect = containerRef.current.getBoundingClientRect();
          const ghostX = (dragXY.x - rect.left - pan.x) / zoom;
          const ghostY = (dragXY.y - rect.top - pan.y) / zoom;
          const node = nodes.find((n) => n.id === dragId);
          if (!node) return null;
          return (
            <g transform={`translate(${ghostX - NODE_W / 2}, ${ghostY - NODE_H / 2})`} style={{ pointerEvents: 'none', opacity: 0.85 }}>
              <rect width={NODE_W} height={NODE_H} rx={10} ry={10}
                fill="#fef9c3" stroke="#ca8a04" strokeWidth={2} strokeDasharray="4 3" />
              <text x={NODE_W / 2} y={NODE_H / 2 + 4} fontSize={12} fontWeight={700}
                fill="#713f12" textAnchor="middle">
                {node.full_name}
              </text>
            </g>
          );
        })()}
      </svg>

      {/* Toolbar overlay */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12, display: 'flex', gap: 6,
        background: 'rgba(255,255,255,0.95)', padding: 6, borderRadius: 8,
        border: '1px solid #e5e7eb', fontSize: 12,
      }}>
        <button onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(0.3, z - 0.1)); }}
          style={btnStyle}>−</button>
        <span style={{ minWidth: 44, textAlign: 'center', alignSelf: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(2.5, z + 0.1)); }}
          style={btnStyle}>+</button>
        <button onClick={(e) => { e.stopPropagation(); setZoom(1); setPan({ x: 40, y: 40 }); }}
          style={{ ...btnStyle, paddingInline: 10 }}>รีเซ็ต</button>
      </div>

      {/* Hint banner (editable mode) */}
      {editable && roots.length > 0 && (
        <div style={{
          position: 'absolute', top: 8, left: 8,
          background: 'rgba(255,255,255,0.95)', padding: '6px 10px',
          borderRadius: 6, fontSize: 11, color: '#475569',
          border: '1px solid #e5e7eb',
        }}>
          ลากกล่องเพื่อย้ายผู้บังคับบัญชา • คลิกเพื่อดู/แก้ไข
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  width: 28, height: 28, padding: 0, fontSize: 14, fontWeight: 700,
  background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer',
};
