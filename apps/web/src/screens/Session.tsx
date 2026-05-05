import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { useCanEdit } from '../lib/auth.js';
import { BestGrid } from '../components/Bests.js';
import { Leaderboard } from '../components/Leaderboard.js';
import { bestOfEachCategory, calcPoints, type StatRow } from '../lib/points.js';
import { calcScore, type Player, type Vest } from '@racha/shared';

const VEST_COLORS: Record<Vest, string> = {
  white: 'vest-white',
  black: 'vest-black',
  green: 'vest-green',
};

export function Session({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const t = useT();
  const canEdit = useCanEdit();

  const playersQ = useQuery({ queryKey: ['players'], queryFn: api.players.list });
  const sessionQ = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.sessions.get(sessionId),
  });
  const recapQ = useQuery({
    queryKey: ['session', sessionId, 'recap'],
    queryFn: () => api.sessions.recap(sessionId) as Promise<StatRow[]>,
    enabled: sessionQ.data?.session?.status === 'done',
  });

  const draw = useMutation({
    mutationFn: (mode: 'normal' | 'dropin-split') =>
      api.sessions.draw(sessionId, true, mode),
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

  const teams = (data.teams ?? []) as { id: string; vest: Vest; player_ids: string[] }[];
  const matches = (data.matches ?? []) as any[];
  const lastMatch = matches[matches.length - 1];
  const liveMatch = lastMatch && lastMatch.status !== 'done' ? lastMatch : null;

  const hasDraw = teams.length === 3;
  const allOnPitch =
    pickedTeams.a && pickedTeams.b ? new Set([pickedTeams.a, pickedTeams.b]) : null;
  const benchTeam =
    allOnPitch && teams.find((t) => !allOnPitch.has(t.id));

  return (
    <div className="p-4 pb-32 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <button className="text-sm text-muted" onClick={() => setLocation('/')}>
            {t('common.home')}
          </button>
          <h1 className="text-xl font-bold">{data.session.date}</h1>
          <span className="text-xs text-muted">{t(`status.${data.session.status as 'draft' | 'live' | 'done'}`)}</span>
        </div>
      </header>

      {!hasDraw ? (
        <section className="card space-y-2">
          <p className="text-sm text-muted">
            {t('session.drawPrompt', { n: data.player_ids.length })}
          </p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => draw.mutate('normal')}>
              {t('session.balanced')}
            </button>
            <button className="btn flex-1" onClick={() => draw.mutate('dropin-split')}>
              {t('session.dropinSplit')}
            </button>
          </div>
        </section>
      ) : data.session.status === 'done' ? (
        <DoneSessionLayout
          session={data.session}
          teams={teams}
          matches={matches}
          playerById={playerById}
          recap={recapQ.data}
          onOpenMatch={(id) => setLocation(`/matches/${id}`)}
          canEdit={canEdit}
          onDelete={() => {
            if (confirm(t('session.confirmDelete'))) deleteSession.mutate();
          }}
          deletePending={deleteSession.isPending}
        />
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">{t('session.teams')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {teams.map((t) => (
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
                  onRemovePlayer={(playerId) =>
                    removeFromTeam.mutate({ teamId: t.id, playerId })
                  }
                  onAddPlayer={() => setAddToTeamId(t.id)}
                />
              ))}
            </div>
            <button
              className="btn w-full"
              onClick={() => draw.mutate('normal')}
              disabled={draw.isPending}
            >
              {t('session.redraw')}
            </button>
          </section>

          <section className="card space-y-2">
            {liveMatch ? (
              <>
                <div className="text-sm text-muted">
                  {t('session.liveMatchNotice', {
                    n: liveMatch.ordinal,
                    status: t(`status.${liveMatch.status as 'pending' | 'running' | 'paused'}`),
                  })}
                </div>
                <button
                  className="btn-primary w-full"
                  onClick={() => setLocation(`/matches/${liveMatch.id}`)}
                >
                  {t('session.resumeMatch', { n: liveMatch.ordinal })}
                </button>
              </>
            ) : (
              <>
                <div className="text-sm text-muted">{t('session.pickPrompt')}</div>
                <button
                  className="btn-primary w-full"
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
              </>
            )}
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

          <section className="mt-12 pt-4 border-t border-border space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted">
              {t('session.dangerZone')}
            </div>
            <button
              className="btn-danger w-full"
              disabled={!canEdit || endSession.isPending}
              title={!canEdit ? t('auth.adminOnly') : undefined}
              onClick={() => {
                if (confirm(t('session.confirmEnd'))) {
                  endSession.mutate();
                }
              }}
            >
              {t('session.endSession')}
            </button>
            {!canEdit ? (
              <div className="text-xs text-muted">{t('auth.adminOnly')}</div>
            ) : null}
          </section>
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
        <h2 className="text-lg font-semibold mb-2">{t('recap.bestOfDay')}</h2>
        {recap && bests.length > 0 ? (
          <BestGrid bests={bests} />
        ) : (
          <div className="card text-sm text-muted">{t('recap.noStats')}</div>
        )}
      </section>

      {leaderboardRows.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold mb-2">{t('recap.leaderboard')}</h2>
          <Leaderboard rows={leaderboardRows} showMatches={false} showSessions={false} />
        </section>
      ) : null}

      {matches.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold mb-2">{t('session.matchesTonight')}</h2>
          <div className="space-y-1">
            {matches.map((m) => (
              <button
                key={m.id}
                className="card w-full flex items-center justify-between hover:border-accent"
                onClick={() => onOpenMatch(m.id)}
              >
                <span>{t('session.matchN', { n: m.ordinal })}</span>
                <span className="text-xs text-muted">
                  {t(`status.${m.status as 'pending' | 'running' | 'paused' | 'done'}`)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('session.teams')}</h2>
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
  const t = useT();
  const totalScore = players.reduce((s, p) => s + calcScore(p.skills), 0);
  const avg = players.length ? Math.round((totalScore / players.length) * 10) / 10 : 0;
  return (
    <div className="p-3 rounded-xl border border-border">
      <div className="flex items-center justify-between mb-2">
        <div className={`px-2 py-1 rounded-md inline-block ${VEST_COLORS[team.vest]}`}>
          {t(`vest.${team.vest}`)} ({avg})
        </div>
        <span className="text-xs text-muted">
          {t('team.playersCount', { n: players.length })}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {players.map((p) => (
          <span
            key={p.id}
            className="text-xs px-2 py-0.5 rounded-full bg-bg3 border border-border"
          >
            {p.name}
            {p.role === 'gk' ? ' 🧤' : ''}
          </span>
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
  const totalScore = players.reduce((s, p) => s + calcScore(p.skills), 0);
  const avg = players.length ? Math.round((totalScore / players.length) * 10) / 10 : 0;
  return (
    <div
      className={`p-3 rounded-xl border-2 ${
        selectedSide ? 'border-accent ring-2 ring-accent/30' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={`px-2 py-1 rounded-md inline-block ${VEST_COLORS[team.vest]}`}>
          {t(`vest.${team.vest}`)} ({avg})
        </div>
        <span className="text-xs text-muted">{t('team.playersCount', { n: players.length })}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {players.map((p) => (
          <span
            key={p.id}
            className="text-xs px-2 py-0.5 rounded-full bg-bg3 border border-border inline-flex items-center gap-1"
          >
            {p.name}
            {p.role === 'gk' ? ' 🧤' : ''}
            <button
              type="button"
              className="text-muted hover:text-red-400"
              aria-label={t('team.removeAria', { name: p.name })}
              onClick={() => onRemovePlayer(p.id)}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          className="text-xs px-2 py-0.5 rounded-full border border-dashed border-border text-muted hover:text-accent hover:border-accent"
          onClick={onAddPlayer}
        >
          {t('team.add')}
        </button>
      </div>
      <button className="btn w-full mt-2" onClick={onPick}>
        {selectedSide
          ? selectedSide === 'A'
            ? t('team.onPitchA')
            : t('team.onPitchB')
          : t('team.pickToPlay')}
      </button>
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
            {t('team.addTitle', { vest: t(`vest.${team.vest}`) })}
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
                  className="text-left px-3 py-2 rounded-lg border border-border bg-bg3 hover:border-accent flex items-center justify-between"
                  onClick={() => {
                    onPick(p.id);
                    onClose();
                  }}
                >
                  <span>
                    {p.name}
                    {p.role === 'gk' ? ' 🧤' : ''}
                  </span>
                  <span className="text-xs text-muted">
                    {onOtherVest
                      ? t('team.moveFrom', { vest: t(`vest.${onOtherVest}`) })
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
