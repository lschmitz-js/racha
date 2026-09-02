import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useI18n, useT } from '../lib/i18n.js';
import { useCanEdit, useIsAdmin } from '../lib/auth.js';
import { AccessBar } from '../components/AccessBar.js';
import { Avatar } from '../lib/avatar.js';
import { Leaderboard } from '../components/Leaderboard.js';
import { BestShowcase } from '../components/BestShowcase.js';
import { bestOfEachCategory, calcPoints, type StatRow } from '../lib/points.js';
import { calcScore, todayISO, type Player, type Vest } from '@racha/shared';
import { useVests, pillStyle, panelStyle, VestDot } from '../lib/vests.js';

function fmtSessionDate(date: string, locale: string): string {
  const d = new Date(date);
  return isNaN(d.getTime())
    ? date
    : d.toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' });
}

function StatusPill({ status }: { status: string }) {
  const t = useT();
  const done = status === 'done';
  const live = status === 'live';
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-full border ${
        done
          ? 'text-accent border-accent/40 bg-accent/10'
          : live
          ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
          : 'text-muted border-border'
      }`}
    >
      {t(`status.${status as 'draft' | 'live' | 'done'}`)}
    </span>
  );
}

export function Session({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const t = useT();
  const { lang } = useI18n();
  const locale = lang === 'pt' ? 'pt-BR' : 'en-US';
  const vests = useVests();
  const canEdit = useCanEdit();
  const isAdmin = useIsAdmin();

  const playersQ = useQuery({ queryKey: ['players'], queryFn: api.players.list });
  const sessionQ = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.sessions.get(sessionId),
  });
  const recapQ = useQuery({
    queryKey: ['session', sessionId, 'recap'],
    queryFn: () => api.sessions.recap(sessionId) as Promise<StatRow[]>,
    enabled:
      !!sessionQ.data?.session &&
      (sessionQ.data.session.status === 'done' || sessionQ.data.session.date < todayISO()),
  });

  const draw = useMutation({
    mutationFn: (mode: 'normal' | 'dropin-split') =>
      api.sessions.draw(sessionId, true, mode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session', sessionId] }),
    onError: (err: Error) => alert(err.message),
  });

  const markArrived = useMutation({
    mutationFn: (playerId: string) => api.sessions.setArrived(sessionId, playerId, true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session', sessionId] }),
  });

  const createMatch = useMutation({
    mutationFn: api.matches.create,
    onSuccess: (m: any) => setLocation(`/matches/${m.id}`),
  });

  const endSession = useMutation({
    mutationFn: () => api.sessions.end(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session', 'active'] });
      qc.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  // Promote a guest who played into a regular drop-in (admin-approved), keeping
  // their id/stats. Skill, photo and emergency contact are added afterward in
  // the Players tab. Once promoted they drop off the prompt below.
  const promote = useMutation({
    mutationFn: (p: Player) =>
      api.players.update(p.id, { name: p.name, type: 'dropin', skills: p.skills }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
    onError: (err: Error) => alert(err.message),
  });

  const deleteSession = useMutation({
    mutationFn: () => api.sessions.remove(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session', 'active'] });
      qc.invalidateQueries({ queryKey: ['stats', 'weeks'] });
      qc.invalidateQueries({ queryKey: ['stats', 'season'] });
      setLocation('/recap');
    },
  });

  const assignToTeam = useMutation({
    mutationFn: ({ teamId, playerId }: { teamId: string; playerId: string }) =>
      api.sessions.assignPlayerToTeam(sessionId, teamId, playerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session', sessionId] }),
  });

  const removeFromTeam = useMutation({
    mutationFn: ({ teamId, playerId }: { teamId: string; playerId: string }) =>
      api.sessions.removePlayerFromTeam(sessionId, teamId, playerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session', sessionId] }),
  });

  const [addToTeamId, setAddToTeamId] = useState<string | null>(null);

  const players = playersQ.data ?? [];
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const [pickedTeams, setPickedTeams] = useState<{ a?: string; b?: string }>({});

  if (sessionQ.isLoading) return <div className="p-4 text-muted">{t('common.loading')}</div>;
  const data = sessionQ.data;
  if (!data) return <div className="p-4">{t('common.notFound')}</div>;

  // A game is frozen once its day is over (ended, or its date has passed) — its
  // teams/lineup are read-only from then on, matching the server. Stat fixes
  // stay available to admins on the individual match screens.
  const frozen = data.session.status === 'done' || data.session.date < todayISO();

  const teams = (data.teams ?? []) as { id: string; vest: Vest; player_ids: string[] }[];
  const latePlayerIds = (data.late_player_ids ?? []) as string[];
  const latePlayers = latePlayerIds
    .map((id) => playerById.get(id))
    .filter(Boolean) as Player[];
  const presentCount = data.player_ids.length - latePlayerIds.length;
  const matches = (data.matches ?? []) as any[];
  const lastMatch = matches[matches.length - 1];
  const liveMatch = lastMatch && lastMatch.status !== 'done' ? lastMatch : null;

  const hasDraw = teams.length === 3;
  // Where should an incoming player go? Smallest team first (keeps 5v5
  // possible), lowest total power as tie-break.
  const recommendedTeamId = hasDraw
    ? [...teams]
        .map((tm) => ({
          id: tm.id,
          size: tm.player_ids.length,
          power: tm.player_ids.reduce((s, pid) => {
            const p = playerById.get(pid);
            return s + (p ? calcScore(p.skills) : 0);
          }, 0),
        }))
        .sort((a, b) => a.size - b.size || a.power - b.power)[0]?.id ?? null
    : null;
  const allOnPitch =
    pickedTeams.a && pickedTeams.b ? new Set([pickedTeams.a, pickedTeams.b]) : null;
  const benchTeam =
    allOnPitch && teams.find((t) => !allOnPitch.has(t.id));

  return (
    <div className="p-4 pb-48 space-y-4">
      <header className="space-y-1">
        <button className="text-sm text-muted hover:text-fg" onClick={() => setLocation('/')}>
          {t('common.home')}
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="title-lg capitalize">{fmtSessionDate(data.session.date, locale)}</h1>
          <StatusPill status={data.session.status} />
        </div>
        {data.session.status === 'done' && matches.length > 0 ? (
          <p className="text-sm text-muted">{t('session.matchesPlayed', { n: matches.length })}</p>
        ) : null}
      </header>

      {!frozen ? <AccessBar /> : null}

      {isAdmin && !frozen && data.session.code ? (
        <SessionCodeCard code={data.session.code} />
      ) : null}

      {isAdmin && frozen ? (
        <GuestPromote
          guests={
            (data.player_ids as string[])
              .map((id) => playerById.get(id))
              .filter((p: Player | undefined): p is Player => !!p && p.type === 'guest')
          }
          onPromote={(p) => promote.mutate(p)}
          pending={promote.isPending}
        />
      ) : null}

      {!frozen && canEdit && latePlayers.length > 0 ? (
        <LateSection
          players={latePlayers}
          teams={hasDraw ? teams : []}
          recommendedTeamId={recommendedTeamId}
          onArrived={(pid) => markArrived.mutate(pid)}
          onAssign={(pid, teamId) => assignToTeam.mutate({ teamId, playerId: pid })}
          pending={markArrived.isPending || assignToTeam.isPending}
        />
      ) : null}

      {frozen ? (
        <DoneSessionLayout
          session={data.session}
          teams={teams}
          matches={matches}
          playerById={playerById}
          recap={recapQ.data}
          onOpenMatch={(id) => setLocation(`/matches/${id}`)}
          canEdit={isAdmin}
          onDelete={() => {
            if (confirm(t('session.confirmDelete'))) deleteSession.mutate();
          }}
          deletePending={deleteSession.isPending}
        />
      ) : !hasDraw ? (
        <section className="card space-y-2">
          <p className="text-sm text-muted">
            {t('session.drawPrompt', { n: presentCount })}
          </p>
          {canEdit ? (
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={() => draw.mutate('normal')}>
                {t('session.balanced')}
              </button>
              <button className="btn flex-1" onClick={() => draw.mutate('dropin-split')}>
                {t('session.dropinSplit')}
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">{t('session.teams')}</h2>
            {canEdit ? <p className="text-xs text-muted">{t('session.tapToPick')}</p> : null}
            <div className="grid grid-cols-3 gap-2 items-start">
              {teams.map((t) =>
                canEdit ? (
                  <TeamCard
                    key={t.id}
                    team={t}
                    players={t.player_ids.map((id) => playerById.get(id)!).filter(Boolean)}
                    selectedSide={
                      pickedTeams.a === t.id ? 'A' : pickedTeams.b === t.id ? 'B' : null
                    }
                    onPick={() =>
                      setPickedTeams((s) => {
                        if (s.a === t.id) return { ...s, a: undefined };
                        if (s.b === t.id) return { ...s, b: undefined };
                        if (!s.a) return { ...s, a: t.id };
                        if (!s.b) return { ...s, b: t.id };
                        return { a: t.id, b: undefined };
                      })
                    }
                    onRemovePlayer={(playerId) => removeFromTeam.mutate({ teamId: t.id, playerId })}
                    onAddPlayer={() => setAddToTeamId(t.id)}
                  />
                ) : (
                  <ReadOnlyTeamCard
                    key={t.id}
                    team={t}
                    players={t.player_ids.map((id) => playerById.get(id)!).filter(Boolean)}
                  />
                )
              )}
            </div>
          </section>

          {matches.length > 0 ? (
            <section>
              <h2 className="text-lg font-semibold mb-2">{t('session.matchesTonight')}</h2>
              <div className="space-y-1">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    className="card w-full flex items-center justify-between hover:border-accent"
                    onClick={() => setLocation(`/matches/${m.id}`)}
                  >
                    <span>{t('session.matchN', { n: m.ordinal })}</span>
                    <span className="text-xs text-muted">{t(`status.${m.status as 'pending' | 'running' | 'paused' | 'done'}`)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {isAdmin ? (
            <section className="mt-12 pt-4 border-t border-border space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted">
                {t('session.dangerZone')}
              </div>
              <button
                className="btn-danger w-full"
                disabled={endSession.isPending}
                onClick={() => {
                  if (confirm(t('session.confirmEnd'))) {
                    endSession.mutate();
                  }
                }}
              >
                {t('session.endSession')}
              </button>
            </section>
          ) : null}

          {/* Action bar: resume the live match, or pick two teams above and
              start the next one. Operators (day code) and admins only. */}
          {canEdit ? (
          <div className="fixed bottom-16 inset-x-0 px-4 safe-bottom pointer-events-none z-30">
            <div className="pointer-events-auto bg-bg2/95 backdrop-blur border border-border rounded-xl p-3 shadow-lg space-y-2">
              {liveMatch ? (
                <>
                  <div className="text-xs text-muted text-center">
                    {t('session.liveMatchNotice', {
                      n: liveMatch.ordinal,
                      status: t(`status.${liveMatch.status as 'pending' | 'running' | 'paused'}`),
                    })}
                  </div>
                  <button
                    className="btn-primary w-full text-base"
                    onClick={() => setLocation(`/matches/${liveMatch.id}`)}
                  >
                    ▶ {t('session.resumeMatch', { n: liveMatch.ordinal })}
                  </button>
                </>
              ) : (
                <>
                  <div className="text-xs text-muted text-center">
                    {pickedTeams.a && pickedTeams.b && benchTeam
                      ? t('session.matchup', {
                          a: vests[teams.find((tm) => tm.id === pickedTeams.a)!.vest].label,
                          b: vests[teams.find((tm) => tm.id === pickedTeams.b)!.vest].label,
                          c: vests[benchTeam.vest].label,
                        })
                      : t('session.pickTwo')}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn px-3"
                      onClick={() => draw.mutate('normal')}
                      disabled={draw.isPending}
                      title={t('session.redraw')}
                      aria-label={t('session.redraw')}
                    >
                      🎲
                    </button>
                    <button
                      className="btn-primary flex-1 text-base"
                      disabled={!pickedTeams.a || !pickedTeams.b || createMatch.isPending}
                      onClick={() => {
                        if (!pickedTeams.a || !pickedTeams.b || !benchTeam) return;
                        createMatch.mutate({
                          session_id: sessionId,
                          team_a_id: pickedTeams.a,
                          team_b_id: pickedTeams.b,
                          bench_team_id: benchTeam.id,
                        });
                      }}
                    >
                      {pickedTeams.a && pickedTeams.b
                        ? t('session.startMatch', { n: matches.length + 1 })
                        : t('session.pickTwo')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          ) : null}
        </>
      )}

      {addToTeamId ? (
        <AddPlayerSheet
          team={teams.find((t) => t.id === addToTeamId)!}
          allPlayers={players}
          teams={teams}
          onClose={() => setAddToTeamId(null)}
          onPick={(playerId) =>
            assignToTeam.mutate({ teamId: addToTeamId, playerId })
          }
        />
      ) : null}
    </div>
  );
}

// Admin-only card showing the day's 4-digit code to share with the group, so
// people at the game can help run it without an admin login.
function SessionCodeCard({ code }: { code: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-accent/40 bg-accent/[0.06] p-4 flex items-center gap-3">
      <div className="shrink-0">
        <div className="text-[10px] uppercase tracking-wide text-muted">{t('access.codeLabel')}</div>
        <div className="text-4xl font-mono font-bold tracking-[0.25em] text-accent leading-tight">
          {code}
        </div>
      </div>
      <div className="flex-1 min-w-0 text-xs text-muted">{t('access.codeShare')}</div>
      <button
        className="btn shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked — the code is visible anyway */
          }
        }}
      >
        {copied ? t('access.copied') : '📋'}
      </button>
    </div>
  );
}

// Shown after a session ends when guests played: promote them to regular
// drop-ins (admin-approved) to keep their stats. Empties itself as guests are
// promoted (playersQ re-fetches and they no longer count as guests).
function GuestPromote({
  guests,
  onPromote,
  pending,
}: {
  guests: Player[];
  onPromote: (p: Player) => void;
  pending: boolean;
}) {
  const t = useT();
  if (guests.length === 0) return null;
  return (
    <section className="card space-y-2 border-amber-500/40">
      <h2 className="font-semibold text-sm">{t('session.promoteTitle')}</h2>
      <p className="text-xs text-muted">{t('session.promoteHint')}</p>
      <div className="space-y-1.5">
        {guests.map((g) => (
          <div key={g.id} className="flex items-center gap-2">
            <Avatar playerId={g.id} name={g.name} size={28} />
            <span className="flex-1 min-w-0 truncate text-sm">{g.name}</span>
            <span className="text-[10px] text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/50">
              {t('checkin.guest')}
            </span>
            <button className="btn text-xs shrink-0" disabled={pending} onClick={() => onPromote(g)}>
              {t('session.promoteBtn')}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function LateSection({
  players,
  teams,
  recommendedTeamId,
  onArrived,
  onAssign,
  pending,
}: {
  players: Player[];
  teams: { id: string; vest: Vest }[];
  recommendedTeamId: string | null;
  onArrived: (playerId: string) => void;
  onAssign: (playerId: string, teamId: string) => void;
  pending: boolean;
}) {
  const t = useT();
  const vests = useVests();
  // Recommended vest first, so the obvious tap is the leftmost button.
  const orderedTeams = [...teams].sort(
    (a, b) =>
      Number(b.id === recommendedTeamId) - Number(a.id === recommendedTeamId)
  );
  return (
    <section className="card space-y-2 border-amber-500/40">
      <div className="flex items-center gap-2">
        <span className="text-base">⏰</span>
        <h2 className="font-semibold">{t('session.lateSection')}</h2>
        <span className="ml-auto text-xs text-muted">
          {t('team.playersCount', { n: players.length })}
        </span>
      </div>
      <p className="text-xs text-muted">{t('session.lateNote')}</p>
      <div className="flex flex-col gap-1">
        {players.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2 px-2 py-1 rounded-lg bg-bg3 border border-border"
          >
            <Avatar playerId={p.id} name={p.name} size={32} />
            <span className="text-sm font-medium truncate flex-1">
              {p.name}            </span>
            {orderedTeams.length > 0 ? (
              orderedTeams.map((tm) => {
                const recommended = tm.id === recommendedTeamId;
                return (
                  <button
                    key={tm.id}
                    type="button"
                    disabled={pending}
                    className={`text-xs px-2 py-1 rounded-md font-semibold disabled:opacity-40 ${
                      recommended ? 'ring-2 ring-accent' : 'opacity-60'
                    }`}
                    onClick={() => onAssign(p.id, tm.id)}
                    style={{ minHeight: 36, ...pillStyle(vests[tm.vest].color) }}
                  >
                    {recommended ? '⭐ ' : '→ '}
                    {vests[tm.vest].label}
                  </button>
                );
              })
            ) : (
              <button
                type="button"
                disabled={pending}
                className="btn text-sm px-3 py-1"
                onClick={() => onArrived(p.id)}
                style={{ minHeight: 36 }}
              >
                ✅ {t('session.arrived')}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function DoneSessionLayout({
  session,
  teams,
  matches,
  playerById,
  recap,
  onOpenMatch,
  canEdit,
  onDelete,
  deletePending,
}: {
  session: { date: string; status: string };
  teams: { id: string; vest: Vest; player_ids: string[] }[];
  matches: any[];
  playerById: Map<string, Player>;
  recap: StatRow[] | undefined;
  onOpenMatch: (id: string) => void;
  canEdit: boolean;
  onDelete: () => void;
  deletePending: boolean;
}) {
  const t = useT();
  const bests = recap ? bestOfEachCategory(recap) : [];
  const leaderboardRows = recap
    ? recap.map((r) => ({ ...r, points: calcPoints(r) }))
    : [];
  return (
    <>
      <section>
        <div className="section-head">
          <h2 className="font-semibold">{t('recap.bestOfDay')}</h2>
        </div>
        {recap && bests.length > 0 ? (
          <BestShowcase bests={bests} />
        ) : (
          <div className="card text-sm text-muted">{t('recap.noStats')}</div>
        )}
      </section>

      {leaderboardRows.length > 0 ? (
        <section>
          <div className="section-head">
            <h2 className="font-semibold">{t('recap.leaderboard')}</h2>
          </div>
          <Leaderboard rows={leaderboardRows} showMatches={false} showSessions={false} />
        </section>
      ) : null}

      {matches.length > 0 ? (
        <section>
          <div className="section-head">
            <h2 className="font-semibold">{t('session.matchesTonight')}</h2>
            <span className="text-xs text-muted">{t('session.matchesTotal', { n: matches.length })}</span>
          </div>
          <div className="space-y-1.5">
            {matches.map((m) => {
              const done = m.status === 'done';
              return (
                <button
                  key={m.id}
                  className="card w-full flex items-center gap-3 hover:border-accent/50 transition"
                  onClick={() => onOpenMatch(m.id)}
                >
                  <span className="w-6 h-6 shrink-0 rounded-md bg-bg3 border border-border flex items-center justify-center text-xs font-bold">
                    {m.ordinal}
                  </span>
                  <span className="flex-1 text-left font-medium">
                    {t('session.matchN', { n: m.ordinal })}
                  </span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      done ? 'text-accent border-accent/40 bg-accent/10' : 'text-muted border-border'
                    }`}
                  >
                    {t(`status.${m.status as 'pending' | 'running' | 'paused' | 'done'}`)}
                  </span>
                  <span className="text-muted">›</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="section-head">
          <h2 className="font-semibold">{t('session.teams')}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {teams.map((tm) => (
            <ReadOnlyTeamCard
              key={tm.id}
              team={tm}
              players={tm.player_ids.map((id) => playerById.get(id)!).filter(Boolean)}
            />
          ))}
        </div>
      </section>

      <section className="mt-12 pt-4 border-t border-border space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted">
          {t('session.dangerZone')}
        </div>
        <button
          className="btn-danger w-full"
          disabled={!canEdit || deletePending}
          title={!canEdit ? t('auth.adminOnly') : undefined}
          onClick={onDelete}
        >
          {t('common.delete')}
        </button>
        {!canEdit ? (
          <div className="text-xs text-muted">{t('auth.adminOnly')}</div>
        ) : null}
      </section>
    </>
  );
}

