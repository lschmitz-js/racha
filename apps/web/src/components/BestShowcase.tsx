import { useT } from '../lib/i18n.js';
import { Avatar } from '../lib/avatar.js';
import { fmtPoints, type BestEntry } from '../lib/points.js';

const CAT_ICON: Record<BestEntry['category'], string> = {
  mvp: '👑',
  goals: '⚽',
  assists: '🅰',
  beautiful: '✨',
  bad: '💩',
  saves: '🧤',
  canetas: '🪡',
  quasegols: '😱',
};
// Order of the stat-tile grid (mvp is the hero tile, rendered separately).
const TILE_ORDER: BestEntry['category'][] = ['goals', 'assists', 'saves', 'beautiful', 'canetas', 'bad'];

// MVP hero tile + a 2-col grid of icon-labeled stat tiles. Shared by the Stats
// screen (season) and the completed-session recap (day).
export function BestShowcase({ bests, mvpLabel }: { bests: BestEntry[]; mvpLabel?: string }) {
  const t = useT();
  const mvp = bests.find((b) => b.category === 'mvp');
  const tiles = TILE_ORDER.map((c) => bests.find((b) => b.category === c)).filter(
    (b): b is BestEntry => !!b
  );

  return (
    <div className="space-y-3">
      {mvp ? (
        <div className="rounded-2xl border border-accent/40 bg-accent/[0.08] p-4 flex items-center gap-3">
          <div className="relative w-12 h-12 shrink-0">
            {mvp.players[0] ? (
              <Avatar playerId={mvp.players[0].id} name={mvp.players[0].name} size={48} />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-accent/20 text-accent flex items-center justify-center text-2xl">
                👑
              </div>
            )}
            <span className="absolute -top-1.5 -right-1.5 text-base">👑</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="tile-label text-accent">{mvpLabel ?? t('recap.cat.mvp')}</div>
            <div className="text-lg font-bold truncate">
              {mvp.players.map((p) => p.name).join(', ')}
            </div>
          </div>
          <div className="text-2xl font-bold tabular-nums text-accent">{fmtPoints(mvp.value)}</div>
        </div>
      ) : null}

      {tiles.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((b) => (
            <div key={b.category} className="stat-tile">
              <div className="tile-label">
                <span>{CAT_ICON[b.category]}</span>
                <span>{t(`recap.cat.${b.category}`)}</span>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                {b.players[0] ? (
                  <Avatar playerId={b.players[0].id} name={b.players[0].name} size={20} />
                ) : null}
                <span className="font-semibold truncate">
                  {b.players.map((p) => p.name).join(', ')}
                </span>
              </div>
              <div className="text-xs text-muted">
                {b.value} {t(`recap.unit.${b.category}` as any)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
