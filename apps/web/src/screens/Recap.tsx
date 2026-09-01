import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api } from '../lib/api.js';
import { useT, useI18n } from '../lib/i18n.js';
import { SEASON_START, SEASON_END } from '../lib/schedule.js';
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
  const t = useT();
  const { lang } = useI18n();
  const [scope, setScope] = useState<'season' | 'all'>('season');
  const range = scope === 'season' ? { from: SEASON_START, to: SEASON_END } : undefined;

  const seasonQ = useQuery({
    queryKey: ['stats', 'season', scope],
    queryFn: () => api.stats.season(range),
  });
  const weeksQ = useQuery({ queryKey: ['stats', 'weeks'], queryFn: api.stats.weeks });

  if (seasonQ.isLoading || weeksQ.isLoading)
    return <div className="p-4 text-muted">{t('common.loading')}</div>;

  const rows = (seasonQ.data ?? []) as SeasonRow[];
  const inRange = (d: string) => d >= SEASON_START && d <= SEASON_END;
  const weeks = ((weeksQ.data ?? []) as WeekRow[]).filter(
    (w) => scope === 'all' || inRange(w.date)
  );

  const leaderboard = rows
    .map((r) => ({ ...r, points: calcPoints(r) }))
    .sort((a, b) => b.points - a.points);
  const bests = bestOfEachCategory(rows);

  const locale = lang === 'pt' ? 'pt-BR' : 'en-US';
  const fmtSeasonDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    return new Date(y, m - 1, d).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  const rangeLabel =
    scope === 'season'
      ? `${fmtSeasonDate(SEASON_START)} → ${fmtSeasonDate(SEASON_END)}`
      : t('recap.scope.all');

  return (
    <div className="p-4 pb-28 space-y-5">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="title-lg">{t('recap.title')}</h1>
          <div className="inline-flex shrink-0 rounded-xl border border-border bg-bg3 p-0.5 text-sm">
            {(['season', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 py-1 rounded-lg transition ${
                  scope === s ? 'bg-accent text-white font-medium' : 'text-muted'
                }`}
              >
                {t(`recap.scope.${s}`)}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted tabular-nums">{rangeLabel}</p>
      </header>

      {rows.length === 0 || leaderboard.every((r) => r.points === 0) ? (
        <div className="text-sm text-muted">
          {scope === 'season' ? t('recap.noStatsSeason') : t('recap.noStats')}
        </div>
      ) : (
        <BestShowcase
          bests={bests}
          mvpLabel={scope === 'season' ? t('recap.mvpSeason') : t('recap.mvpAll')}
        />
      )}


      {/* Leaderboard */}
      {leaderboard.some((r) => r.points > 0) ? (
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
