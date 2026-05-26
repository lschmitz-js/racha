import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useEffect, useMemo, useRef, useState } from 'react';
import { uid, type EventType, type Player, type Vest } from '@racha/shared';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { Avatar } from '../lib/avatar.js';
import { formatClock, useClock, computeClockMs } from '../lib/clock.js';

const VEST_COLORS: Record<Vest, string> = {
  white: 'bg-gray-100 text-black',
  black: 'bg-gray-900 text-white',
  green: 'bg-green-700 text-white',
};

const VEST_TEXT: Record<Vest, string> = {
  white: 'text-white',
  black: 'text-slate-300',
  green: 'text-green-300',
};

const VEST_BORDER: Record<Vest, string> = {
  white: 'border-white_v/40',
  black: 'border-slate-500/60',
  green: 'border-green_v/60',
};

const TARGET_MS = 5 * 60 * 1000;

const EVENT_BUTTONS: Array<{ type: EventType; icon: string }> = [
  { type: 'goal', icon: '⚽' },
  { type: 'assist', icon: '🅰' },
  { type: 'beautiful', icon: '✨' },
  { type: 'bad', icon: '💩' },
  { type: 'save', icon: '🧤' },
];

interface Toast {
  text: string;
  eventId: string;
  linkId: string;
  type: EventType;
  scorerTeamId: string;
  scorerId: string;
  expiresAt: number;
}

type SessionTeam = { id: string; vest: Vest; player_ids: string[] };

