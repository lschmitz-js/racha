import { useState } from 'react';
import { Avatar } from '../lib/avatar.js';
import { useT } from '../lib/i18n.js';
import { fmtPoints, POINTS_WEIGHTS, type StatRow } from '../lib/points.js';

export type SortKey =
  | 'name'
  | 'goals'
  | 'assists'
  | 'beautiful'
  | 'bad'
  | 'saves'
  | 'canetas'
  | 'quasegols'
  | 'matches_played'
  | 'sessions_played'
  | 'points';

export interface LeaderboardRow extends StatRow {
  matches_played?: number;
  sessions_played?: number;
  points: number;
}

export function Leaderboard({
  rows,
  showMatches = true,
  showSessions = true,
  defaultSort = 'goals',
}: {
  rows: LeaderboardRow[];
  showMatches?: boolean;
  showSessions?: boolean;
  defaultSort?: SortKey;
}) {
  const t = useT();
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort);
  const [desc, setDesc] = useState(true);
  const [showLegend, setShowLegend] = useState(false);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setDesc((d) => !d);
    } else {
      setSortKey(key);
      setDesc(key !== 'name');
    }
  }

  const sorted = [...rows].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    if (sortKey === 'name') {
      av = a.name.toLowerCase();
      bv = b.name.toLowerCase();
    } else {
      av = (a as any)[sortKey] ?? 0;
      bv = (b as any)[sortKey] ?? 0;
    }
    let cmp = 0;
    if (av < bv) cmp = -1;
    else if (av > bv) cmp = 1;
    if (cmp === 0) cmp = a.name.localeCompare(b.name);
    return desc ? -cmp : cmp;
  });

  const cols: Array<{ key: SortKey; label: string; tip?: string; align?: 'left' | 'right' }> = [
    { key: 'name', label: t('recap.player'), align: 'left' },
    { key: 'goals', label: 'G', tip: t('event.goal') },
    { key: 'assists', label: 'A', tip: t('event.assist') },
    { key: 'beautiful', label: '✨', tip: t('event.beautiful') },
    { key: 'bad', label: '💩', tip: t('event.bad') },
    { key: 'saves', label: '🧤', tip: t('event.save') },
    { key: 'canetas', label: '🪡', tip: t('event.caneta') },
    { key: 'quasegols', label: '😱', tip: t('event.quasegol') },
    ...(showMatches
      ? [{ key: 'matches_played' as const, label: t('recap.matchesShort'), tip: t('legend.matches') }]
      : []),
    ...(showSessions
      ? [{ key: 'sessions_played' as const, label: t('recap.sessionsShort'), tip: t('legend.sessions') }]
      : []),
    { key: 'points', label: t('recap.pts'), tip: t('legend.points') },
  ];

  // Derive the formula from the real weights so the legend can't drift.
  const formulaParts: Array<[number, string]> = [
    [POINTS_WEIGHTS.goal, 'G'],
    [POINTS_WEIGHTS.assist, 'A'],
    [POINTS_WEIGHTS.save, '🧤'],
    [POINTS_WEIGHTS.beautiful, '✨'],
    [POINTS_WEIGHTS.caneta, '🪡'],
    [POINTS_WEIGHTS.bad, '💩'],
    [POINTS_WEIGHTS.quasegol, '😱'],
  ];
  const formula = formulaParts
    .map(([w, sym], i) => `${w < 0 ? '− ' : i > 0 ? '+ ' : ''}${Math.abs(w)}×${sym}`)
    .join(' ');

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr>
            {cols.map((c) => {
              const active = sortKey === c.key;
              const arrow = active ? (desc ? ' ↓' : ' ↑') : '';
              return (
                <th
                  key={c.key}
                  title={c.tip}
                  className={`p-1 select-none cursor-pointer hover:text-accent ${
                    c.align === 'left' ? 'text-left' : 'text-right'
                  } ${active ? 'text-accent' : ''}`}
                  onClick={() => toggleSort(c.key)}
                >
                  {c.label}
                  {arrow}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="p-1 font-medium">
                <span className="inline-flex items-center gap-2">
                  <Avatar playerId={r.id} name={r.name} size={24} />
                  <span>{r.name}</span>
                </span>
              </td>
              <td className="p-1 text-right tabular-nums">{r.goals}</td>
              <td className="p-1 text-right tabular-nums">{r.assists}</td>
              <td className="p-1 text-right tabular-nums">{r.beautiful}</td>
              <td className="p-1 text-right tabular-nums">{r.bad}</td>
              <td className="p-1 text-right tabular-nums">{r.saves}</td>
              <td className="p-1 text-right tabular-nums">{r.canetas ?? 0}</td>
              <td className="p-1 text-right tabular-nums">{r.quasegols ?? 0}</td>
              {showMatches ? (
                <td className="p-1 text-right tabular-nums">{r.matches_played ?? 0}</td>
              ) : null}
              {showSessions ? (
                <td className="p-1 text-right tabular-nums">{r.sessions_played ?? 0}</td>
              ) : null}
              <td className="p-1 text-right tabular-nums font-semibold">
                {fmtPoints(r.points)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        type="button"
        className="text-xs text-muted hover:text-accent mt-2 px-1"
        onClick={() => setShowLegend((s) => !s)}
        style={{ minHeight: 'auto' }}
      >
        ⓘ {t('legend.title')}
      </button>
      {showLegend ? (
        <div className="mt-1 pt-2 border-t border-border text-xs text-muted space-y-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {cols
              .filter((c) => c.tip && c.key !== 'points')
              .map((c) => (
                <div key={c.key} className="flex gap-2">
                  <span className="w-5 shrink-0 text-center">{c.label}</span>
                  <span>{c.tip}</span>
                </div>
              ))}
          </div>
          <div className="pt-1">
            <span className="font-semibold">{t('recap.pts')}</span> ({t('legend.points')}) ={' '}
            <span className="tabular-nums">{formula}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
