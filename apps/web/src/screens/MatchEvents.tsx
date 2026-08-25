import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useMemo, useState } from 'react';
import { uid, type EventType, type Player, type Vest } from '@racha/shared';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { useCanEdit } from '../lib/auth.js';
import { Avatar } from '../lib/avatar.js';
import { formatClock } from '../lib/clock.js';
import { useVests, pillStyle } from '../lib/vests.js';

const EVENT_TYPES: Array<{ type: EventType; icon: string }> = [
  { type: 'goal', icon: '⚽' },
  { type: 'assist', icon: '🅰' },
  { type: 'beautiful', icon: '✨' },
  { type: 'caneta', icon: '🪡' },
  { type: 'bad', icon: '💩' },
  { type: 'quasegol', icon: '😱' },
];

type Ev = {
  id: string;
  type: EventType;
  player_id: string;
  team_id: string;
  link_id: string | null;
  clock_ms: number;
};

interface Draft {
  id: string | null; // null → new event
  type: EventType | null;
  team_id: string | null;
  player_id: string | null;
  clockStr: string;
}

function parseClock(s: string): number | null {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(s.trim());
  if (!m) return null;
  return (Number(m[1]) * 60 + Number(m[2])) * 1000;
}

export function MatchEvents({ params }: { params: { id: string } }) {
  const matchId = params.id;
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const t = useT();
  const canEdit = useCanEdit();
  const vests = useVests();

  const matchQ = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => api.matches.get(matchId),
  });
  const playersQ = useQuery({ queryKey: ['players'], queryFn: api.players.list });
  const sessionQ = useQuery({
    queryKey: ['session', matchQ.data?.match?.session_id],
    queryFn: () => api.sessions.get(matchQ.data!.match.session_id),
    enabled: !!matchQ.data?.match?.session_id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['match', matchId] });
    // Edited events feed every leaderboard.
    qc.invalidateQueries({ queryKey: ['session'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
  };

  const createEvent = useMutation({ mutationFn: api.events.create, onSuccess: invalidate });
  const updateEvent = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof api.events.update>[1]) =>
      api.events.update(id, body),
    onSuccess: invalidate,
  });
  const removeEvent = useMutation({
    mutationFn: (id: string) => api.events.remove(id, false),
    onSuccess: invalidate,
  });

  const [draft, setDraft] = useState<Draft | null>(null);

  const players: Player[] = playersQ.data ?? [];
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  if (matchQ.isLoading || sessionQ.isLoading)
    return <div className="p-4 text-muted">{t('common.loading')}</div>;
  const data = matchQ.data;
  const sessionData = sessionQ.data;
  if (!data || !sessionData) return <div className="p-4">{t('common.notFound')}</div>;

  const m = data.match;
  const teams = (sessionData.teams ?? []) as { id: string; vest: Vest; player_ids: string[] }[];
  const teamById = new Map(teams.map((tm) => [tm.id, tm]));
  const playingTeams = [m.team_a_id, m.team_b_id]
    .map((id) => teamById.get(id))
    .filter(Boolean) as { id: string; vest: Vest }[];

  // Anyone invited to the session can be picked (rosters shift during a night).
  const sessionPlayers = (sessionData.player_ids as string[])
    .map((id) => playerById.get(id))
    .filter(Boolean)
    .sort((a, b) => a!.name.localeCompare(b!.name)) as Player[];

  const events = (data.events as Ev[]).filter(
    (e) => e.type !== 'sub_in' && e.type !== 'sub_out'
  );

  if (!canEdit) {
    return (
      <div className="p-4 space-y-3">
        <button className="text-sm text-muted" onClick={() => setLocation(`/matches/${matchId}`)}>
          {t('common.back')}
        </button>
        <div className="card text-sm text-muted">{t('auth.adminOnly')}</div>
      </div>
    );
  }

  function save() {
    if (!draft || !draft.type || !draft.team_id || !draft.player_id) return;
    const clock_ms = parseClock(draft.clockStr);
    if (clock_ms == null) return;
    if (draft.id) {
      updateEvent.mutate({
        id: draft.id,
        type: draft.type,
        player_id: draft.player_id,
        team_id: draft.team_id,
        clock_ms,
      });
    } else {
      createEvent.mutate({
        id: uid(),
        match_id: matchId,
        type: draft.type,
        player_id: draft.player_id,
        team_id: draft.team_id,
        link_id: null,
        clock_ms,
      });
    }
    setDraft(null);
  }

  const pending = createEvent.isPending || updateEvent.isPending || removeEvent.isPending;

  return (
    <div className="p-4 pb-32 space-y-4">
      <header>
        <button className="text-sm text-muted" onClick={() => setLocation(`/matches/${matchId}`)}>
          {t('common.back')}
        </button>
        <h1 className="text-xl font-bold">
          ✏️ {t('admin.matchEventsTitle', { n: m.ordinal })}
        </h1>
      </header>

      {events.length === 0 ? (
        <div className="card text-sm text-muted">{t('admin.noEvents')}</div>
      ) : (
        <div className="flex flex-col gap-1">
          {[...events]
            .sort((a, b) => a.clock_ms - b.clock_ms)
            .map((e) => {
              const team = teamById.get(e.team_id);
              const icon = EVENT_TYPES.find((b) => b.type === e.type)?.icon ?? '·';
              const player = playerById.get(e.player_id);
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg bg-bg2 border border-border"
                >
                  <span className="font-mono text-xs tabular-nums text-muted w-10">
                    {formatClock(e.clock_ms)}
                  </span>
                  <span className="text-lg w-6 text-center">{icon}</span>
                  <Avatar playerId={e.player_id} name={player?.name ?? '?'} size={24} />
                  <span className="text-sm font-medium truncate flex-1">
                    {player?.name ?? '?'}
                  </span>
                  {team ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={pillStyle(vests[team.vest].color)}>
                      {vests[team.vest].label}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="px-2 text-base"
                    aria-label={t('admin.editEvent')}
                    disabled={pending}
                    onClick={() =>
                      setDraft({
                        id: e.id,
                        type: e.type,
                        team_id: e.team_id,
                        player_id: e.player_id,
                        clockStr: formatClock(e.clock_ms),
                      })
                    }
                    style={{ minHeight: 36 }}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="px-2 text-base text-red-400"
                    aria-label={t('common.delete')}
                    disabled={pending}
                    onClick={() => {
                      if (confirm(t('admin.deleteEventConfirm'))) removeEvent.mutate(e.id);
                    }}
                    style={{ minHeight: 36 }}
                  >
                    🗑
                  </button>
                </div>
              );
            })}
        </div>
      )}

      <button
        className="btn-primary w-full"
        disabled={pending}
        onClick={() =>
          setDraft({
            id: null,
            type: null,
            team_id: playingTeams[0]?.id ?? null,
            player_id: null,
            clockStr: '00:00',
          })
        }
      >
        {t('admin.addEvent')}
      </button>

      {draft ? (
        <div className="fixed inset-0 bg-black/70 z-40 flex items-end">
          <div className="bg-bg2 border-t border-border rounded-t-xl p-4 w-full max-h-[90vh] overflow-y-auto space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {draft.id ? t('admin.editEvent') : t('admin.newEvent')}
              </h2>
              <button className="btn" onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </button>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-muted mb-1">
                {t('admin.eventType')}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {EVENT_TYPES.map((b) => (
                  <button
                    key={b.type}
                    type="button"
                    className={`btn justify-center px-1 text-xs ${
                      draft.type === b.type ? 'btn-primary ring-2 ring-accent' : ''
                    }`}
                    onClick={() => setDraft({ ...draft, type: b.type })}
                  >
                    <span className="text-base">{b.icon}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-muted mb-1">
                {t('admin.team')}
              </div>
              <div className="flex gap-2">
                {playingTeams.map((tm) => (
                  <button
                    key={tm.id}
                    type="button"
                    className={`flex-1 px-2 py-2 rounded-lg text-sm font-semibold ${
                      draft.team_id === tm.id ? 'ring-2 ring-accent' : 'opacity-60'
                    }`}
                    style={pillStyle(vests[tm.vest].color)}
                    onClick={() => setDraft({ ...draft, team_id: tm.id })}
                  >
                    {vests[tm.vest].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-muted mb-1">
                {t('admin.player')}
              </div>
              <div className="grid grid-cols-2 gap-1 max-h-[30vh] overflow-y-auto">
                {sessionPlayers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`flex items-center gap-2 px-2 py-1 rounded-lg border text-left ${
                      draft.player_id === p.id
                        ? 'border-accent bg-accent/10 ring-1 ring-accent'
                        : 'border-border bg-bg3'
                    }`}
                    onClick={() => setDraft({ ...draft, player_id: p.id })}
                    style={{ minHeight: 40 }}
                  >
                    <Avatar playerId={p.id} name={p.name} size={24} />
                    <span className="text-sm truncate flex-1">
                      {p.name}                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-muted mb-1">
                {t('admin.clock')}
              </div>
              <input
                type="text"
                inputMode="numeric"
                className={`w-28 bg-bg3 border rounded-lg px-3 py-2 font-mono tabular-nums ${
                  parseClock(draft.clockStr) == null ? 'border-red-500' : 'border-border'
                }`}
                value={draft.clockStr}
                onChange={(e) => setDraft({ ...draft, clockStr: e.target.value })}
                placeholder="03:45"
              />
            </div>

            <button
              className="btn-primary w-full"
              disabled={
                pending ||
                !draft.type ||
                !draft.team_id ||
                !draft.player_id ||
                parseClock(draft.clockStr) == null
              }
              onClick={save}
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
