import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Vest } from '@racha/shared';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { useVests, contrastText, type VestConfig } from '../lib/vests.js';

// Preset colours the organizer can assign to each of the three team slots.
const PALETTE: VestConfig[] = [
  { color: '#f3f4f6', label: 'White' },
  { color: '#111827', label: 'Black' },
  { color: '#16a34a', label: 'Green' },
  { color: '#2563eb', label: 'Blue' },
  { color: '#f97316', label: 'Orange' },
  { color: '#ef4444', label: 'Red' },
  { color: '#a855f7', label: 'Purple' },
  { color: '#eab308', label: 'Yellow' },
  { color: '#ec4899', label: 'Pink' },
  { color: '#14b8a6', label: 'Teal' },
  { color: '#6b7280', label: 'Gray' },
];

const SLOTS: Vest[] = ['white', 'black', 'green'];

export function VestSettings({ onClose }: { onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const current = useVests();
  const [draft, setDraft] = useState<Record<Vest, VestConfig>>({
    white: current.white,
    black: current.black,
    green: current.green,
  });

  const save = useMutation({
    mutationFn: () => api.settings.updateVests(draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'vests'] });
      onClose();
    },
    onError: (e: any) => alert(String(e?.message ?? e)),
  });

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-bg2 border border-border rounded-t-xl sm:rounded-xl p-4 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold">{t('settings.vestsTitle')}</h2>
        <p className="text-sm text-muted mb-3">{t('settings.vestsHint')}</p>

        <div className="space-y-4">
          {SLOTS.map((slot, i) => {
            const sel = draft[slot];
            return (
              <div key={slot} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-7 h-7 rounded-md ring-1 ring-white/20 flex items-center justify-center text-[10px] font-bold"
                    style={{ backgroundColor: sel.color, color: contrastText(sel.color) }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium">
                    {t('settings.vestSlot', { n: i + 1 })}
                  </span>
                  <span className="text-sm text-muted ml-auto">{sel.label}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PALETTE.map((p) => {
                    const active = p.color.toLowerCase() === sel.color.toLowerCase();
                    return (
                      <button
                        key={p.color}
                        title={p.label}
                        onClick={() => setDraft((d) => ({ ...d, [slot]: p }))}
                        className={`w-8 h-8 rounded-full ring-1 ring-white/20 transition ${
                          active ? 'outline outline-2 outline-accent outline-offset-2' : ''
                        }`}
                        style={{ backgroundColor: p.color }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex gap-2">
          <button className="btn flex-1" onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary flex-1" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
