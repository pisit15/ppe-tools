'use client';

import { CategoryIcon } from './icons';

/** Short badge for the extinguishing agent (fire extinguishers only). */
export function agentBadge(agent: unknown): string {
  const a = String(agent || '').toLowerCase();
  if (!a) return '';
  if (a.includes('co2') || a.includes('co₂')) return 'CO₂';
  if (a.includes('ผงเคมี') || a.includes('dry') || a.includes('abc') || a.includes('powder')) return 'DC';
  if (a.includes('clean') || a.includes('hfc') || a.includes('fk') || a.includes('halotron') || a.includes('novec')) return 'CA';
  if (a.includes('f-500') || a.includes('f500')) return 'F5';
  if (a.includes('pure')) return 'PP';
  if (a.includes('โฟม') || a.includes('foam')) return 'FM';
  if (a.includes('น้ำ') && !a.includes('ยา')) return 'W';
  if (a.includes('wet') || a.includes('class k') || a.includes('k')) return 'K';
  return a.slice(0, 2).toUpperCase();
}
export const AGENT_LEGEND: { badge: string; label: string }[] = [
  { badge: 'DC', label: 'ผงเคมีแห้ง' }, { badge: 'CO₂', label: 'CO₂' }, { badge: 'CA', label: 'Clean agent' }, { badge: 'F5', label: 'F-500' }, { badge: 'PP', label: 'Pure Plus' }, { badge: 'FM', label: 'โฟม' }, { badge: 'W', label: 'น้ำ' }, { badge: 'K', label: 'Wet chemical' },
];

/**
 * Map marker: the shape says what the equipment is (extinguisher silhouette, or the category icon in a tile),
 * the fill says the inspection status, the small badge says the extinguishing agent.
 */
export function MarkerGlyph({ categoryKey, icon, agent, color, size = 30, selected = false }: { categoryKey: string; icon: string; agent?: unknown; color: string; size?: number; selected?: boolean }) {
  const ring = selected ? `drop-shadow(0 0 0 3px ${color}66) drop-shadow(0 2px 4px rgba(0,0,0,.4))` : 'drop-shadow(0 1px 2px rgba(0,0,0,.45))';
  if (categoryKey === 'fire_extinguisher') {
    const badge = agentBadge(agent);
    const co2 = badge === 'CO₂';
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ filter: ring, overflow: 'visible' }} aria-hidden>
        {/* handle + lever */}
        <path d="M12 6 h7 l3 -3" stroke="#222" strokeWidth="2" fill="none" strokeLinecap="round" />
        <rect x="13" y="5" width="5" height="4" rx="1" fill="#222" />
        {/* body */}
        <rect x="10" y="9" width="11" height="20" rx="4" fill={color} stroke="#fff" strokeWidth="1.5" />
        {/* neck */}
        <rect x="13" y="7" width="5" height="3" fill={color} stroke="#fff" strokeWidth="1" />
        {co2
          ? <path d="M21 12 l7 -4 v9 l-7 -3 z" fill="#222" stroke="#fff" strokeWidth="1" />
          : <path d="M21 11 c5 0 6 4 4 8" stroke="#222" strokeWidth="2.2" fill="none" strokeLinecap="round" />}
        {/* gauge for non-CO2 */}
        {!co2 && <circle cx="15.5" cy="12" r="2" fill="#fff" stroke="#222" strokeWidth="0.8" />}
        {badge && (
          <g>
            <rect x="17" y="21" width={badge.length > 2 ? 15 : 13} height="10" rx="3" fill="#fff" stroke={color} strokeWidth="1" />
            <text x={17 + (badge.length > 2 ? 7.5 : 6.5)} y="28.3" textAnchor="middle" fontSize={badge.length > 2 ? 6.2 : 7} fontWeight="700" fill="#222" fontFamily="system-ui, sans-serif">{badge}</text>
          </g>
        )}
      </svg>
    );
  }
  return (
    <span className="inline-flex items-center justify-center rounded-lg" style={{ width: size * 0.8, height: size * 0.8, background: color, border: '1.5px solid #fff', color: '#fff', filter: ring }} aria-hidden>
      <CategoryIcon name={icon} size={Math.round(size * 0.48)} />
    </span>
  );
}
