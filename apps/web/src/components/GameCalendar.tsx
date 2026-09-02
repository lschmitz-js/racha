import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import {
  SEASON_START,
  SEASON_END,
  isNoGameDate,
  isGameMonday,
  seasonMondays,
  todayISO,
} from '../lib/schedule.js';

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m0: number, d: number) => `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
const monthIdx = (y: number, m0: number) => y * 12 + m0;
const parseIdx = (iso: string) => {
  const p = iso.split('-');
  return monthIdx(Number(p[0]), Number(p[1]) - 1);
};

export function GameCalendar({
  locale,
  startIso,
  cancelledSet,
  offReason,
  isAdmin,
}: {
  locale: string;
  startIso: string | null;
  cancelledSet: Set<string>;
  offReason: (iso: string) => string;
  isAdmin: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const today = todayISO();

  const base = (startIso ?? today).split('-');
  const [ym, setYm] = useState({ y: Number(base[0]), m0: Number(base[1]) - 1 });
  const [sel, setSel] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cancellations'] });
    qc.invalidateQueries({ queryKey: ['checkin'] });
  };
  const addMut = useMutation({
    mutationFn: ({ date, reason }: { date: string; reason: string }) => api.cancellations.add(date, reason),
    onSuccess: () => {
      invalidate();
      setShowCancel(false);
    },
    onError: (e: any) => alert(e?.message ?? 'Could not cancel the game'),
  });
  const removeMut = useMutation({
    mutationFn: (date: string) => api.cancellations.remove(date),
    onSuccess: invalidate,
    onError: (e: any) => alert(e?.message ?? 'Could not un-cancel the game'),
  });

  const minIdx = parseIdx(SEASON_START);
  const maxIdx = parseIdx(SEASON_END);
  const curIdx = monthIdx(ym.y, ym.m0);
  const step = (delta: number) => {
    const next = curIdx + delta;
    if (next < minIdx || next > maxIdx) return;
    setYm({ y: Math.floor(next / 12), m0: next % 12 });
    setSel(null);
  };

  const first = new Date(ym.y, ym.m0, 1);
  const lead = first.getDay(); // 0=Sun
  const daysInMonth = new Date(ym.y, ym.m0 + 1, 0).getDate();
  const monthLabel = first.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  // Localized single-letter weekday headers (2024-09-01 is a Sunday).
  const dow = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 8, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' })
  );

  const cells: (number | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dayState = (day: number) => {
    const iso = isoOf(ym.y, ym.m0, day);
    const isMon = new Date(ym.y, ym.m0, day).getDay() === 1;
    const inSeason = iso >= SEASON_START && iso <= SEASON_END;
    const game = isGameMonday(iso) && !cancelledSet.has(iso);
    const off = isMon && inSeason && (isNoGameDate(iso) || cancelledSet.has(iso));
    return { iso, game, off, isToday: iso === today };
  };

  const fmtShort = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' });

  const cancelable = seasonMondays().filter((d) => d >= today && !cancelledSet.has(d));
  const activeCancellations = Array.from(cancelledSet)
    .filter((d) => d >= today)
    .sort();

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold capitalize">{monthLabel}</h2>
        <div className="flex gap-1">
          <button
            className="w-7 h-7 rounded-lg border border-border text-muted disabled:opacity-30"
            onClick={() => step(-1)}
            disabled={curIdx <= minIdx}
            aria-label={t('home.prevMonth')}
          >
            ‹
          </button>
          <button
            className="w-7 h-7 rounded-lg border border-border text-muted disabled:opacity-30"
            onClick={() => step(1)}
            disabled={curIdx >= maxIdx}
            aria-label={t('home.nextMonth')}
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {dow.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold uppercase text-muted pb-0.5">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const s = dayState(day);
          const cls = s.game
            ? 'bg-accent text-white font-bold'
            : s.off
            ? 'bg-red-500 text-white font-bold'
            : 'text-muted';
          const marked = s.game || s.off;
          return (
            <button
              key={i}
              onClick={() => marked && setSel(sel === s.iso ? null : s.iso)}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm leading-none ${cls} ${
                s.isToday ? 'ring-2 ring-accent ring-offset-1 ring-offset-bg2' : ''
              } ${marked ? '' : 'cursor-default'}`}
            >
              <span>{day}</span>
              {s.game ? <span className="text-[9px] mt-0.5">✓</span> : null}
              {s.off ? <span className="text-[9px] mt-0.5">✕</span> : null}
            </button>
          );
        })}
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-accent inline-block" /> {t('home.legendGame')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-500 inline-block" /> {t('home.legendNoGame')}
        </span>
      </div>

      {/* tapped-day detail */}
      {sel ? (
        <div className="rounded-lg border border-border bg-bg3 px-3 py-2 text-sm capitalize">
          <span className="font-medium">{fmtShort(sel)}</span>
          <span className="text-muted"> — </span>
          {isGameMonday(sel) && !cancelledSet.has(sel) ? (
            <span className="text-accent">{t('home.dayGameOn')}</span>
          ) : (
            <span className="text-red-400">
              {t('home.dayNoGame')}
              {offReason(sel) ? `: ${offReason(sel)}` : ''}
            </span>
          )}
        </div>
      ) : null}

      {isAdmin ? (
        <button
          className="w-full rounded-xl border border-dashed border-red-500/40 bg-red-500/10 text-red-300 text-sm font-semibold py-2"
          onClick={() => setShowCancel(true)}
        >
          🚫 {t('home.cancelGame')}
        </button>
      ) : null}

      {showCancel ? (
        <CancelModal
          locale={locale}
          cancelable={cancelable}
          activeCancellations={activeCancellations}
          offReason={offReason}
          onClose={() => setShowCancel(false)}
          onAdd={(date, reason) => addMut.mutate({ date, reason })}
          onRemove={(date) => removeMut.mutate(date)}
          busy={addMut.isPending || removeMut.isPending}
        />
      ) : null}
    </section>
  );
}

