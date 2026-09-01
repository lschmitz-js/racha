import { useState } from 'react';
import { api } from './api.js';

// Resize an image client-side to a square crop, max dimension `maxDim`,
// re-encoded as JPEG so phone-camera 5–10 MB uploads become ~50 KB.
export async function resizeImageToBlob(file: File, maxDim = 512): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        0.85
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

const SIZE_CLASS: Record<number, string> = {
  24: 'w-6 h-6 text-[9px]',
  32: 'w-8 h-8 text-[10px]',
  40: 'w-10 h-10 text-xs',
  48: 'w-12 h-12 text-sm',
  64: 'w-16 h-16 text-base',
  80: 'w-20 h-20 text-lg',
};

// Deterministic vivid colour per player, so a photo-less avatar still reads as a
// distinct coloured initial (matches the mobile design).
const AVATAR_COLORS = ['#22c55e', '#ec4899', '#3b82f6', '#f97316', '#a855f7', '#14b8a6', '#ef4444', '#eab308'];
export function avatarColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

export function Avatar({
  playerId,
  name,
  size = 32,
  version,
}: {
  playerId: string;
  name: string;
  size?: number;
  version?: string | number | null;
}) {
  const [errored, setErrored] = useState(false);
  const sizeClass = SIZE_CLASS[size] ?? 'w-8 h-8 text-[10px]';
  const initial = (name?.charAt(0) ?? '?').toUpperCase();
  if (errored) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full text-white font-bold ${sizeClass}`}
        style={{ backgroundColor: avatarColor(playerId || name) }}
        aria-label={name}
      >
        {initial}
      </span>
    );
  }
  return (
    <img
      src={api.players.avatarUrl(playerId, version)}
      alt={name}
      width={size}
      height={size}
      onError={() => setErrored(true)}
      className={`rounded-full object-cover bg-bg3 border border-border ${sizeClass}`}
    />
  );
}
