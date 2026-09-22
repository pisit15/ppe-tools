import { blankProfile, type Member, type Profile } from './team-management';

export type LineMode = 'both' | 'direct_manager' | 'functional_manager';
export type Point = { x: number; y: number };
export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 144;
const GAP = 32;
const LEVEL_GAP = 64;

/** Independent tree heights avoid stretching the whole organization for one company. */
export function buildOrgChart(people: Member[], profiles: Map<string, Profile>, mode: LineMode) {
  const byId = new Map(people.map(p => [p.id, p]));
  const fields = mode === 'both' ? ['direct_manager', 'functional_manager'] as const : [mode];
  const profile = (p: Member) => profiles.get(p.id) || blankProfile(p);
  const edges = people.flatMap(p => fields.flatMap(type => {
    const manager = profile(p)[type];
    return manager && manager !== p.id && byId.has(manager) ? [{ from: manager, to: p.id, type }] : [];
  }));
  const hidden = people.flatMap(p => fields.filter(type => profile(p)[type] && !byId.has(profile(p)[type])).map(type => ({ person: p.full_name, type })));
  const parents = new Map<string, string>();
  const primary = mode === 'functional_manager' ? 'functional_manager' : 'direct_manager';
  const ordered = [...people].sort((a,b) => a.company_id.localeCompare(b.company_id) || a.full_name.localeCompare(b.full_name, 'th') || a.id.localeCompare(b.id));
  // Break cycles for positioning only; preserve actual relationships in the edge list.
  for (const p of ordered) {
    const parent = profile(p)[primary] || (mode === 'both' ? profile(p).functional_manager : '');
    if (!parent || !byId.has(parent) || parent === p.id) continue;
    const seen = new Set([p.id]); let cursor: string | undefined = parent;
    while (cursor && !seen.has(cursor)) { seen.add(cursor); cursor = parents.get(cursor); }
    if (!cursor) parents.set(p.id, parent);
  }
  const children = new Map<string, Member[]>();
  for (const p of ordered) {
    const parent = parents.get(p.id);
    if (parent) children.set(parent, [...(children.get(parent) || []), p]);
  }
  const widths = new Map<string, number>();
  function measure(p: Member): number {
    const kids = children.get(p.id) || [];
    const w = Math.max(NODE_WIDTH, kids.reduce((sum,k) => sum + measure(k), 0) + Math.max(0,kids.length - 1) * GAP);
    widths.set(p.id, w); return w;
  }
  const points: Record<string, Point> = {};
  function place(p: Member, x: number, y: number): number {
    const w = widths.get(p.id)!;
    points[p.id] = { x: x + (w - NODE_WIDTH) / 2, y };
    let next = x; let bottom = y + NODE_HEIGHT;
    for (const child of children.get(p.id) || []) {
      bottom = Math.max(bottom, place(child, next, y + NODE_HEIGHT + LEVEL_GAP));
      next += widths.get(child.id)! + GAP;
    }
    return bottom;
  }
  const roots = ordered.filter(p => !parents.has(p.id));
  let x = GAP, y = GAP, rowBottom = GAP, right = GAP;
  const shelfWidth = 3 * NODE_WIDTH + 4 * GAP;
  for (const root of roots) {
    const w = measure(root);
    if (x > GAP && x + w + GAP > shelfWidth) { x = GAP; y = rowBottom + LEVEL_GAP; }
    rowBottom = Math.max(rowBottom, place(root, x, y));
    right = Math.max(right, x + w + GAP); x += w + GAP;
  }
  const groups = [...new Set(ordered.map(p => p.company_id))].map(id => ({ id, count: ordered.filter(p => p.company_id === id).length }));
  return { points, groups, edges, hidden, width: Math.max(NODE_WIDTH + 2 * GAP, right), height: Math.max(NODE_HEIGHT + 2 * GAP, rowBottom + GAP) };
}

export function connectorPath(from: Point, to: Point, offset = 0) {
  const sx = from.x + NODE_WIDTH / 2 + offset, sy = from.y + NODE_HEIGHT;
  const tx = to.x + NODE_WIDTH / 2 + offset, ty = to.y;
  if (ty >= sy + 20) return `M ${sx} ${sy} V ${(sy + ty) / 2} H ${tx} V ${ty}`;
  const side = Math.max(from.x, to.x) + NODE_WIDTH + 18 + offset;
  return `M ${sx} ${sy} V ${sy + 18} H ${side} V ${ty - 18} H ${tx} V ${ty}`;
}

export function reportingNetwork(id: string, people: Member[], profiles: Map<string, Profile>, mode: LineMode) {
  const edges = buildOrgChart(people, profiles, mode).edges;
  const connected = new Set([id]); const pending = [id];
  while (pending.length) {
    const current = pending.pop()!;
    for (const edge of edges) {
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : null;
      if (next && !connected.has(next)) { connected.add(next); pending.push(next); }
    }
  }
  return connected;
}

export function escapeSvg(value: string) {
  return value.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]!));
}
