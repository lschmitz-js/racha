import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { BestGrid } from '../components/Bests.js';
import { Leaderboard } from '../components/Leaderboard.js';
import { bestOfEachCategory, calcPoints, type StatRow } from '../lib/points.js';

interface SeasonRow extends StatRow {
  type: 'season' | 'dropin';
  matches_played: number;
  sessions_played: number;
}

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

