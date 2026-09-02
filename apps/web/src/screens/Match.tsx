import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useEffect, useMemo, useRef, useState } from 'react';
import { calcScore, todayISO, uid, type EventType, type Player, type Vest } from '@racha/shared';
import { api } from '../lib/api.js';
import { LanguageToggle, useT } from '../lib/i18n.js';
import { useCanEdit, useIsAdmin } from '../lib/auth.js';
import { AccessBar } from '../components/AccessBar.js';
import { useVests, contrastText, VestDot, pillStyle, panelStyle } from '../lib/vests.js';
import { Avatar } from '../lib/avatar.js';
import { formatClock, useClock, computeClockMs } from '../lib/clock.js';
import {
  isSoundEnabled,
  setSoundEnabled,
  playTimeUp,
  playEventSound,
} from '../lib/sounds.js';


const EVENT_BUTTONS: Array<{ type: EventType; icon: string }> = [
  { type: 'goal', icon: '⚽' },
  { type: 'assist', icon: '🅰' },
  { type: 'beautiful', icon: '✨' },
  { type: 'caneta', icon: '🪡' },
  { type: 'save', icon: '🧤' },
  { type: 'bad', icon: '💩' },
  { type: 'quasegol', icon: '😱' },
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

// Test hook: add ?clock=<seconds> to the match URL to shorten the countdown for
// this tab only (e.g. ?clock=10). Lets you rehearse the end-of-match alarm and
// flash without waiting the full 5–6 min. Not saved, not shared, ignored when
// out of range.
function testClockSeconds(): number {
  try {
    const v = Number(new URLSearchParams(window.location.search).get('clock'));
    return Number.isFinite(v) && v >= 3 && v <= 3600 ? v : 0;
  } catch {
    return 0;
  }
}

export function Match({ params }: { params: { id: string } }) {
  const matchId = params.id;
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const t = useT();
  const canEdit = useCanEdit();
  const isAdmin = useIsAdmin();
  const vests = useVests();
  const testClock = testClockSeconds();

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
  const removeMatch = useMutation({
    mutationFn: () => api.matches.remove(matchId),
    onSuccess: (_r, _v, _ctx) => {
      const sid = matchQ.data!.match.session_id;
      qc.invalidateQueries({ queryKey: ['session', sid] });
      setLocation(`/sessions/${sid}`);
    },
    onError: (e: any) => alert(String(e?.message ?? e)),
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
  const [soundOn, setSoundOn] = useState(isSoundEnabled);
  const [alarmDismissed, setAlarmDismissed] = useState(false);
  // Half-time rotation break (full house): when set, the clock is paused and a
  // 20s countdown runs before the second half starts.
  const [breakEndsAt, setBreakEndsAt] = useState<number | null>(null);
  const [breakRemaining, setBreakRemaining] = useState(0);
  const buzzedRef = useRef(false);
  const rotatedRef = useRef(false);

  const players: Player[] = playersQ.data ?? [];
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const liveClock = useClock(matchQ.data?.match);

  // Reset the one-shot alarm state when a different match loads (each match gets
  // its own rotation break + end alarm).
  useEffect(() => {
    buzzedRef.current = false;
    rotatedRef.current = false;
    setAlarmDismissed(false);
    setBreakEndsAt(null);
  }, [matchId]);

  useEffect(() => {
    if (!matchQ.data?.match) return;
    const m = matchQ.data.match;
    // The one-shot alarm flags reset per match (below), not on pause — so a
    // manual pause or the half-time break doesn't re-fire the alarms on resume.
    if (m.status !== 'running') return;
    const teams = (sessionQ.data?.teams ?? []) as SessionTeam[];
    const a = teams.find((t) => t.id === m.team_a_id);
    const b = teams.find((t) => t.id === m.team_b_id);
    const hasSix = (a?.player_ids.length ?? 0) > 5 || (b?.player_ids.length ?? 0) > 5;
    const tgt = testClock ? testClock * 1000 : (hasSix ? 6 : 5) * 60 * 1000;
    // At the half of a six-player match: sound the alarm, pause the clock, and
    // open a 20s rotation break before the second half.
    if (hasSix && !rotatedRef.current && liveClock >= tgt / 2 && liveClock < tgt) {
      rotatedRef.current = true;
      try {
        navigator.vibrate?.([500, 250, 500, 250, 900, 250, 900]);
      } catch {}
      playTimeUp();
      setBreakEndsAt(Date.now() + 20000);
      if (canEdit) pause.mutate();
    }
    if (!buzzedRef.current && liveClock >= tgt) {
      buzzedRef.current = true;
      try {
        // Long insistent pattern — a single 200ms buzz is easy to miss pitchside.
        navigator.vibrate?.([500, 250, 500, 250, 900, 250, 900]);
      } catch {}
      playTimeUp();
    }
  }, [liveClock, matchQ.data?.match?.status]);

  // Half-time break countdown: tick the remaining seconds and auto-start the
  // second half when it hits zero.
  useEffect(() => {
    if (breakEndsAt == null) return;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((breakEndsAt - Date.now()) / 1000));
      setBreakRemaining(rem);
      if (rem <= 0) {
        setBreakEndsAt(null);
        if (canEdit) resume.mutate();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakEndsAt]);

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
  // Once the game day is over, the clock and the "who stays / next match" setup
  // are locked (matches the server). Stat fixes stay open to admins via the
  // events editor.
  const frozen =
    !!sessionData &&
    (sessionData.session.status === 'done' || sessionData.session.date < todayISO());

  // Countdown to 0:00, then count how far into overtime we are. A match with a
  // team of six plays two 3-minute halves (6 min total), so the clock counts
  // each half down to zero with a rotation cue at the break; otherwise it's a
  // single 5-minute countdown.
  // The playing team(s) carrying a +1 (six players) — they're the ones that need
  // to rotate their sub at the break.
  const sixTeams = [teamA, teamB].filter(
    (tm): tm is SessionTeam => !!tm && tm.player_ids.length > 5
  );
  const matchHasSix = sixTeams.length > 0;
  const rotateColors = sixTeams.map((tm) => vests[tm.vest].color);
  const rotateBg =
    rotateColors.length === 1
      ? rotateColors[0]
      : rotateColors.length >= 2
        ? `linear-gradient(90deg, ${rotateColors[0]} 0 50%, ${rotateColors[1]} 50% 100%)`
        : '#f0b64d';
  const targetMs = testClock ? testClock * 1000 : (matchHasSix ? 6 : 5) * 60 * 1000;
  const fullHouse = matchHasSix;
  const halfMs = targetMs / 2;
  const inSecondHalf = fullHouse && liveClock >= halfMs && liveClock < targetMs;
  const segEnd = fullHouse && liveClock < halfMs ? halfMs : targetMs;
  const remainingMs = Math.max(0, segEnd - liveClock);
  const overtimeMs = Math.max(0, liveClock - targetMs);
  const isOvertime = overtimeMs > 0;
  const showTimeUp = isRunning && liveClock >= targetMs && !alarmDismissed;

  // Match navigation + "Match N" title within the session.
  const sessionMatches = ((sessionData?.matches ?? []) as any[])
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal);
  const matchIdx = sessionMatches.findIndex((x) => x.id === m.id);
  const prevMatch = matchIdx > 0 ? sessionMatches[matchIdx - 1] : null;
  const nextMatch =
    matchIdx >= 0 && matchIdx < sessionMatches.length - 1 ? sessionMatches[matchIdx + 1] : null;
  // The team that came on this match (last match's bench) is the "challenger":
  // on a tie it stays, per the rules. Undefined for the first match.
  const prevBenchId = matchIdx > 0 ? sessionMatches[matchIdx - 1]?.bench_team_id : undefined;
  const challengerTeamId =
    prevBenchId && (prevBenchId === m.team_a_id || prevBenchId === m.team_b_id)
      ? prevBenchId
      : undefined;

  function logEvent(type: EventType, playerId: string, teamId: string) {
    const id = uid();
    const linkId = type === 'goal' ? uid() : null;
    playEventSound(type);
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
    playEventSound('assist');
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
      {breakEndsAt != null && !showTimeUp ? (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 motion-safe:animate-pulse text-center p-6"
          style={{ background: rotateBg }}
        >
          <div className="text-6xl" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.45))' }}>
            🔄
          </div>
          <div
            className="text-4xl sm:text-5xl font-extrabold tracking-widest uppercase text-white"
            style={{ textShadow: '0 2px 10px rgba(0,0,0,.55)' }}
          >
            {t('match.rotateNow')}
          </div>
          {sixTeams.length ? (
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {sixTeams.map((tm) => (
                <span
                  key={tm.id}
                  className="px-4 py-1.5 rounded-lg font-bold text-xl ring-2 ring-white/50"
                  style={pillStyle(vests[tm.vest].color)}
                >
                  {vests[tm.vest].label}
                </span>
              ))}
            </div>
          ) : null}
          <div
            className="text-white text-2xl font-mono tabular-nums font-bold mt-1"
            style={{ textShadow: '0 2px 8px rgba(0,0,0,.55)' }}
          >
            {t('match.secondHalfIn', { n: breakRemaining })}
          </div>
          <button
            className="mt-2 px-6 py-3 rounded-xl bg-black/75 text-white font-bold text-lg"
            onClick={() => {
              setBreakEndsAt(null);
              if (canEdit) resume.mutate();
            }}
          >
            {t('match.startSecondHalf')}
          </button>
        </div>
      ) : null}
      {showTimeUp ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-red-600/90 motion-safe:animate-pulse text-white text-center p-6">
          <div className="text-6xl">⏱</div>
          <div className="text-4xl sm:text-5xl font-extrabold tracking-widest uppercase">
            {t('match.timesUp')}
          </div>
          <div className="text-2xl font-mono tabular-nums">+{formatClock(overtimeMs)}</div>
          <div className="flex gap-3 mt-3">
            {canEdit && !frozen ? (
              <button
                className="px-5 py-3 rounded-xl bg-white text-red-700 font-bold text-lg"
                onClick={() => {
                  setAlarmDismissed(true);
                  end.mutate(undefined);
                }}
              >
                {t('match.end')}
              </button>
            ) : null}
            <button
              className="px-5 py-3 rounded-xl border-2 border-white font-bold text-lg"
              onClick={() => setAlarmDismissed(true)}
            >
              {t('match.dismiss')}
            </button>
          </div>
        </div>
      ) : null}
      <AccessBar />
      <header className="px-2 py-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-border bg-bg2 sticky top-0 z-10">
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="text-lg text-muted px-2 leading-none"
            aria-label={t('common.session')}
            onClick={() => setLocation(`/sessions/${m.session_id}`)}
            style={{ minHeight: 36 }}
          >
            ←
          </button>
          <span className="hidden sm:block">
            <LanguageToggle />
          </span>
          <button
            type="button"
            className="text-lg leading-none px-2 py-1 rounded-md border border-border bg-bg3 hover:border-accent"
            aria-label={soundOn ? t('match.muteSound') : t('match.unmuteSound')}
            title={soundOn ? t('match.muteSound') : t('match.unmuteSound')}
            onClick={() => {
              const next = !soundOn;
              setSoundEnabled(next);
              setSoundOn(next);
            }}
            style={{ minHeight: 'auto' }}
          >
            {soundOn ? '🔊' : '🔇'}
          </button>
        </div>
        <div
          className={`text-xl sm:text-2xl font-mono tabular-nums font-semibold ${
            isOvertime ? 'text-red-500' : remainingMs <= 30_000 && isRunning ? 'text-amber-400' : ''
          }`}
        >
          {isOvertime ? (
            <span>
              +{formatClock(overtimeMs)}
              <span className="hidden sm:inline text-xs ml-1">{t('match.overtime')}</span>
            </span>
          ) : (
            formatClock(remainingMs)
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {canEdit && !frozen && isPending && (
            <button className="btn-primary px-3" onClick={() => start.mutate()}>
              {t('match.start')}
            </button>
          )}
          {canEdit && !frozen && isRunning && (
            <button className="btn px-3" onClick={() => pause.mutate()}>
              {t('match.pause')}
            </button>
          )}
          {canEdit && !frozen && isPaused && (
            <button className="btn-primary px-3" onClick={() => resume.mutate()}>
              {t('match.resume')}
            </button>
          )}
          {canEdit && (isRunning || isPaused) && (
            <button className="btn-danger px-3" onClick={() => end.mutate(undefined)}>
              {t('match.end')}
            </button>
          )}
        </div>
      </header>

      {/* Match number + navigation between the session's matches. */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border bg-bg2/60">
        <button
          className="text-sm px-2 py-1 rounded-md text-muted enabled:hover:text-fg disabled:opacity-30"
          disabled={!prevMatch}
          onClick={() => prevMatch && setLocation(`/matches/${prevMatch.id}`)}
          aria-label={t('match.prev')}
        >
          ◀
        </button>
        <div className="font-semibold text-sm tracking-wide">
          {t('session.matchN', { n: m.ordinal })}
          {sessionMatches.length ? (
            <span className="text-muted font-normal"> · {matchIdx + 1}/{sessionMatches.length}</span>
          ) : null}
          {fullHouse ? (
            <span className="ml-2 text-[10px] font-bold uppercase text-accent border border-accent/50 rounded px-1.5 py-0.5">
              {t('match.half', { n: inSecondHalf ? 2 : 1 })}
            </span>
          ) : null}
          {testClock ? (
            <span className="ml-2 text-[10px] font-bold uppercase text-amber-500 border border-amber-500/50 rounded px-1.5 py-0.5">
              test {testClock}s
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {isAdmin && !frozen ? (
            <button
              className="text-sm px-2 py-1 rounded-md text-muted hover:text-red-400"
              title={t('match.deleteMatch')}
              aria-label={t('match.deleteMatch')}
              disabled={removeMatch.isPending}
              onClick={() => {
                if (window.confirm(t('match.confirmDelete', { n: m.ordinal, e: events.length })))
                  removeMatch.mutate();
              }}
            >
              🗑
            </button>
          ) : null}
          <button
            className="text-sm px-2 py-1 rounded-md text-muted enabled:hover:text-fg disabled:opacity-30"
            disabled={!nextMatch}
            onClick={() => nextMatch && setLocation(`/matches/${nextMatch.id}`)}
            aria-label={t('match.next')}
          >
            ▶
          </button>
        </div>
      </div>

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

      {!isOver && canEdit && !frozen ? (
        <div className="px-2 pb-2">
          <button
            className="btn w-full justify-center font-semibold"
            onClick={() => setBenchOpen(true)}
          >
            🔄 {t('sub.title')}
          </button>
        </div>
      ) : null}

      <EventLog
        events={events}
        players={players}
        teamA={teamA}
        teamB={teamB}
        onEdit={isAdmin ? () => setLocation(`/matches/${matchId}/events`) : undefined}
      />

      {!isOver && canEdit && !frozen ? (
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

      {isOver && canEdit && !frozen && !nextMatch ? (
        <PostMatchPanel
          matchId={matchId}
          teamA={teamA!}
          teamB={teamB!}
          benchTeam={benchTeam!}
          players={players}
          sessionId={m.session_id}
          currentResult={m.result}
          goalsA={goalsA}
          goalsB={goalsB}
          challengerTeamId={challengerTeamId}
        />
      ) : isOver && nextMatch ? (
        // This match already led to the next one — don't offer "start next"
        // again (that would pile up duplicate matches). Point to it instead.
        <div className="border-t border-border bg-bg2 p-4 text-center space-y-2">
          <div className="text-sm text-muted">{t('match.nextStarted')}</div>
          <button
            className="btn-primary w-full"
            onClick={() => setLocation(`/matches/${nextMatch.id}`)}
          >
            {t('session.matchN', { n: nextMatch.ordinal })} →
          </button>
        </div>
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
  const vests = useVests();
  if (!team) return <div />;
  const v = vests[team.vest];
  return (
    <div className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
      <span className="px-2 py-1 rounded-md text-sm font-semibold" style={pillStyle(v.color)}>
        {v.label}
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
  const vests = useVests();
  const v = vests[team.vest];
  const byId = new Map(players.map((p) => [p.id, p]));
  const onPitchPlayers = team.player_ids
    .map((pid) => byId.get(pid))
    .filter(Boolean) as Player[];
  const power = onPitchPlayers.reduce((s, p) => s + calcScore(p.skills), 0);
  return (
    <div className="space-y-1 p-2 rounded-xl border" style={panelStyle(v.color)}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs px-2 py-1 rounded font-semibold inline-block" style={pillStyle(v.color)}>
          {v.label}
        </span>
        <span className="text-xs font-semibold tabular-nums text-muted">⚡{power}</span>
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
              <span className="font-medium truncate flex-1 text-fg">
                {p.name}              </span>
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
  onEdit,
}: {
  events: Array<{ id: string; type: EventType; player_id: string; team_id: string; clock_ms: number }>;
  players: Player[];
  teamA?: { id: string; vest: Vest };
  teamB?: { id: string; vest: Vest };
  onEdit?: () => void;
}) {
  const t = useT();
  const vests = useVests();
  const visible = events.filter((e) => e.type !== 'sub_in' && e.type !== 'sub_out');
  const byPlayer = new Map(players.map((p) => [p.id, p]));
  const teamById = new Map(
    [teamA, teamB].filter(Boolean).map((tt) => [tt!.id, tt!] as const)
  );
  return (
    <div className="px-3 py-2 max-h-[35vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide text-muted">
          {t('match.events')}
        </span>
        {onEdit ? (
          <button
            type="button"
            className="text-xs text-muted hover:text-accent px-1"
            aria-label={t('admin.editEvents')}
            title={t('admin.editEvents')}
            onClick={onEdit}
            style={{ minHeight: 'auto' }}
          >
            ✏️ {t('admin.editEvents')}
          </button>
        ) : null}
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
                      className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                      style={pillStyle(vests[team.vest].color)}
                    >
                      {vests[team.vest].label}
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
  const vests = useVests();
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

  const selectedTeam = selectedId ? teamOf(selectedId) : null;
  const selectedPlayer = selectedId ? byId.get(selectedId) ?? null : null;

  function handleMove(targetId: string) {
    if (!selectedId) return;
    onMove(selectedId, targetId);
    setSelectedId(null);
  }

  function renderPlayerChip(p: Player, team: SessionTeam) {
    const isSelected = selectedId === p.id;
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => setSelectedId((prev) => (prev === p.id ? null : p.id))}
        className={`flex items-center gap-2 px-2 py-1 rounded-lg border text-left transition ${
          isSelected ? 'border-accent bg-accent/10 ring-2 ring-accent' : 'bg-bg3 border-border'
        }`}
        style={{ minHeight: 44 }}
      >
        <VestDot color={vests[team.vest].color} size={10} />
        <Avatar playerId={p.id} name={p.name} size={28} />
        <span className="text-sm truncate flex-1 text-fg">
          {p.name}
        </span>
      </button>
    );
  }

  function renderHeader(team: SessionTeam, label: string, list: Player[]) {
    const power = list.reduce((s, p) => s + calcScore(p.skills), 0);
    return (
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs px-2 py-0.5 rounded font-semibold" style={pillStyle(vests[team.vest].color)}>
          {vests[team.vest].label}
        </span>
        <span className="text-xs text-muted truncate">{label}</span>
        <span className="ml-auto text-xs text-muted tabular-nums">
          ⚡{power} · {t('team.playersCount', { n: list.length })}
        </span>
      </div>
    );
  }

  const playingTeams: Array<{ team: SessionTeam; label: string }> = [
    { team: teamA, label: t('sub.playingA', { vest: vests[teamA.vest].label }) },
    { team: teamB, label: t('sub.playingB', { vest: vests[teamB.vest].label }) },
  ];
  const benchList = listFor(benchTeam);

  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-end">
      <div className="bg-bg2 border-t border-border rounded-t-xl p-4 w-full max-h-[90vh] overflow-y-auto pb-32">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-lg font-semibold">{t('sub.title')}</h2>
          <button className="btn-danger" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        <p className="text-xs text-muted mb-3">{t('sub.hint')}</p>

        <div className="space-y-4">
          {/* Two playing teams side-by-side, players stacked vertically per column */}
          <div className="grid grid-cols-2 gap-2">
            {playingTeams.map(({ team, label }) => {
              const list = listFor(team);
              return (
                <div key={team.id} className="rounded-xl border p-2" style={panelStyle(vests[team.vest].color)}>
                  {renderHeader(team, label, list)}
                  {list.length === 0 ? (
                    <div className="text-xs text-muted px-1 py-1">
                      {t('team.noneAvailable')}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {list.map((p) => renderPlayerChip(p, team))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bench team full-width, players in a horizontal grid */}
          <div className="rounded-xl border p-2" style={panelStyle(vests[benchTeam.vest].color)}>
            {renderHeader(benchTeam, t('sub.bench'), benchList)}
            {benchList.length === 0 ? (
              <div className="text-xs text-muted px-1 py-1">{t('sub.benchEmpty')}</div>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                {benchList.map((p) => renderPlayerChip(p, benchTeam))}
              </div>
            )}
          </div>
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
                className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                style={pillStyle(vests[selectedTeam.vest].color)}
              >
                {vests[selectedTeam.vest].label}
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
                className="px-2 py-2 rounded-lg border border-transparent text-sm font-semibold transition disabled:opacity-40 flex items-center justify-center gap-1"
                style={{ minHeight: 44, ...pillStyle(vests[team.vest].color) }}
              >
                → {vests[team.vest].label}
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
  players,
  sessionId,
  currentResult,
  goalsA,
  goalsB,
  challengerTeamId,
}: {
  matchId: string;
  teamA: SessionTeam;
  teamB: SessionTeam;
  benchTeam: SessionTeam;
  players: Player[];
  sessionId: string;
  currentResult: 'a' | 'b' | 'draw' | 'pending';
  goalsA: number;
  goalsB: number;
  challengerTeamId?: string;
}) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const t = useT();
  const vests = useVests();
  const setResult = useMutation({
    mutationFn: (r: 'a' | 'b' | 'draw') => api.matches.setResult(matchId, { result: r }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['match', matchId] }),
  });
  const createMatch = useMutation({
    mutationFn: api.matches.create,
    onSuccess: (m: any) => setLocation(`/matches/${m.id}`),
  });

  // The result comes from the score (or a result already recorded); the rules
  // then decide who stays automatically — no side-picking. The only manual case
  // is a first-game tie (no challenger yet), settled by odds-or-evens.
  const decided: 'a' | 'b' | 'draw' =
    currentResult !== 'pending'
      ? currentResult
      : goalsA > goalsB
        ? 'a'
        : goalsB > goalsA
          ? 'b'
          : 'draw';
  const ambiguous = decided === 'draw' && !challengerTeamId;
  const [firstTieStayId, setFirstTieStayId] = useState<string | null>(null);

  let stayTeam: SessionTeam | null = null;
  let outTeam: SessionTeam | null = null;
  if (decided === 'a') {
    stayTeam = teamA;
    outTeam = teamB;
  } else if (decided === 'b') {
    stayTeam = teamB;
    outTeam = teamA;
  } else if (challengerTeamId) {
    // Tie: the challenger (came on this match) stays; the other team benches.
    stayTeam = challengerTeamId === teamA.id ? teamA : teamB;
    outTeam = challengerTeamId === teamA.id ? teamB : teamA;
  } else if (firstTieStayId) {
    stayTeam = firstTieStayId === teamA.id ? teamA : teamB;
    outTeam = firstTieStayId === teamA.id ? teamB : teamA;
  }

  const needed = Math.max(0, 5 - benchTeam.player_ids.length);
  const canFill = needed > 0 && !!outTeam && outTeam.player_ids.length > 0;
  const [fillIds, setFillIds] = useState<Set<string>>(new Set());
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  useEffect(() => setFillIds(new Set()), [stayTeam?.id]);

  const pill = (vest: Vest) => (
    <span
      className="px-2 py-0.5 rounded font-semibold text-xs"
      style={pillStyle(vests[vest].color)}
    >
      {vests[vest].label}
    </span>
  );

  function next() {
    if (!stayTeam || !outTeam) return;
    // Persist the score-derived result if none was recorded, so standings reflect it.
    if (currentResult === 'pending') setResult.mutate(decided);
    // The winner keeps its side; the server just tops up the incoming team from
    // the losers by whatever it still needs. Nothing is returned.
    createMatch.mutate({
      session_id: sessionId,
      team_a_id: stayTeam.id,
      team_b_id: benchTeam.id,
      bench_team_id: outTeam.id,
      borrow: fillIds.size ? { player_ids: [...fillIds] } : undefined,
    });
  }

  return (
    <div className="border-t border-border bg-bg2 p-4 space-y-3">
      <h3 className="font-semibold text-center">{t('match.over', { a: goalsA, b: goalsB })}</h3>

      {ambiguous && !firstTieStayId ? (
        // First game only: a tie with no prior challenger — settle by odds/evens.
        <div className="space-y-2">
          <div className="text-sm text-muted text-center">{t('match.firstTie')}</div>
          <div className="grid grid-cols-2 gap-2">
            {[teamA, teamB].map((tm) => (
              <VestBox
                key={tm.id}
                color={vests[tm.vest].color}
                name={vests[tm.vest].label}
                action={t('match.stays')}
                selected={false}
                onClick={() => setFirstTieStayId(tm.id)}
              />
            ))}
          </div>
        </div>
      ) : stayTeam && outTeam ? (
        <>
          {/* The rule already decided the rotation. */}
          <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm py-1">
            {pill(stayTeam.vest)}
            <span className="text-muted">{t('match.staysL')}</span>
            <span className="text-muted">·</span>
            {pill(benchTeam.vest)}
            <span className="text-muted">{t('match.comesOnL')}</span>
            <span className="text-muted">·</span>
            {pill(outTeam.vest)}
            <span className="text-muted">{t('match.benchesL')}</span>
          </div>

          {canFill && outTeam ? (
            <div>
              <div className="text-sm text-muted mb-1">
                {t('match.needFill', {
                  inVest: vests[benchTeam.vest].label,
                  n: needed,
                  outVest: vests[outTeam.vest].label,
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {outTeam.player_ids
                  .map((pid) => byId.get(pid))
                  .filter((p): p is Player => !!p)
                  .map((p) => {
                    const sel = fillIds.has(p.id);
                    const atCap = !sel && fillIds.size >= needed;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={atCap}
                        onClick={() =>
                          setFillIds((s) => {
                            const n = new Set(s);
                            if (n.has(p.id)) n.delete(p.id);
                            else n.add(p.id);
                            return n;
                          })
                        }
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-sm transition ${
                          sel ? 'border-accent bg-accent/10 ring-2 ring-accent' : 'bg-bg3 border-border'
                        } ${atCap ? 'opacity-40 pointer-events-none' : ''}`}
                      >
                        <Avatar playerId={p.id} name={p.name} size={22} />
                        <span className="truncate max-w-[7rem]">{p.name}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ) : null}

          <button
            className="w-full rounded-2xl py-5 text-xl font-extrabold bg-accent text-white flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none shadow-lg"
            disabled={createMatch.isPending}
            onClick={next}
          >
            ▶ {t('match.startNextGame')}
          </button>
        </>
      ) : null}

      <button className="btn w-full" onClick={() => setLocation(`/sessions/${sessionId}`)}>
        {t('match.backToSession')}
      </button>
    </div>
  );
}

void computeClockMs;

// A big fillable colour box for picking a team by its (configurable) vest
// colour. Shows the colour name and the action (Stays / Sits) together.
function VestBox({
  color,
  name,
  action,
  selected,
  onClick,
}: {
  color: string;
  name: string;
  action: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl py-3 px-2 ring-1 ring-white/20 border-2 flex flex-col items-center justify-center gap-0.5 leading-tight ${
        selected ? 'border-accent' : 'border-transparent'
      }`}
      style={{ backgroundColor: color, color: contrastText(color) }}
    >
      <span className="font-bold">
        {selected ? '✓ ' : ''}
        {name}
      </span>
      <span className="text-xs opacity-80">{action}</span>
    </button>
  );
}

