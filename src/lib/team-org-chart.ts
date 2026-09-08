import { blankProfile, type Member, type Profile } from './team-management';

export type LineMode = 'both' | 'direct_manager' | 'functional_manager';
export type Point = { x: number; y: number };
export function buildOrgChart(people: Member[], profiles: Map<string, Profile>, mode: LineMode) {
  const ids = new Set(people.map(p => p.id));
  const profile = (p: Member) => profiles.get(p.id) || blankProfile(p);
  const parent = (p: Member) => mode === 'functional_manager' ? profile(p).functional_manager : profile(p).direct_manager;
  const byId = new Map(people.map(p => [p.id, p]));
  function depth(p: Member, seen = new Set<string>()): number {
    if (seen.has(p.id)) return 0;
    seen.add(p.id);
    const manager = byId.get(parent(p));
    return manager ? 1 + depth(manager, seen) : 0;
  }
  let left = 32;
  const points: Record<string, Point> = {};
  const levelHeights = new Map<number, number>();
  const bucketCounts = new Map<string, number>();
  people.forEach(p => { const d = depth(p), key = `${p.company_id}:${d}`; const count = (bucketCounts.get(key) || 0) + 1; bucketCounts.set(key, count); levelHeights.set(d, Math.max(levelHeights.get(d) || 1, Math.ceil(count / 3))); });
  const levelY = (d: number) => 200 + Array.from({length:d}, (_, i) => (levelHeights.get(i) || 1) * 140 + 30).reduce((a,b) => a+b, 0);
  const groups = [...new Set(people.map(p => p.company_id))].sort().map(id => {
    const members = people.filter(p => p.company_id === id);
    const rows = new Map<number, Member[]>();
    members.forEach(p => { const d = depth(p); rows.set(d, [...(rows.get(d) || []), p]); });
    const width = Math.max(300, ...[...rows.values()].map(row => Math.min(3, row.length) * 290 + 24));
    for (const [d, row] of rows) row.forEach((p, i) => { points[p.id] = { x: left + (width - Math.min(3,row.length) * 290) / 2 + (i % 3) * 290 + 15, y: levelY(d) + Math.floor(i / 3) * 140 }; });
    const group = { id, x: left, width, count: members.length };
    left += width + 32;
    return group;
  });
  const fields = mode === 'both' ? ['direct_manager', 'functional_manager'] as const : [mode];
  const edges = people.flatMap(p => fields.flatMap(type => {
    const manager = profile(p)[type];
    return manager && ids.has(manager) ? [{ from: manager, to: p.id, type }] : [];
  }));
  const hidden = people.flatMap(p => fields.filter(type => profile(p)[type] && !ids.has(profile(p)[type])).map(type => ({ person: p.full_name, type })));
  return { points, groups, edges, hidden, width: Math.max(900, left) };
}

export function connectorPath(from: Point, to: Point, offset = 0) {
  const sx = from.x + 130 + offset, sy = from.y + 104;
  const tx = to.x + 130 + offset, ty = to.y;
  if (ty >= sy + 20) return `M ${sx} ${sy} V ${(sy + ty) / 2} H ${tx} V ${ty}`;
  // Route around cards when manually positioned beside or above their manager.
  const side = Math.max(from.x, to.x) + 278 + offset;
  return `M ${sx} ${sy} V ${sy + 18} H ${side} V ${ty - 18} H ${tx} V ${ty}`;
}