export function Match({ params }: { params: { id: string } }) {
  const matchId = params.id;
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const t = useT();

  const matchQ = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => api.matches.get(matchId),
    refetchInterval: (q) => (q.state.data?.match?.status === 'running' ? 3000 : false),
  });
  const playersQ = useQuery({ queryKey: ['players'], queryFn: api.players.list });
  const sessionQ = useQuery({
    queryKey: ['session', matchQ.data?.match?.session_id],
    queryFn: () => api.sessions.get(matchQ.data!.match.session_id),
    enabled: !!matchQ.data?.match?.session_id,
  });

  const start = useMutation({
    mutationFn: () => api.matches.start(matchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['match', matchId] }),
  });
  const pause = useMutation({
    mutationFn: () => api.matches.pause(matchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['match', matchId] }),
  });
  const resume = useMutation({
    mutationFn: () => api.matches.resume(matchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['match', matchId] }),
  });
  const end = useMutation({
    mutationFn: (result?: 'a' | 'b' | 'draw') =>
      api.matches.end(matchId, result ? { result } : undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['match', matchId] }),
  });

  const submitEvent = useMutation({
    mutationFn: api.events.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['match', matchId] }),
  });
  const removeEvent = useMutation({
    mutationFn: ({ id, link }: { id: string; link: boolean }) => api.events.remove(id, link),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['match', matchId] }),
  });
  const assignToTeam = useMutation({
    mutationFn: ({ teamId, playerId }: { teamId: string; playerId: string }) =>
      api.sessions.assignPlayerToTeam(matchQ.data!.match.session_id, teamId, playerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session', matchQ.data!.match.session_id] });
      qc.invalidateQueries({ queryKey: ['match', matchId] });
    },
  });

  const [armedEvent, setArmedEvent] = useState<EventType | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [benchOpen, setBenchOpen] = useState(false);
  const buzzedRef = useRef(false);

  const players: Player[] = playersQ.data ?? [];
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const liveClock = useClock(matchQ.data?.match);

  useEffect(() => {
    if (!matchQ.data?.match) return;
    const m = matchQ.data.match;
    if (m.status !== 'running') {
      buzzedRef.current = false;
      return;
    }
    if (!buzzedRef.current && liveClock >= TARGET_MS) {
      buzzedRef.current = true;
      try {
        navigator.vibrate?.(200);
      } catch {}
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 660;
        osc.connect(gain).connect(ctx.destination);
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      } catch {}
    }
  }, [liveClock, matchQ.data?.match?.status]);

  useEffect(() => {
    if (!toast) return;
    const remaining = toast.expiresAt - Date.now();
    if (remaining <= 0) {
      setToast(null);
      return;
    }
    const timer = setTimeout(() => setToast(null), remaining);
    return () => clearTimeout(timer);
  }, [toast]);

  if (matchQ.isLoading || sessionQ.isLoading) return <div className="p-4 text-muted">{t('common.loading')}</div>;
  const data = matchQ.data;
  if (!data) return <div className="p-4">{t('common.notFound')}</div>;

  const m = data.match;
  const events = data.events as Array<{
    id: string;
    type: EventType;
    player_id: string;
    team_id: string;
    link_id: string | null;
    clock_ms: number;
  }>;
  const sessionData = sessionQ.data;
  const teams = (sessionData?.teams ?? []) as SessionTeam[];
  const teamA = teams.find((t) => t.id === m.team_a_id);
  const teamB = teams.find((t) => t.id === m.team_b_id);
  const benchTeam = teams.find((t) => t.id === m.bench_team_id);

  const goalsA = events.filter((e) => e.type === 'goal' && e.team_id === m.team_a_id).length;
  const goalsB = events.filter((e) => e.type === 'goal' && e.team_id === m.team_b_id).length;

  const isOver = m.status === 'done';
  const isRunning = m.status === 'running';
  const isPaused = m.status === 'paused';
  const isPending = m.status === 'pending';

  function logEvent(type: EventType, playerId: string, teamId: string) {
    const id = uid();
    const linkId = type === 'goal' ? uid() : null;
    submitEvent.mutate(
      {
        id,
        match_id: matchId,
        type,
        player_id: playerId,
        team_id: teamId,
        link_id: linkId,
      },
      {
        onSuccess: () => {
          const player = playerById.get(playerId);
          if (type === 'goal') {
            setToast({
              text: t('match.assistHint', { name: player?.name ?? '?' }),
              eventId: id,
              linkId: linkId!,
              type,
              scorerTeamId: teamId,
              scorerId: playerId,
              expiresAt: Date.now() + 4500,
            });
          } else {
            const icon = EVENT_BUTTONS.find((b) => b.type === type)?.icon ?? '';
            setToast({
              text: `${player?.name ?? '?'} ${icon}`,
              eventId: id,
              linkId: id,
              type,
              scorerTeamId: teamId,
              scorerId: playerId,
              expiresAt: Date.now() + 3000,
            });
          }
          setArmedEvent(null);
        },
      }
    );
  }

  function handlePlayerTap(playerId: string, teamId: string) {
    if (toast?.type === 'goal' && toast.scorerTeamId === teamId && toast.scorerId !== playerId) {
      logAssist(playerId);
      return;
    }
    if (!armedEvent) return;
    logEvent(armedEvent, playerId, teamId);
  }

  function logAssist(playerId: string) {
    if (!toast || toast.type !== 'goal') return;
    submitEvent.mutate({
      id: uid(),
      match_id: matchId,
      type: 'assist',
      player_id: playerId,
      team_id: toast.scorerTeamId,
      link_id: toast.linkId,
    });
    setToast(null);
  }

  function undoToast() {
    if (!toast) return;
    removeEvent.mutate({ id: toast.eventId, link: toast.type === 'goal' });
    setToast(null);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-3 py-2 flex items-center justify-between gap-2 border-b border-border bg-bg2 sticky top-0 z-10">
        <button className="text-sm text-muted shrink-0" onClick={() => setLocation(`/sessions/${m.session_id}`)}>
          {t('common.session')}
        </button>
        <div className="text-2xl font-mono tabular-nums">
          {formatClock(liveClock)}
          <span className="text-xs text-muted ml-1">/ {formatClock(TARGET_MS)}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          {!isOver ? (
            <button
              className="btn px-3"
              onClick={() => setBenchOpen(true)}
              aria-label={t('sub.title')}
              title={t('sub.title')}
            >
              🔄
            </button>
          ) : null}
          {isPending && (
            <button className="btn-primary" onClick={() => start.mutate()}>
              {t('match.start')}
            </button>
          )}
          {isRunning && (
            <button className="btn" onClick={() => pause.mutate()}>
              {t('match.pause')}
            </button>
          )}
          {isPaused && (
            <button className="btn-primary" onClick={() => resume.mutate()}>
              {t('match.resume')}
            </button>
          )}
          {(isRunning || isPaused) && (
            <button className="btn-danger" onClick={() => end.mutate(undefined)}>
              {t('match.end')}
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 px-2 py-2 border-b border-border bg-bg">
        <ScoreSide team={teamA} goals={goalsA} />
        <ScoreSide team={teamB} goals={goalsB} align="right" />
      </div>

      <div className="grid grid-cols-2 gap-2 px-2 py-2">
        {[teamA, teamB].map((team) =>
          team ? (
            <TeamPanel
              key={team.id}
              team={team}
              players={players}
              armedEvent={armedEvent}
              assistPendingFor={
                toast?.type === 'goal' && toast.scorerTeamId === team.id
                  ? toast.scorerId
                  : null
              }
              onPlayerTap={(pid) => handlePlayerTap(pid, team.id)}
            />
          ) : null
        )}
      </div>

      <EventLog
        events={events}
        players={players}
        teamA={teamA}
        teamB={teamB}
      />

      {!isOver ? (
        <div className="border-t border-border bg-bg2 p-2 sticky bottom-0 z-10 safe-bottom">
          {armedEvent ? (
            <div className="text-[11px] text-accent mb-1">{t('match.armedHint')}</div>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            {EVENT_BUTTONS.map((b) => {
              const armed = armedEvent === b.type;
              return (
                <button
                  key={b.type}
                  className={`btn justify-center ${armed ? 'btn-primary ring-2 ring-accent' : ''}`}
                  onClick={() =>
                    setArmedEvent((prev) => (prev === b.type ? null : b.type))
                  }
                  disabled={!isRunning && !isPaused}
                >
                  <span className="text-lg">{b.icon}</span>
                  <span>{t(`event.${b.type}` as any)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed left-2 right-2 bottom-24 z-30 bg-bg3 border border-border rounded-xl p-3 flex items-center justify-between shadow-lg">
          <span className="text-sm">{toast.text}</span>
          <button className="btn-danger" onClick={undoToast}>
            {t('match.undo')}
          </button>
        </div>
      ) : null}

      {isOver ? (
        <PostMatchPanel
          matchId={matchId}
          teamA={teamA!}
          teamB={teamB!}
          benchTeam={benchTeam!}
          sessionId={m.session_id}
          currentResult={m.result}
          goalsA={goalsA}
          goalsB={goalsB}
        />
      ) : null}

      {benchOpen && teamA && teamB && benchTeam ? (
        <BenchSheet
          teamA={teamA}
          teamB={teamB}
          benchTeam={benchTeam}
          players={players}
          onClose={() => setBenchOpen(false)}
          onMove={(playerId, targetTeamId) =>
            assignToTeam.mutate({ teamId: targetTeamId, playerId })
          }
          pending={assignToTeam.isPending}
        />
      ) : null}
    </div>
  );
}

function ScoreSide({
  team,
  goals,
  align,
}: {
  team?: { id: string; vest: Vest };
  goals: number;
  align?: 'right';
}) {
  const t = useT();
  if (!team) return <div />;
  return (
    <div className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
      <span className={`px-2 py-1 rounded-md text-sm ${VEST_COLORS[team.vest]}`}>
        {t(`vest.${team.vest}`)}
      </span>
      <span className="text-3xl font-mono tabular-nums font-bold">{goals}</span>
    </div>
  );
}

function TeamPanel({
  team,
  players,
  armedEvent,
  onPlayerTap,
  assistPendingFor,
}: {
  team: SessionTeam;
  players: Player[];
  armedEvent: EventType | null;
  onPlayerTap: (id: string) => void;
  assistPendingFor: string | null;
}) {
  const t = useT();
  const byId = new Map(players.map((p) => [p.id, p]));
  const onPitchPlayers = team.player_ids
    .map((pid) => byId.get(pid))
    .filter(Boolean) as Player[];
  return (
    <div className={`space-y-1 p-2 rounded-xl border ${VEST_BORDER[team.vest]}`}>
      <div className={`text-xs px-2 py-1 rounded ${VEST_COLORS[team.vest]} inline-block`}>
        {t(`vest.${team.vest}`)}
      </div>
      <div className="flex flex-col gap-1">
        {onPitchPlayers.map((p) => {
          const isAssistTarget = assistPendingFor && p.id !== assistPendingFor;
          const isArmedTarget = !!armedEvent && !assistPendingFor;
          return (
            <button
              key={p.id}
              className={`text-left px-2 py-2 rounded-lg border transition flex items-center gap-2 ${
                isAssistTarget
                  ? 'border-amber-500 bg-amber-500/10'
                  : isArmedTarget
                  ? 'border-accent bg-accent/10'
                  : 'bg-bg2 border-border'
              }`}
              onClick={() => onPlayerTap(p.id)}
              style={{ minHeight: 44 }}
            >
              <Avatar playerId={p.id} name={p.name} size={32} />
              <span className={`font-medium truncate flex-1 ${VEST_TEXT[team.vest]}`}>
                {p.name}
                {p.role === 'gk' ? <span className="ml-1 text-xs">🧤</span> : null}
              </span>
            </button>
          );
        })}
        {onPitchPlayers.length === 0 ? (
          <div className="text-xs text-muted px-2 py-2">{t('team.noneAvailable')}</div>
        ) : null}
      </div>
    </div>
  );
}

function EventLog({
  events,
  players,
  teamA,
  teamB,
}: {
  events: Array<{ id: string; type: EventType; player_id: string; team_id: string; clock_ms: number }>;
  players: Player[];
  teamA?: { id: string; vest: Vest };
  teamB?: { id: string; vest: Vest };
}) {
  const t = useT();
  const visible = events.filter((e) => e.type !== 'sub_in' && e.type !== 'sub_out');
  const byPlayer = new Map(players.map((p) => [p.id, p]));
  const teamById = new Map(
    [teamA, teamB].filter(Boolean).map((tt) => [tt!.id, tt!] as const)
  );
  return (
    <div className="px-3 py-2 flex-1 overflow-y-auto">
      <div className="text-[10px] uppercase tracking-wide text-muted mb-1">
        {t('match.events')}
      </div>
      {visible.length === 0 ? (
        <div className="text-xs text-muted">{t('match.noEvents')}</div>
      ) : (
        <div className="flex flex-col gap-1">
          {visible
            .slice()
            .reverse()
            .map((e) => {
              const icon = EVENT_BUTTONS.find((b) => b.type === e.type)?.icon ?? '';
              const team = teamById.get(e.team_id);
              return (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs tabular-nums text-muted w-10">
                    {formatClock(e.clock_ms)}
                  </span>
                  <span className="text-base">{icon}</span>
                  <span className="font-medium flex-1">
                    {byPlayer.get(e.player_id)?.name ?? '?'}
                  </span>
                  {team ? (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${VEST_COLORS[team.vest]}`}
                    >
                      {t(`vest.${team.vest}`)}
                    </span>
                  ) : null}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function BenchSheet({
  teamA,
  teamB,
  benchTeam,
  players,
  onClose,
  onMove,
  pending,
}: {
  teamA: SessionTeam;
  teamB: SessionTeam;
  benchTeam: SessionTeam;
  players: Player[];
  onClose: () => void;
  onMove: (playerId: string, targetTeamId: string) => void;
  pending: boolean;
}) {
  const t = useT();
  const byId = new Map(players.map((p) => [p.id, p]));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function teamOf(playerId: string): SessionTeam | null {
    for (const team of [teamA, teamB, benchTeam]) {
      if (team.player_ids.includes(playerId)) return team;
    }
    return null;
  }

  function listFor(team: SessionTeam): Player[] {
    return team.player_ids.map((pid) => byId.get(pid)).filter(Boolean) as Player[];
  }

  const sections: Array<{ team: SessionTeam; label: string }> = [
    { team: teamA, label: t('sub.playingA', { vest: t(`vest.${teamA.vest}`) }) },
    { team: teamB, label: t('sub.playingB', { vest: t(`vest.${teamB.vest}`) }) },
    { team: benchTeam, label: t('sub.bench') },
  ];

  const selectedTeam = selectedId ? teamOf(selectedId) : null;
  const selectedPlayer = selectedId ? byId.get(selectedId) ?? null : null;

  function handleMove(targetId: string) {
    if (!selectedId) return;
    onMove(selectedId, targetId);
    setSelectedId(null);
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-end">
      <div className="bg-bg2 border-t border-border rounded-t-xl p-4 w-full max-h-[90vh] overflow-y-auto pb-32">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">{t('sub.title')}</h2>
          <button className="text-muted text-xl leading-none px-2" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="text-xs text-muted mb-3">{t('sub.hint')}</p>

        <div className="space-y-4">
          {sections.map(({ team, label }) => {
            const list = listFor(team);
            return (
              <div key={team.id}>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${VEST_COLORS[team.vest]}`}
                  >
                    {t(`vest.${team.vest}`)}
                  </span>
                  <span className="text-xs text-muted">{label}</span>
                  <span className="ml-auto text-xs text-muted">
                    {t('team.playersCount', { n: list.length })}
                  </span>
                </div>
                {list.length === 0 ? (
                  <div className="text-xs text-muted px-1 py-1">
                    {team === benchTeam ? t('sub.benchEmpty') : t('team.noneAvailable')}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1">
                    {list.map((p) => {
                      const isSelected = selectedId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            setSelectedId((prev) => (prev === p.id ? null : p.id))
                          }
                          className={`flex items-center gap-2 px-2 py-1 rounded-lg border text-left transition ${
                            isSelected
                              ? 'border-accent bg-accent/10 ring-2 ring-accent'
                              : `bg-bg3 ${VEST_BORDER[team.vest]}`
                          }`}
                          style={{ minHeight: 44 }}
                        >
                          <Avatar playerId={p.id} name={p.name} size={28} />
                          <span
                            className={`text-sm truncate flex-1 ${VEST_TEXT[team.vest]}`}
                          >
                            {p.name}
                            {p.role === 'gk' ? <span className="ml-1 text-xs">🧤</span> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="fixed left-0 right-0 bottom-0 z-50 bg-bg2 border-t border-border p-3 safe-bottom">
        {selectedPlayer ? (
          <div className="flex items-center gap-2 mb-2">
            <Avatar
              playerId={selectedPlayer.id}
              name={selectedPlayer.name}
              size={32}
            />
            <span className="text-sm font-medium truncate flex-1">
              {selectedPlayer.name}
            </span>
            {selectedTeam ? (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${VEST_COLORS[selectedTeam.vest]}`}
              >
                {t(`vest.${selectedTeam.vest}`)}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="text-xs text-muted mb-2">{t('sub.pickPlayer')}</div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {[teamA, teamB, benchTeam].map((team) => {
            const isCurrent = selectedTeam?.id === team.id;
            return (
              <button
                key={team.id}
                type="button"
                disabled={!selectedId || isCurrent || pending}
                onClick={() => handleMove(team.id)}
                className={`px-2 py-2 rounded-lg border text-sm font-semibold transition disabled:opacity-40 ${VEST_COLORS[team.vest]} ${
                  selectedId && !isCurrent ? '' : ''
                }`}
                style={{ minHeight: 44 }}
              >
                → {t(`vest.${team.vest}`)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PostMatchPanel({
  matchId,
  teamA,
  teamB,
  benchTeam,
  sessionId,
  currentResult,
  goalsA,
  goalsB,
}: {
  matchId: string;
  teamA: { id: string; vest: Vest };
  teamB: { id: string; vest: Vest };
  benchTeam: { id: string; vest: Vest };
  sessionId: string;
  currentResult: 'a' | 'b' | 'draw' | 'pending';
  goalsA: number;
  goalsB: number;
}) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const t = useT();
  const setResult = useMutation({
    mutationFn: (r: 'a' | 'b' | 'draw') => api.matches.setResult(matchId, { result: r }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['match', matchId] }),
  });
  const [stayPicked, setStayPicked] = useState<'a' | 'b' | 'draw' | null>(
    currentResult !== 'pending' ? currentResult : null
  );
  const [benchSwap, setBenchSwap] = useState<string | null>(null);

  const winnerTeam = stayPicked === 'a' ? teamA : stayPicked === 'b' ? teamB : null;
  const loserTeam = stayPicked === 'a' ? teamB : stayPicked === 'b' ? teamA : null;

  const createMatch = useMutation({
    mutationFn: api.matches.create,
    onSuccess: (m: any) => setLocation(`/matches/${m.id}`),
  });

  function next() {
    if (!winnerTeam) return;
    const dropOut = stayPicked === 'draw' ? benchSwap : loserTeam?.id;
    if (!dropOut) return;
    const incoming = benchTeam.id;
    const a = winnerTeam.id;
    const b = incoming;
    const newBench = dropOut;
    createMatch.mutate({
      session_id: sessionId,
      team_a_id: a,
      team_b_id: b,
      bench_team_id: newBench,
    });
  }

  return (
    <div className="border-t border-border bg-bg2 p-4 space-y-3">
      <h3 className="font-semibold">{t('match.over', { a: goalsA, b: goalsB })}</h3>
      <div className="grid grid-cols-3 gap-2">
        <button
          className={`btn ${stayPicked === 'a' ? 'btn-primary' : ''}`}
          onClick={() => {
            setStayPicked('a');
            setResult.mutate('a');
          }}
        >
          {t('match.vestStays', { vest: t(`vest.${teamA.vest}`) })}
        </button>
        <button
          className={`btn ${stayPicked === 'b' ? 'btn-primary' : ''}`}
          onClick={() => {
            setStayPicked('b');
            setResult.mutate('b');
          }}
        >
          {t('match.vestStays', { vest: t(`vest.${teamB.vest}`) })}
        </button>
        <button
          className={`btn ${stayPicked === 'draw' ? 'btn-primary' : ''}`}
          onClick={() => {
            setStayPicked('draw');
            setResult.mutate('draw');
          }}
        >
          {t('match.draw')}
        </button>
      </div>

      {stayPicked === 'draw' ? (
        <div>
          <div className="text-sm text-muted mb-1">{t('match.pickBench')}</div>
          <div className="flex gap-2">
            {[teamA, teamB].map((tm) => (
              <button
                key={tm.id}
                className={`btn flex-1 ${benchSwap === tm.id ? 'btn-primary' : ''}`}
                onClick={() => setBenchSwap(tm.id)}
              >
                {t('match.vestSits', { vest: t(`vest.${tm.vest}`) })}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <button
        className="btn-primary w-full"
        disabled={!stayPicked || (stayPicked === 'draw' && !benchSwap) || createMatch.isPending}
        onClick={next}
      >
        {t('match.startNext', { vest: t(`vest.${benchTeam.vest}`) })}
      </button>
      <button className="btn w-full" onClick={() => setLocation(`/sessions/${sessionId}`)}>
        {t('match.backToSession')}
      </button>
    </div>
  );
}

void computeClockMs;
