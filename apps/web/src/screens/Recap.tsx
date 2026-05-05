import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { Avatar } from '../lib/avatar.js';
import { bestOfEachCategory, calcPoints, fmtPoints, type BestEntry, type StatRow } from '../lib/points.js';

interface SeasonRow extends StatRow {
  type: 'season' | 'dropin';
  matches_played: number;
}

interface WeekRow {
  session_id: string;
  date: string;
  status: 'draft' | 'live' | 'done';
  matches: number;
  goals: number;
  leaderboard: StatRow[];
}

const CATEGORY_ICON: Record<BestEntry['category'], string> = {
  mvp: '👑',
  goals: '⚽',
  assists: '🅰',
  beautiful: '✨',
  bad: '💩',
  saves: '🧤',
};

export function Recap() {
  const seasonQ = useQuery({ queryKey: ['stats', 'season'], queryFn: api.stats.season });
  const weeksQ = useQuery({ queryKey: ['stats', 'weeks'], queryFn: api.stats.weeks });
  const t = useT();

  if (seasonQ.isLoading || weeksQ.isLoading)
    return <div className="p-4 text-muted">{t('common.loading')}</div>;

  const rows = (seasonQ.data ?? []) as SeasonRow[];
  const weeks = (weeksQ.data ?? []) as WeekRow[];

  const seasonRanked = [...rows]
    .map((r) => ({ ...r, points: calcPoints(r) }))
    .sort((a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name));
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
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="text-left p-1">{t('recap.player')}</th>
                <th className="text-right p-1">{t('recap.pts')}</th>
                <th className="text-right p-1">G</th>
                <th className="text-right p-1">A</th>
                <th className="text-right p-1">✨</th>
                <th className="text-right p-1">💩</th>
                <th className="text-right p-1">🧤</th>
              </tr>
            </thead>
            <tbody>
              {seasonRanked.map((r) => (
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
                  <td className="p-1 text-right tabular-nums font-semibold">
                    {fmtPoints(r.points)}
                  </td>
                  <td className="p-1 text-right tabular-nums">{r.goals}</td>
                  <td className="p-1 text-right tabular-nums">{r.assists}</td>
                  <td className="p-1 text-right tabular-nums">{r.beautiful}</td>
                  <td className="p-1 text-right tabular-nums">{r.bad}</td>
                  <td className="p-1 text-right tabular-nums">{r.saves}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

function BestGrid({ bests, compact }: { bests: BestEntry[]; compact?: boolean }) {
  const t = useT();
  if (bests.length === 0) {
    return <div className="text-sm text-muted">{t('recap.noStats')}</div>;
  }
  return (
    <div
      className={`grid gap-2 ${
        compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'
      }`}
    >
      {bests.map((b) => (
        <BestCard key={b.category} entry={b} compact={compact} />
      ))}
    </div>
  );
}

function BestCard({ entry, compact }: { entry: BestEntry; compact?: boolean }) {
  const t = useT();
  const value =
    entry.category === 'mvp' ? fmtPoints(entry.value) : entry.value.toString();
  return (
    <div
      className={`rounded-lg border ${
        entry.category === 'mvp'
          ? 'border-accent bg-accent/10'
          : 'border-border bg-bg2'
      } ${compact ? 'p-2' : 'p-3'}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted flex items-center gap-1">
        <span>{CATEGORY_ICON[entry.category]}</span>
        <span>{t(`recap.cat.${entry.category}`)}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <Avatar
          playerId={entry.player.id}
          name={entry.player.name}
          size={compact ? 32 : 40}
        />
        <div className="min-w-0">
          <div
            className={`font-semibold truncate ${compact ? 'text-sm' : 'text-base'}`}
          >
            {entry.player.name}
            {entry.player.role === 'gk' ? (
              <span className="ml-1 text-xs">🧤</span>
            ) : null}
          </div>
          <div className="text-xs text-muted tabular-nums">{value}</div>
        </div>
      </div>
    </div>
  );
}
