import { useState } from 'react';
import { Avatar } from '../lib/avatar.js';
import { useT } from '../lib/i18n.js';
import { fmtPoints, type StatRow } from '../lib/points.js';

export type SortKey =
  | 'name'
  | 'goals'
  | 'assists'
  | 'beautiful'
  | 'bad'
  | 'saves'
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

  const cols: Array<{ key: SortKey; label: string; align?: 'left' | 'right' }> = [
    { key: 'name', label: t('recap.player'), align: 'left' },
    { key: 'goals', label: 'G' },
    { key: 'assists', label: 'A' },
    { key: 'beautiful', label: '✨' },
    { key: 'bad', label: '💩' },
    { key: 'saves', label: '🧤' },
    ...(showMatches
      ? [{ key: 'matches_played' as const, label: t('recap.matchesShort') }]
      : []),
    ...(showSessions
      ? [{ key: 'sessions_played' as const, label: t('recap.sessionsShort') }]
      : []),
    { key: 'points', label: t('recap.pts') },
  ];

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
                  <span>
                    {r.name}
                    {r.role === 'gk' ? <span className="ml-1 text-xs">🧤</span> : null}
                  </span>
                </span>
              </td>
              <td className="p-1 text-right tabular-nums">{r.goals}</td>
              <td className="p-1 text-right tabular-nums">{r.assists}</td>
              <td className="p-1 text-right tabular-nums">{r.beautiful}</td>
              <td className="p-1 text-right tabular-nums">{r.bad}</td>
              <td className="p-1 text-right tabular-nums">{r.saves}</td>
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
    </div>
  );
}
