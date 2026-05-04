import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

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

  if (seasonQ.isLoading || weeksQ.isLoading) return <div className="p-4 text-muted">Loading…</div>;

  const rows = (seasonQ.data ?? []) as SeasonRow[];
  const weeks = weeksQ.data ?? [];

  return (
    <div className="p-4 pb-32 space-y-6">
      <h1 className="text-2xl font-bold">Season recap</h1>

      <section>
        <h2 className="text-lg font-semibold mb-2">Leaderboard</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="text-left p-1">Player</th>
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
        <h2 className="text-lg font-semibold mb-2">Weeks</h2>
        <div className="space-y-2">
          {weeks.map((w: any) => (
            <div key={w.session_id} className="card flex items-center justify-between">
              <div>
                <div className="font-medium">{w.date}</div>
                <div className="text-xs text-muted capitalize">{w.status}</div>
              </div>
              <div className="text-sm tabular-nums">
                {w.matches} matches · {w.goals} goals
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
