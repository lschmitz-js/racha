import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useState } from 'react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { Avatar } from '../lib/avatar.js';
import { BestGrid } from '../components/Bests.js';
import { bestOfEachCategory, calcPoints, fmtPoints, type StatRow } from '../lib/points.js';

interface SeasonRow extends StatRow {
  type: 'season' | 'dropin';
  matches_played: number;
  sessions_played: number;
}

type SortKey =
  | 'name'
  | 'goals'
  | 'assists'
  | 'beautiful'
  | 'bad'
  | 'saves'
  | 'matches_played'
  | 'sessions_played'
  | 'points';

interface WeekRow {
  session_id: string;
  date: string;
  status: 'draft' | 'live' | 'done';
  matches: number;
  goals: number;
  leaderboard: StatRow[];
}

export function Recap() {
  const seasonQ = useQuery({ queryKey: ['stats', 'season'], queryFn: api.stats.season });
  const weeksQ = useQuery({ queryKey: ['stats', 'weeks'], queryFn: api.stats.weeks });
  const t = useT();

  if (seasonQ.isLoading || weeksQ.isLoading)
    return <div className="p-4 text-muted">{t('common.loading')}</div>;

  const rows = (seasonQ.data ?? []) as SeasonRow[];
  const weeks = (weeksQ.data ?? []) as WeekRow[];

  const seasonWithPoints = rows.map((r) => ({ ...r, points: calcPoints(r) }));
  const seasonBest = bestOfEachCategory(rows);

  return (
    <div className="p-4 pb-32 space-y-6">
      <h1 className="text-2xl font-bold">{t('recap.title')}</h1>

      <section>
        <h2 className="text-lg font-semibold mb-2">{t('recap.bestOfSeason')}</h2>
        <BestGrid bests={seasonBest} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">{t('recap.leaderboard')}</h2>
        <Leaderboard rows={seasonWithPoints} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">{t('recap.weeks')}</h2>
        <div className="space-y-3">
          {weeks.map((w) => (
            <WeekCard key={w.session_id} week={w} />
          ))}
        </div>
      </section>
    </div>
  );
}

type LeaderboardRow = SeasonRow & { points: number };

function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  const t = useT();
  const [sortKey, setSortKey] = useState<SortKey>('goals');
  const [desc, setDesc] = useState(true);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setDesc((d) => !d);
    } else {
      setSortKey(key);
      // numeric columns default to descending; name defaults to ascending
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
    { key: 'matches_played', label: t('recap.matchesShort') },
    { key: 'sessions_played', label: t('recap.sessionsShort') },
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
              <td className="p-1 text-right tabular-nums">{r.matches_played}</td>
              <td className="p-1 text-right tabular-nums">{r.sessions_played}</td>
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

function WeekCard({ week }: { week: WeekRow }) {
  const t = useT();
  const bests = bestOfEachCategory(week.leaderboard);
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <Link
          href={`/sessions/${week.session_id}`}
          className="flex-1 flex items-center justify-between hover:text-accent"
        >
          <div>
            <div className="font-medium">{week.date}</div>
            <div className="text-xs text-muted">
              {t(`status.${week.status as 'draft' | 'live' | 'done'}`)}
            </div>
          </div>
          <div className="text-sm tabular-nums text-muted">
            {t('recap.matchesGoals', { m: week.matches, g: week.goals })}
          </div>
        </Link>
      </div>
      {bests.length > 0 ? (
        <>
          <div className="text-[10px] uppercase tracking-wide text-muted pt-1">
            {t('recap.bestOfDay')}
          </div>
          <BestGrid bests={bests} compact />
        </>
      ) : null}
    </div>
  );
}