function ReadOnlyTeamCard({
  team,
  players,
}: {
  team: { id: string; vest: Vest };
  players: Player[];
}) {
  const vests = useVests();
  const totalScore = players.reduce((s, p) => s + calcScore(p.skills), 0);
  const avg = players.length ? Math.round((totalScore / players.length) * 10) / 10 : 0;
  return (
    <div className="p-2 rounded-xl border-2" style={panelStyle(vests[team.vest].color)}>
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={pillStyle(vests[team.vest].color)}>
          {vests[team.vest].label}
        </span>
      </div>
      <div className="text-[11px] tabular-nums mb-1 text-muted">
        ⚡{totalScore} · {avg} · {players.length}
      </div>
      <div className="flex flex-col gap-1">
        {players.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-1 px-1 py-0.5 rounded-md bg-bg3 border border-border min-w-0"
          >
            <Avatar playerId={p.id} name={p.name} size={20} />
            <span className="flex-1 text-[11px] font-medium truncate text-fg">{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamCard({
  team,
  players,
  selectedSide,
  onPick,
  onRemovePlayer,
  onAddPlayer,
}: {
  team: { id: string; vest: Vest };
  players: Player[];
  selectedSide: 'A' | 'B' | null;
  onPick: () => void;
  onRemovePlayer: (playerId: string) => void;
  onAddPlayer: () => void;
}) {
  const t = useT();
  const vests = useVests();
  const totalScore = players.reduce((s, p) => s + calcScore(p.skills), 0);
  const avg = players.length ? Math.round((totalScore / players.length) * 10) / 10 : 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onPick();
      }}
      className={`p-2 rounded-xl border-2 cursor-pointer select-none transition ${
        selectedSide ? 'border-accent ring-2 ring-accent/40' : ''
      }`}
      style={panelStyle(vests[team.vest].color)}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={pillStyle(vests[team.vest].color)}>
          {vests[team.vest].label}
        </span>
        {selectedSide ? (
          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-accent text-black">
            {selectedSide}
          </span>
        ) : null}
      </div>
      <div className="text-[11px] tabular-nums mb-1 text-muted">
        ⚡{totalScore} · {avg} · {players.length}
      </div>
      <div className="flex flex-col gap-1">
        {players.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-1 px-1 py-0.5 rounded-md bg-bg3 border border-border min-w-0"
          >
            <Avatar playerId={p.id} name={p.name} size={20} />
            <span className="flex-1 text-[11px] font-medium truncate text-fg">
              {p.name}            </span>
            <button
              type="button"
              className="text-muted hover:text-red-400 px-0.5 text-sm leading-none"
              aria-label={t('team.removeAria', { name: p.name })}
              onClick={(e) => {
                e.stopPropagation();
                onRemovePlayer(p.id);
              }}
              style={{ minHeight: 'auto' }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-[11px] px-1 py-1 rounded-md border border-dashed border-border text-muted hover:text-accent hover:border-accent"
          onClick={(e) => {
            e.stopPropagation();
            onAddPlayer();
          }}
          style={{ minHeight: 'auto' }}
        >
          {t('team.add')}
        </button>
      </div>
    </div>
  );
}

function AddPlayerSheet({
  team,
  allPlayers,
  teams,
  onClose,
  onPick,
}: {
  team: { id: string; vest: Vest };
  allPlayers: Player[];
  teams: { id: string; vest: Vest; player_ids: string[] }[];
  onClose: () => void;
  onPick: (playerId: string) => void;
}) {
  const t = useT();
  const vests = useVests();
  // Players currently on this team (excluded), and tag others by source.
  const onThisTeam = new Set(teams.find((tt) => tt.id === team.id)?.player_ids ?? []);
  const teamByPlayer = new Map<string, Vest>();
  for (const tt of teams) {
    if (tt.id === team.id) continue;
    for (const pid of tt.player_ids) teamByPlayer.set(pid, tt.vest);
  }
  const available = allPlayers
    .filter((p) => p.active !== false && !onThisTeam.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-end">
      <div className="bg-bg2 border-t border-border rounded-t-xl p-4 w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">
            {t('team.addTitle', { vest: vests[team.vest].label })}
          </h2>
          <button className="text-muted" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {available.length === 0 ? (
            <div className="text-sm text-muted">{t('team.noneAvailable')}</div>
          ) : (
            available.map((p) => {
              const onOtherVest = teamByPlayer.get(p.id);
              return (
                <button
                  key={p.id}
                  className="text-left px-3 py-2 rounded-lg border border-border bg-bg3 hover:border-accent flex items-center gap-2"
                  onClick={() => {
                    onPick(p.id);
                    onClose();
                  }}
                >
                  <Avatar playerId={p.id} name={p.name} size={32} />
                  {onOtherVest ? <VestDot color={vests[onOtherVest].color} size={10} /> : null}
                  <span className="flex-1 text-fg">
                    {p.name}
                  </span>
                  <span className="text-xs text-muted">
                    {onOtherVest
                      ? t('team.moveFrom', { vest: vests[onOtherVest].label })
                      : t('team.notInSession')}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
