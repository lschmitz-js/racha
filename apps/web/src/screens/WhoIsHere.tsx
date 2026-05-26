import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useMemo, useState } from 'react';
import type { Player } from '@racha/shared';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { useCanEdit } from '../lib/auth.js';
import { Avatar } from '../lib/avatar.js';

export function WhoIsHere() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const t = useT();
  const canEdit = useCanEdit();

  const playersQ = useQuery({ queryKey: ['players'], queryFn: api.players.list });
  const activeQ = useQuery({ queryKey: ['session', 'active'], queryFn: api.sessions.active });

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const create = useMutation({
    mutationFn: (ids: string[]) => api.sessions.create(ids),
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ['session', 'active'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      setLocation(`/sessions/${id}`);
    },
  });

  const players = playersQ.data ?? [];
  const sessionPlayers = useMemo(() => players.filter((p) => p.type === 'season' && p.active), [players]);
  const dropinPlayers = useMemo(() => players.filter((p) => p.type === 'dropin' && p.active), [players]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (playersQ.isLoading) return <div className="p-4 text-muted">{t('common.loading')}</div>;

  if (activeQ.data) {
    // Block the lineup flow if a session is already running.
    return (
      <div className="p-4 space-y-4">
        <button className="text-sm text-muted" onClick={() => setLocation('/')}>
          {t('common.home')}
        </button>
        <div className="card flex items-center justify-between">
          <div>
            <div className="text-sm text-muted">{t('home.activeSession')}</div>
            <div className="font-semibold">{activeQ.data.date}</div>
          </div>
          <button className="btn-primary" onClick={() => setLocation(`/sessions/${activeQ.data.id}`)}>
            {t('home.open')}
          </button>
        </div>
      </div>
    );
  }

  const remaining = Math.max(0, 6 - selected.size);

  return (
    <div className="pb-32">
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur border-b border-border px-4 pt-3 pb-2 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <button className="text-sm text-muted" onClick={() => setLocation('/')}>
            {t('lineup.cancel')}
          </button>
          <span
            className={`px-3 py-1 rounded-full text-sm font-semibold tabular-nums ${
              selected.size >= 6
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-bg3 text-muted border border-border'
            }`}
          >
            {t('home.selected', { n: selected.size })}
          </span>
        </div>
        <h1 className="text-2xl font-bold">{t('lineup.title')}</h1>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-sm text-muted">{t('lineup.subtitle')}</p>

      {sessionPlayers.length > 0 ? (
        <section>
          <div className="text-xs uppercase tracking-wide text-muted mb-2">
            {t('home.seasonPlayers')}
          </div>
          <PlayerGrid players={sessionPlayers} selected={selected} onToggle={toggle} />
        </section>
      ) : null}

      {dropinPlayers.length > 0 ? (
        <section>
          <div className="text-xs uppercase tracking-wide text-muted mb-2">
            {t('home.dropins')}
          </div>
          <PlayerGrid players={dropinPlayers} selected={selected} onToggle={toggle} />
        </section>
      ) : null}

      </div>

      <div className="fixed bottom-16 inset-x-0 px-4 safe-bottom pointer-events-none">
        <div className="pointer-events-auto flex gap-2">
          <button
            className="btn-primary flex-1 text-base py-3"
            disabled={!canEdit || remaining > 0 || create.isPending}
            title={!canEdit ? t('auth.adminOnly') : undefined}
            onClick={() => create.mutate(Array.from(selected))}
          >
            {remaining > 0 ? t('lineup.needMore', { n: remaining }) : t('lineup.start')}
          </button>
          {selected.size > 0 ? (
            <button className="btn" onClick={() => setSelected(new Set())}>
              {t('common.clear')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PlayerGrid({
  players,
  selected,
  onToggle,
}: {
  players: Player[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {players.map((p) => (
        <PlayerCard
          key={p.id}
          player={p}
          selected={selected.has(p.id)}
          onClick={() => onToggle(p.id)}
        />
      ))}
    </div>
  );
}

function PlayerCard({
  player,
  selected,
  onClick,
}: {
  player: Player;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 p-2 rounded-xl border transition text-left ${
        selected ? 'border-accent bg-accent/10' : 'border-border bg-bg2'
      }`}
    >
      <Avatar playerId={player.id} name={player.name} size={48} />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate text-sm">{player.name}</div>
        <div className="text-[10px] text-muted truncate">
          {player.role === 'gk' ? '🧤 GK' : ''}
        </div>
      </div>
      {selected ? (
        <span className="absolute top-1 right-1 text-accent text-xs">✓</span>
      ) : null}
    </button>
  );
}
