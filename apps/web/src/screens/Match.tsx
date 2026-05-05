import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useEffect, useMemo, useRef, useState } from 'react';
import { uid, type EventType, type Player, type Vest } from '@racha/shared';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { formatClock, useClock, computeClockMs } from '../lib/clock.js';

const VEST_COLORS: Record<Vest, string> = {
  white: 'bg-gray-100 text-black',
  black: 'bg-gray-900 text-white',
  green: 'bg-green-700 text-white',
};

const TARGET_MS = 5 * 60 * 1000;

const EVENT_BUTTONS: Array<{ type: EventType; icon: string; gkOnly?: boolean }> = [
  { type: 'goal', icon: '⚽' },
  { type: 'assist', icon: '🅰' },
  { type: 'beautiful', icon: '✨' },
  { type: 'silly', icon: '😬' },
  { type: 'bad', icon: '💀' },
  { type: 'save', icon: '🧤', gkOnly: true },
];

interface Toast {
  text: string;
  eventId: string;
  linkId: string;
  type: EventType;
  scorerTeamId: string;
  scorerName: string;
  expiresAt: number;
}

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
  const submitSub = useMutation({
    mutationFn: api.events.sub,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['match', matchId] }),
  });
  const removeEvent = useMutation({
    mutationFn: ({ id, link }: { id: string; link: boolean }) => api.events.remove(id, link),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['match', matchId] }),
  });

  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; teamId: string } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [subSheet, setSubSheet] = useState<{ teamId: string } | null>(null);
  const buzzedRef = useRef(false);

  const players: Player[] = playersQ.data ?? [];
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const liveClock = useClock(matchQ.data?.match);

  // Soft-buzz at 5:00
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

  // Auto-dismiss toast
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
  const lineup = data.lineup as Array<{ player_id: string; team_id: string }>;
  const events = data.events as Array<{
    id: string;
    type: EventType;
    player_id: string;
    team_id: string;
    link_id: string | null;
    clock_ms: number;
  }>;
  const sessionData = sessionQ.data;
  const teams = (sessionData?.teams ?? []) as Array<{ id: string; vest: Vest; player_ids: string[] }>;
  const teamA = teams.find((t) => t.id === m.team_a_id);
  const teamB = teams.find((t) => t.id === m.team_b_id);
  const benchTeam = teams.find((t) => t.id === m.bench_team_id);

  // Who is currently on the pitch per team — start with match_players, apply sub events.
  const onPitchByTeam = computeOnPitch(lineup, events);

  const goalsA = events.filter((e) => e.type === 'goal' && e.team_id === m.team_a_id).length;
  const goalsB = events.filter((e) => e.type === 'goal' && e.team_id === m.team_b_id).length;

  const isOver = m.status === 'done';
  const isRunning = m.status === 'running';
  const isPaused = m.status === 'paused';
  const isPending = m.status === 'pending';

  function logEvent(type: EventType) {
    if (!selectedPlayer) return;
    const id = uid();
    const linkId = type === 'goal' ? uid() : null;
    submitEvent.mutate(
      {
        id,
        match_id: matchId,
        type,
        player_id: selectedPlayer.id,
        team_id: selectedPlayer.teamId,
        link_id: linkId,
      },
      {
        onSuccess: () => {
          if (type === 'goal') {
            const player = playerById.get(selectedPlayer.id);
            setToast({
              text: t('match.assistHint', { name: player?.name ?? '?' }),
              eventId: id,
              linkId: linkId!,
              type,
              scorerTeamId: selectedPlayer.teamId,
              scorerName: player?.name ?? '',
              expiresAt: Date.now() + 4500,
            });
          } else {
            const player = playerById.get(selectedPlayer.id);
            const icon = EVENT_BUTTONS.find((b) => b.type === type)?.icon ?? '';
            setToast({
              text: `${player?.name ?? '?'} ${icon}`,
              eventId: id,
              linkId: id,
              type,
              scorerTeamId: selectedPlayer.teamId,
              scorerName: player?.name ?? '',
              expiresAt: Date.now() + 3000,
            });
          }
          setSelectedPlayer(null);
        },
      }
    );
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

  function nudgeClock(deltaMs: number) {
    if (!toast) return;
    // Resubmit by deleting + reinserting with offset would be heavier; simpler:
    // hit the API to update clock_ms via a delete-then-insert. v1: just inform the
    // user the offset would need DB tweak. Instead, we expose this in code path
    // by recreating: delete original, log a fresh event with offset.
    // (kept simple: not implemented in v1 UI to avoid edge cases.)
    void deltaMs;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 py-2 flex items-center justify-between border-b border-border bg-bg2 sticky top-0 z-10">
        <button className="text-sm text-muted" onClick={() => setLocation(`/sessions/${m.session_id}`)}>
          {t('common.session')}
        </button>
        <div className="text-2xl font-mono tabular-nums">
          {formatClock(liveClock)}
          <span className="text-xs text-muted ml-1">/ {formatClock(TARGET_MS)}</span>
        </div>
        <div className="flex gap-2">
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

      {/* Score */}
      <div className="grid grid-cols-2 px-2 py-2 border-b border-border bg-bg">
        <ScoreSide team={teamA} goals={goalsA} />
        <ScoreSide team={teamB} goals={goalsB} align="right" />
      </div>

      {/* Players grid */}
      <div className="grid grid-cols-2 gap-2 px-2 py-2 flex-1">
        {[teamA, teamB].map((team) =>
          team ? (
            <TeamPanel
              key={team.id}
              team={team}
              onPitch={onPitchByTeam.get(team.id) ?? new Set()}
              players={players}
              selected={selectedPlayer}
              onSelect={(pid) => setSelectedPlayer({ id: pid, teamId: team.id })}
              onSubClick={() => setSubSheet({ teamId: team.id })}
              isSubAssistTarget={
                toast?.type === 'goal' && toast.scorerTeamId === team.id ? toast : null
              }
              onAssistClick={(pid) => logAssist(pid)}
            />
          ) : null
        )}
      </div>

      {/* Selected player + event bar */}
      {selectedPlayer ? (
        <div className="border-t border-border bg-bg2 p-3 sticky bottom-0 z-10 safe-bottom">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">
              {t('match.selected', { name: playerById.get(selectedPlayer.id)?.name ?? '?' })}
            </span>
            <button className="text-muted" onClick={() => setSelectedPlayer(null)}>
              ×
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {EVENT_BUTTONS.filter(
              (b) => !b.gkOnly || playerById.get(selectedPlayer.id)?.role === 'gk'
            ).map((b) => (
              <button
                key={b.type}
                className="btn justify-center"
                onClick={() => logEvent(b.type)}
                disabled={!isRunning && !isPaused}
              >
                <span className="text-lg">{b.icon}</span>
                <span>{t(`event.${b.type}` as any)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Toast */}
      {toast ? (
        <div className="fixed left-2 right-2 bottom-24 z-30 bg-bg3 border border-border rounded-xl p-3 flex items-center justify-between shadow-lg">
          <span className="text-sm">{toast.text}</span>
          <button className="btn-danger" onClick={undoToast}>
            {t('match.undo')}
          </button>
        </div>
      ) : null}

      {/* Match end actions */}
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

      {/* Sub sheet */}
      {subSheet ? (
        <SubSheet
          team={teams.find((t) => t.id === subSheet.teamId)!}
          benchTeam={benchTeam ?? null}
          onPitchByTeam={onPitchByTeam}
          players={players}
          onClose={() => setSubSheet(null)}
          onConfirm={(out_id, in_id) =>
            submitSub.mutate(
              { match_id: matchId, team_id: subSheet.teamId, out_player_id: out_id, in_player_id: in_id },
              { onSuccess: () => setSubSheet(null) }
            )
          }
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
  onPitch,
  players,
  selected,
  onSelect,
  onSubClick,
  isSubAssistTarget,
  onAssistClick,
}: {
  team: { id: string; vest: Vest; player_ids: string[] };
  onPitch: Set<string>;
  players: Player[];
  selected: { id: string; teamId: string } | null;
  onSelect: (id: string) => void;
  onSubClick: () => void;
  isSubAssistTarget: Toast | null;
  onAssistClick: (id: string) => void;
}) {
  const t = useT();
  const onPitchPlayers = team.player_ids
    .map((pid) => players.find((p) => p.id === pid))
    .filter(Boolean) as Player[];
  const liveOnPitch = onPitchPlayers.filter((p) => onPitch.has(p.id));
  return (
    <div className="space-y-1">
      <div className={`text-xs px-2 py-1 rounded ${VEST_COLORS[team.vest]} inline-block`}>
        {t(`vest.${team.vest}`)}
      </div>
      <div className="flex flex-col gap-1">
        {liveOnPitch.map((p) => {
          const isSel = selected?.id === p.id;
          const isAssistTarget =
            isSubAssistTarget && p.id !== getNameFromId(isSubAssistTarget.scorerName, players);
          return (
            <button
              key={p.id}
              className={`text-left px-3 py-2 rounded-lg border transition ${
                isSel
                  ? 'bg-accent text-black border-accent'
                  : isAssistTarget
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'bg-bg2 border-border'
              }`}
              onClick={() => {
                if (isSubAssistTarget) {
                  onAssistClick(p.id);
                } else {
                  onSelect(p.id);
                }
              }}
              style={{ minHeight: 40 }}
            >
              <span className="font-medium">{p.name}</span>
              {p.role === 'gk' ? <span className="ml-1 text-xs">🧤</span> : null}
            </button>
          );
        })}
      </div>
      <button className="btn w-full mt-1" onClick={onSubClick}>
        {t('match.sub')}
      </button>
    </div>
  );
}

function getNameFromId(name: string, players: Player[]): string {
  // helper: maps name back to player.id (since we passed scorerName around)
  const found = players.find((p) => p.name === name);
  return found?.id ?? '';
}

function SubSheet({
  team,
  benchTeam,
  onPitchByTeam,
  players,
  onClose,
  onConfirm,
}: {
  team: { id: string; vest: Vest; player_ids: string[] };
  benchTeam: { id: string; vest: Vest; player_ids: string[] } | null;
  onPitchByTeam: Map<string, Set<string>>;
  players: Player[];
  onClose: () => void;
  onConfirm: (out_id: string, in_id: string) => void;
}) {
  const t = useT();
  const onPitchHere = onPitchByTeam.get(team.id) ?? new Set<string>();
  // Anyone currently on pitch in any team is unavailable to sub in.
  const allOnPitch = new Set<string>();
  for (const set of onPitchByTeam.values()) for (const pid of set) allOnPitch.add(pid);

  const playerById = new Map(players.map((p) => [p.id, p]));
  const ownTeamPlayers = team.player_ids
    .map((pid) => playerById.get(pid))
    .filter(Boolean) as Player[];

  const onPitchList = ownTeamPlayers.filter((p) => onPitchHere.has(p.id));
  const ownBench = ownTeamPlayers.filter((p) => !allOnPitch.has(p.id));
  const fromBenchTeam = (benchTeam?.player_ids ?? [])
    .map((pid) => playerById.get(pid))
    .filter(Boolean)
    .filter((p) => !allOnPitch.has((p as Player).id)) as Player[];

  const [outId, setOutId] = useState<string | null>(null);
  const [inId, setInId] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-end">
      <div className="bg-bg2 border-t border-border rounded-t-xl p-4 w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">
            {t('sub.title', { vest: t(`vest.${team.vest}`) })}
          </h2>
          <button className="text-muted" onClick={onClose}>×</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted mb-1">{t('sub.off')}</div>
            <div className="flex flex-col gap-1">
              {onPitchList.map((p) => (
                <button
                  key={p.id}
                  className={`px-2 py-2 rounded-lg border text-sm ${
                    outId === p.id ? 'bg-red-500/20 border-red-500' : 'bg-bg3 border-border'
                  }`}
                  onClick={() => setOutId(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted mb-1">{t('sub.on')}</div>
            <div className="flex flex-col gap-2">
              {ownBench.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted">
                    {t('sub.ownBench', { vest: t(`vest.${team.vest}`) })}
                  </div>
                  {ownBench.map((p) => (
                    <button
                      key={p.id}
                      className={`px-2 py-2 rounded-lg border text-sm ${
                        inId === p.id ? 'bg-accent/20 border-accent' : 'bg-bg3 border-border'
                      }`}
                      onClick={() => setInId(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              ) : null}
              {benchTeam && fromBenchTeam.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted">
                    {t('sub.benchTeam', { vest: t(`vest.${benchTeam.vest}`) })}
                  </div>
                  {fromBenchTeam.map((p) => (
                    <button
                      key={p.id}
                      className={`px-2 py-2 rounded-lg border text-sm ${
                        inId === p.id ? 'bg-accent/20 border-accent' : 'bg-bg3 border-border'
                      }`}
                      onClick={() => setInId(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              ) : null}
              {ownBench.length === 0 && fromBenchTeam.length === 0 ? (
                <div className="text-xs text-muted">{t('team.noneAvailable')}</div>
              ) : null}
            </div>
          </div>
        </div>
        <button
          className="btn-primary w-full mt-3"
          disabled={!outId || !inId}
          onClick={() => onConfirm(outId!, inId!)}
        >
          {t('sub.confirm')}
        </button>
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
  const [benchSwap, setBenchSwap] = useState<string | null>(null); // team id that drops out

  const winnerTeam = stayPicked === 'a' ? teamA : stayPicked === 'b' ? teamB : null;
  const loserTeam = stayPicked === 'a' ? teamB : stayPicked === 'b' ? teamA : null;

  const createMatch = useMutation({
    mutationFn: api.matches.create,
    onSuccess: (m: any) => setLocation(`/matches/${m.id}`),
  });

  function next() {
    if (!winnerTeam) return;
    // If draw → user picks who benches manually below
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

// Walk the event log to derive who's on the pitch right now per team.
// Starting lineup = match_players, then sub_in / sub_out swap who is on.
function computeOnPitch(
  lineup: Array<{ player_id: string; team_id: string }>,
  events: Array<{ type: EventType; player_id: string; team_id: string; clock_ms: number }>
): Map<string, Set<string>> {
  const byTeam = new Map<string, Set<string>>();
  for (const m of lineup) {
    if (!byTeam.has(m.team_id)) byTeam.set(m.team_id, new Set());
    byTeam.get(m.team_id)!.add(m.player_id);
  }
  // Apply subs in chronological order
  const subs = events
    .filter((e) => e.type === 'sub_in' || e.type === 'sub_out')
    .sort((a, b) => a.clock_ms - b.clock_ms);
  for (const e of subs) {
    if (!byTeam.has(e.team_id)) byTeam.set(e.team_id, new Set());
    const set = byTeam.get(e.team_id)!;
    if (e.type === 'sub_out') set.delete(e.player_id);
    else set.add(e.player_id);
  }
  return byTeam;
}

// Suppress unused import warning
void computeClockMs;
