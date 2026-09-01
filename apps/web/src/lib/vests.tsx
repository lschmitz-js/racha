import { useQuery } from '@tanstack/react-query';
import type { Vest } from '@racha/shared';
import { api } from './api.js';

export type VestConfig = { color: string; label: string };
export type Vests = Record<Vest, VestConfig>;

export const DEFAULT_VESTS: Vests = {
  white: { color: '#f3f4f6', label: 'White' },
  black: { color: '#111827', label: 'Black' },
  green: { color: '#16a34a', label: 'Green' },
};

// Black or white text for best contrast on a given background colour.
export function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#fff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Relative luminance (sRGB approximation).
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111827' : '#ffffff';
}

// Live vest config (colours + labels), shared/cached across screens.
export function useVests(): Vests {
  const q = useQuery({
    queryKey: ['settings', 'vests'],
    queryFn: () => api.settings.get(),
    staleTime: 5 * 60 * 1000,
  });
  return { ...DEFAULT_VESTS, ...(q.data?.vests ?? {}) };
}

// Inline styles from a vest colour: a filled pill and a faint panel tint.
export function pillStyle(color: string) {
  return { backgroundColor: color, color: contrastText(color) };
}
export function panelStyle(color: string) {
  return { borderColor: `${color}55`, backgroundColor: `${color}12` };
}

// A small filled colour chip for a vest slot.
export function VestDot({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full ring-1 ring-white/25 shrink-0"
      style={{ width: size, height: size, backgroundColor: color }}
    />
  );
}

// A pill showing the vest label on its colour.
export function VestPill({
  vest,
  className = '',
}: {
  vest: Vest;
  className?: string;
}) {
  const v = useVests()[vest];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${className}`}
      style={{ backgroundColor: v.color, color: contrastText(v.color) }}
    >
      {v.label}
    </span>
  );
}
