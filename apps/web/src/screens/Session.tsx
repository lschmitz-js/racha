import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { calcScore, type Player, type Vest } from '@racha/shared';

const VEST_COLORS: Record<Vest, string> = {
  white: 'vest-white',
  black: 'vest-black',
  green: 'vest-green',
};

const VEST_LABEL: Record<Vest, string> = {
  white: 'White',
  black: 'Black',
  green: 'Green',
};

export function Session({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const playersQ = useQuery({ queryKey: ['players'], queryFn: api.players.list });
  const sessionQ = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.sessions.get(sessionId),
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

  const players = playersQ.data ?? [];
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const [pickedTeams, setPickedTeams] = useState<{ a?: string; b?: string }>({});

  if (sessionQ.isLoading) return <div className="p-4 text-muted">Loading…</div>;
  const data = sessionQ.data;
  if (!data) return <div className="p-4">Not found</div>;

  const teams = (data.teams ?? []) as { id: string; vest: Vest; player_ids: string[] }[];
  const matches = (data.matches ?? []) as any[];
  const lastMatch = matches[matches.length - 1];

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
            ← Home
          </button>
          <h1 className="text-xl font-bold">{data.session.date}</h1>
          <span className="text-xs text-muted capitalize">{data.session.status}</span>
        </div>
        {data.session.status !== 'done' ? (
          <button className="btn-danger" onClick={() => endSession.mutate()}>
            End session
          </button>
        ) : null}
      </header>

      {!hasDraw ? (
        <section className="card space-y-2">
          <p className="text-sm text-muted">
            {data.player_ids.length} players selected. Draw to balance into 3 teams.
          </p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => draw.mutate('normal')}>
              Balanced
            </button>
            <button className="btn flex-1" onClick={() => draw.mutate('dropin-split')}>
              Drop-in split
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Teams</h2>
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
                />
              ))}
            </div>
            <button
              className="btn w-full"
              onClick={() => draw.mutate('normal')}
              disabled={draw.isPending}
            >
              Redraw (balanced)
            </button>
          </section>

          <section className="card space-y-2">
            <div className="text-sm text-muted">
              Pick which two teams play next. The third benches.
            </div>
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
                ? `Start match ${matches.length + 1}`
                : 'Pick two teams above'}
            </button>
            {lastMatch ? (
              <button
                className="btn w-full"
                onClick={() => setLocation(`/matches/${lastMatch.id}`)}
              >
                Resume match {lastMatch.ordinal}
              </button>
            ) : null}
          </section>

          {matches.length > 0 ? (
            <section>
              <h2 className="text-lg font-semibold mb-2">Matches tonight</h2>
              <div className="space-y-1">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    className="card w-full flex items-center justify-between hover:border-accent"
                    onClick={() => setLocation(`/matches/${m.id}`)}
                  >
                    <span>Match {m.ordinal}</span>
                    <span className="text-xs text-muted capitalize">{m.status}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function TeamCard({
  team,
  players,
  selectedSide,
  onPick,
}: {
  team: { id: string; vest: Vest };
  players: Player[];
  selectedSide: 'A' | 'B' | null;
  onPick: () => void;
}) {
  const totalScore = players.reduce((s, p) => s + calcScore(p.skills), 0);
  const avg = players.length ? Math.round((totalScore / players.length) * 10) / 10 : 0;
  return (
    <div
      className={`p-3 rounded-xl border-2 ${
        selectedSide ? 'border-accent ring-2 ring-accent/30' : 'border-border'
      }`}
    >
      <div className={`px-2 py-1 rounded-md mb-2 inline-block ${VEST_COLORS[team.vest]}`}>
        {VEST_LABEL[team.vest]} ({avg})
      </div>
      <div className="flex flex-wrap gap-1">
        {players.map((p) => (
          <span key={p.id} className="text-xs px-2 py-0.5 rounded-full bg-bg3 border border-border">
            {p.name}
            {p.role === 'gk' ? ' 🧤' : ''}
          </span>
        ))}
      </div>
      <button className="btn w-full mt-2" onClick={onPick}>
        {selectedSide ? `On pitch (${selectedSide})` : 'Pick to play'}
      </button>
    </div>
  );
}
