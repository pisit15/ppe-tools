'use client';

import { Biohazard, Droplets, Flame, HeartPulse, Lightbulb, Package, Shield, Shirt, Siren, Thermometer, Waves, Wind, Wrench, Zap, type LucideIcon } from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  flame: Flame, droplets: Droplets, waves: Waves, shirt: Shirt, lightbulb: Lightbulb, 'heart-pulse': HeartPulse, package: Package,
  shield: Shield, siren: Siren, wrench: Wrench, thermometer: Thermometer, zap: Zap, wind: Wind, biohazard: Biohazard,
};

export function CategoryIcon({ name, size = 18, className, color }: { name: string; size?: number; className?: string; color?: string }) {
  const Icon = MAP[name] || Shield;
  return <Icon size={size} className={className} color={color} aria-hidden />;
}

/** Rounded tile with the category colour behind the icon */
export function CategoryTile({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-xl shrink-0" style={{ width: size, height: size, background: `${color}1F`, color }}>
      <CategoryIcon name={name} size={Math.round(size * 0.5)} />
    </span>
  );
}
