import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';

interface SeasonRow {
  id: string;
  name: string;
  type: 'season' | 'dropin';
  role: 'player' | 'gk';
  matches_played: number;
  goals: number;
  assists: number;
  beautiful: number;
  silly: number;
  bad: number;
  saves: number;
}

export function Recap() {
  const seasonQ = useQuery({ queryKey: ['stats', 'season'], queryFn: api.stats.season });
  const weeksQ = useQuery({ queryKey: ['stats', 'weeks'], queryFn: api.stats.weeks });
  const t = useT();

  if (seasonQ.isLoading || weeksQ.isLoading)
    return <div className="p-4 text-muted">{t('common.loading')}</div>;

  const rows = (seasonQ.data ?? []) as SeasonRow[];
  const weeks = weeksQ.data ?? [];

  return (
    <div className="p-4 pb-32 space-y-6">
      <h1 className="text-2xl font-bold">{t('recap.title')}</h1>

      <section>
        <h2 className="text-lg font-semibold mb-2">{t('recap.leaderboard')}</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="text-left p-1">{t('recap.player')}</th>
                <th className="text-right p-1">G</th>
                <th className="text-right p-1">A</th>
                <th className="text-right p-1">✨</th>
                <th className="text-right p-1">😬</th>
                <th className="text-right p-1">💀</th>
                <th className="text-right p-1">🧤</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-1 font-medium">
                    {r.name}
                    {r.role === 'gk' ? <span className="ml-1 text-xs">🧤</span> : null}
                  </td>
                  <td className="p-1 text-right tabular-nums">{r.goals}</td>
                  <td className="p-1 text-right tabular-nums">{r.assists}</td>
                  <td className="p-1 text-right tabular-nums">{r.beautiful}</td>
                  <td className="p-1 text-right tabular-nums">{r.silly}</td>
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
        <div className="space-y-2">
          {weeks.map((w: any) => (
            <Link
              key={w.session_id}
              href={`/sessions/${w.session_id}`}
              className="card flex items-center justify-between hover:border-accent"
            >
              <div>
                <div className="font-medium">{w.date}</div>
                <div className="text-xs text-muted">{t(`status.${w.status as 'draft' | 'live' | 'done'}`)}</div>
              </div>
              <div className="text-sm tabular-nums">
                {t('recap.matchesGoals', { m: w.matches, g: w.goals })}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