function CancelModal({
  locale,
  cancelable,
  activeCancellations,
  offReason,
  onClose,
  onAdd,
  onRemove,
  busy,
}: {
  locale: string;
  cancelable: string[];
  activeCancellations: string[];
  offReason: (iso: string) => string;
  onClose: () => void;
  onAdd: (date: string, reason: string) => void;
  onRemove: (date: string) => void;
  busy: boolean;
}) {
  const t = useT();
  const [date, setDate] = useState(cancelable[0] ?? '');
  const [reason, setReason] = useState('');
  const fmt = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-bg2 border border-border rounded-t-2xl sm:rounded-2xl p-4 w-full sm:max-w-md max-h-[90vh] overflow-y-auto space-y-3">
        <h3 className="text-lg font-bold">🚫 {t('home.cancelTitle')}</h3>
        <p className="text-xs text-muted">{t('home.cancelHint')}</p>

        {cancelable.length ? (
          <>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
              {t('home.cancelWhich')}
            </label>
            <select className="input capitalize" value={date} onChange={(e) => setDate(e.target.value)}>
              {cancelable.map((d) => (
                <option key={d} value={d}>
                  {fmt(d)}
                </option>
              ))}
            </select>

            <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
              {t('home.cancelReason')}
            </label>
            <input
              className="input"
              maxLength={80}
              placeholder={t('home.cancelReasonPh')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            <div className="flex gap-2 pt-1">
              <button className="btn flex-1" onClick={onClose}>
                {t('home.keepGame')}
              </button>
              <button
                className="btn-primary flex-1 !bg-red-500 !border-red-500"
                disabled={!date || busy}
                onClick={() => onAdd(date, reason.trim())}
              >
                {t('home.cancelConfirm')}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">{t('home.noUpcomingGames')}</p>
        )}

        {activeCancellations.length ? (
          <div className="pt-2 border-t border-border space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t('home.currentCancellations')}
            </div>
            {activeCancellations.map((d) => (
              <div key={d} className="flex items-center justify-between text-sm">
                <span className="capitalize">
                  {fmt(d)}
                  {offReason(d) ? <span className="text-muted"> — {offReason(d)}</span> : null}
                </span>
                <button className="text-xs text-accent" disabled={busy} onClick={() => onRemove(d)}>
                  {t('home.unCancel')}
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <p className="text-[11px] text-muted pt-1">{t('home.cancelNote')}</p>
      </div>
    </div>
  );
}
