import { Avatar } from '../lib/avatar.js';
import { useT } from '../lib/i18n.js';
import { fmtPoints, type BestEntry } from '../lib/points.js';

const CATEGORY_ICON: Record<BestEntry['category'], string> = {
  mvp: '👑',
  goals: '⚽',
  assists: '🅰',
  beautiful: '✨',
  bad: '💩',
  saves: '🧤',
  canetas: '🪡',
  quasegols: '😱',
};

export function BestGrid({
  bests,
  compact,
}: {
  bests: BestEntry[];
  compact?: boolean;
}) {
  const t = useT();
  if (bests.length === 0) {
    return <div className="text-sm text-muted">{t('recap.noStats')}</div>;
  }
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
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
  const players = entry.players;
  const tied = players.length > 1;
  const names = players
    .map((p) => `${p.name}${p.role === 'gk' ? ' 🧤' : ''}`)
    .join(', ');
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
        <div className="flex -space-x-2 shrink-0">
          {players.slice(0, 3).map((p) => (
            <Avatar
              key={p.id}
              playerId={p.id}
              name={p.name}
              size={compact ? 28 : tied ? 32 : 40}
            />
          ))}
        </div>
        <div className="min-w-0">
          <div
            className={`font-semibold ${
              tied
                ? 'text-xs leading-tight break-words'
                : `truncate ${compact ? 'text-sm' : 'text-base'}`
            }`}
            title={names}
          >
            {names}
          </div>
          <div className="text-xs text-muted tabular-nums">{value}</div>
        </div>
      </div>
    </div>
  );
}
