import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Player, MIN_PLAYERS } from '@racha/shared';
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
  const checkinQ = useQuery({ queryKey: ['checkin'], queryFn: api.checkin.get });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [late, setLate] = useState<Set<string>>(new Set());

  // Pre-select whoever confirmed on the check-in board (once), so the organizer
  // starts from the confirmed list and just adjusts for no-shows / walk-ins.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    const confirmed = checkinQ.data?.confirmed;
    if (!confirmed) return;
    seededRef.current = true;
    if (confirmed.length) setSelected(new Set(confirmed.map((e) => e.id)));
  }, [checkinQ.data]);

  const create = useMutation({
    mutationFn: ({ ids, lateIds }: { ids: string[]; lateIds: string[] }) =>
      api.sessions.create(ids, lateIds),
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
      if (next.has(id)) {
        next.delete(id);
        setLate((l) => {
          if (!l.has(id)) return l;
          const ln = new Set(l);
          ln.delete(id);
          return ln;
        });
      } else next.add(id);
      return next;
    });
  }

  function toggleLate(id: string) {
    setLate((l) => {
      const next = new Set(l);
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

  const remaining = Math.max(0, MIN_PLAYERS - selected.size);

  return (
    <div className="pb-32">
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur border-b border-border px-4 pt-3 pb-2">
        <button className="text-sm text-muted" onClick={() => setLocation('/')}>
          {t('lineup.cancel')}
        </button>
        <h1 className="text-2xl font-bold">{t('lineup.title')}</h1>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-sm text-muted">{t('lineup.subtitle')}</p>
        {(checkinQ.data?.confirmed?.length ?? 0) > 0 ? (
          <p className="text-xs text-accent">
            {t('lineup.prefilled', { n: checkinQ.data!.confirmed.length })}
          </p>
        ) : null}

      {sessionPlayers.length > 0 ? (
        <section>
          <div className="text-xs uppercase tracking-wide text-muted mb-2">
            {t('home.seasonPlayers')}
          </div>
          <PlayerGrid players={sessionPlayers} selected={selected} late={late} onToggle={toggle} onToggleLate={toggleLate} />
        </section>
      ) : null}

      {dropinPlayers.length > 0 ? (
        <section>
          <div className="text-xs uppercase tracking-wide text-muted mb-2">
            {t('home.dropins')}
          </div>
          <PlayerGrid players={dropinPlayers} selected={selected} late={late} onToggle={toggle} onToggleLate={toggleLate} />
        </section>
      ) : null}

      </div>

      <div className="fixed bottom-16 inset-x-0 px-4 safe-bottom pointer-events-none">
        <div className="pointer-events-auto flex gap-2">
          <button
            className="btn-primary flex-1 text-base py-3"
            disabled={!canEdit || remaining > 0 || create.isPending}
            title={!canEdit ? t('auth.adminOnly') : undefined}
            onClick={() =>
              create.mutate({ ids: Array.from(selected), lateIds: Array.from(late) })
            }
          >
            <span>
              {remaining > 0 ? t('lineup.needMore', { n: remaining }) : t('lineup.start')}
            </span>
            <span className="ml-2 tabular-nums opacity-80">
              ({selected.size}
              {late.size > 0 ? ` · ${late.size} ⏰` : ''})
            </span>
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
  late,
  onToggle,
  onToggleLate,
}: {
  players: Player[];
  selected: Set<string>;
  late: Set<string>;
  onToggle: (id: string) => void;
  onToggleLate: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {players.map((p) => (
        <PlayerCard
          key={p.id}
          player={p}
          selected={selected.has(p.id)}
          late={late.has(p.id)}
          onClick={() => onToggle(p.id)}
          onToggleLate={() => onToggleLate(p.id)}
        />
      ))}
    </div>
  );
}

function PlayerCard({
  player,
  selected,
  late,
  onClick,
  onToggleLate,
}: {
  player: Player;
  selected: boolean;
  late: boolean;
  onClick: () => void;
  onToggleLate: () => void;
}) {
  const t = useT();
  return (
    <div
      className={`relative flex items-center rounded-xl border transition ${
        selected
          ? late
            ? 'border-amber-500 bg-amber-500/10'
            : 'border-accent bg-accent/10'
          : 'border-border bg-bg2'
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-2 p-2 flex-1 min-w-0 text-left"
      >
        <Avatar playerId={player.id} name={player.name} size={48} />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate text-sm">{player.name}</div>
          <div className="text-[10px] text-muted truncate">
            {selected && late ? (
              <span className="text-amber-400">⏰ {t('lineup.lateBadge')}</span>
            ) : null}
          </div>
        </div>
      </button>
      {selected ? (
        <span className={`absolute top-1 right-1 text-xs ${late ? 'text-amber-400' : 'text-accent'}`}>
          ✓
        </span>
      ) : null}
      {selected ? (
        <button
          type="button"
          aria-label={t('lineup.lateToggle', { name: player.name })}
          title={t('lineup.lateToggle', { name: player.name })}
          onClick={onToggleLate}
          className={`shrink-0 mr-1 px-2 py-1 rounded-lg border text-base leading-none ${
            late
              ? 'border-amber-500 bg-amber-500/20'
              : 'border-border bg-bg3 opacity-60'
          }`}
          style={{ minHeight: 36 }}
        >
          ⏰
        </button>
      ) : null}
    </div>
  );
}
