import { Avatar } from '../lib/avatar.js';
import type { StatRow } from '../lib/points.js';

const MEDALS = ['🥇', '🥈', '🥉'];

// Ranked single-stat board (top scorers / top playmakers). Ties broken by the
// complementary stat, then by name.
export function TopBoard({
  rows,
  stat,
  title,
  icon,
  limit = 8,
  compact = false,
}: {
  rows: StatRow[];
  stat: 'goals' | 'assists';
  title: string;
  icon: string;
  limit?: number;
  compact?: boolean;
}) {
  const other: 'goals' | 'assists' = stat === 'goals' ? 'assists' : 'goals';
  const ranked = rows
    .filter((r) => (r[stat] ?? 0) > 0)
    .sort(
      (a, b) =>
        (b[stat] ?? 0) - (a[stat] ?? 0) ||
        (b[other] ?? 0) - (a[other] ?? 0) ||
        a.name.localeCompare(b.name)
    )
    .slice(0, limit);

  if (ranked.length === 0) return null;

  // Competition ranking: equal stat → equal rank (and medal), next rank skips.
  const rankOf = ranked.map((r, i) => {
    if (i === 0) return 0;
    return r[stat] === ranked[i - 1]![stat] ? -1 : i; // -1 → same as previous
  });
  for (let i = 1; i < rankOf.length; i++) {
    if (rankOf[i] === -1) rankOf[i] = rankOf[i - 1]!;
  }

  return (
    <div className={compact ? '' : 'card'}>
      <div className="text-[10px] uppercase tracking-wide text-muted mb-1">
        {icon} {title}
      </div>
      <div className="flex flex-col">
        {ranked.map((r, i) => (
          <div
            key={r.id}
            className={`flex items-center gap-2 py-1 ${
              i > 0 ? 'border-t border-border/60' : ''
            }`}
          >
            <span className="w-6 text-center text-sm tabular-nums shrink-0">
              {MEDALS[rankOf[i]!] ?? (
                <span className="text-xs text-muted">{rankOf[i]! + 1}</span>
              )}
            </span>
            <Avatar playerId={r.id} name={r.name} size={compact ? 20 : 24} />
            <span className={`font-medium truncate flex-1 ${compact ? 'text-xs' : 'text-sm'}`}>
              {r.name}
            </span>
            <span className={`tabular-nums font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>
              {r[stat]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
