import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { Avatar } from '../lib/avatar.js';
import { BestGrid } from '../components/Bests.js';
import { BestShowcase } from '../components/BestShowcase.js';
import { TopBoard } from '../components/TopBoard.js';
import {
  bestOfEachCategory,
  calcPoints,
  fmtPoints,
  type StatRow,
} from '../lib/points.js';

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

  const leaderboard = rows
    .map((r) => ({ ...r, points: calcPoints(r) }))
    .sort((a, b) => b.points - a.points);
  const bests = bestOfEachCategory(rows);

  return (
    <div className="p-4 pb-28 space-y-5">
      <header>
        <h1 className="title-lg">{t('recap.title')}</h1>
        <p className="text-sm text-muted">{t('recap.subtitle')}</p>
      </header>

      {rows.length === 0 ? <div className="text-sm text-muted">{t('recap.noStats')}</div> : null}

      <BestShowcase bests={bests} mvpLabel={t('recap.mvpSeason')} />


      {/* Season leaderboard */}
      {leaderboard.length > 0 ? (
        <section>
          <div className="section-head">
            <h2 className="font-semibold">{t('recap.leaderboard')}</h2>
          </div>
          <div className="space-y-1.5">
            {leaderboard.slice(0, 20).map((r, i) => (
              <div key={r.id} className="card flex items-center gap-3 py-2">
                <span className="w-5 text-center text-sm font-semibold text-muted tabular-nums shrink-0">
                  {i + 1}
                </span>
                <Avatar playerId={r.id} name={r.name} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-[11px] text-muted tabular-nums">
                    ⚽ {r.goals} · 🅰 {r.assists}
                  </div>
                </div>
                <span className="text-base font-bold tabular-nums text-accent shrink-0">
                  {fmtPoints(r.points)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Per-week recaps */}
      {weeks.length > 0 ? (
        <section>
          <div className="section-head">
            <h2 className="font-semibold">{t('recap.weeks')}</h2>
          </div>
          <div className="space-y-3">
            {weeks.map((w) => (
              <WeekCard key={w.session_id} week={w} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function WeekCard({ week }: { week: WeekRow }) {
  const t = useT();
  const bests = bestOfEachCategory(week.leaderboard);
  return (
    <div className="card space-y-2">
      <Link
        href={`/sessions/${week.session_id}`}
        className="flex items-center justify-between hover:text-accent no-underline text-fg"
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
      {bests.length > 0 ? (
        <>
          <div className="tile-label pt-1">{t('recap.bestOfDay')}</div>
          <BestGrid bests={bests} compact />
          <div className="grid grid-cols-2 gap-3 pt-1">
            <TopBoard rows={week.leaderboard} stat="goals" icon="⚽" title={t('recap.cat.goals')} limit={5} compact />
            <TopBoard rows={week.leaderboard} stat="assists" icon="🅰" title={t('recap.cat.assists')} limit={5} compact />
          </div>
        </>
      ) : null}
    </div>
  );
}
