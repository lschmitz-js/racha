import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useState, useMemo } from 'react';
import { api } from '../lib/api.js';
import type { Player } from '@racha/shared';

export function Home() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const playersQ = useQuery({ queryKey: ['players'], queryFn: api.players.list });
  const activeQ = useQuery({ queryKey: ['session', 'active'], queryFn: api.sessions.active });
  const sessionsQ = useQuery({ queryKey: ['sessions'], queryFn: api.sessions.list });

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

  if (playersQ.isLoading) return <div className="p-4 text-muted">Loading…</div>;

  return (
    <div className="p-4 pb-32 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Racha de Segunda</h1>
      </header>

      {activeQ.data ? (
        <div className="card flex items-center justify-between">
          <div>
            <div className="text-sm text-muted">Active session</div>
            <div className="font-semibold">{activeQ.data.date}</div>
          </div>
          <button className="btn-primary" onClick={() => setLocation(`/sessions/${activeQ.data.id}`)}>
            Open →
          </button>
        </div>
      ) : null}

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Tonight's lineup</h2>
          <span className="text-sm text-muted">{selected.size} selected</span>
        </div>

        <div className="card space-y-3">
          <div>
            <div className="text-xs text-muted mb-2">Season players</div>
            <div className="flex flex-wrap gap-2">
              {sessionPlayers.map((p) => (
                <PlayerChip
                  key={p.id}
                  p={p}
                  on={selected.has(p.id)}
                  onClick={() => toggle(p.id)}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted mb-2">Drop-ins</div>
            <div className="flex flex-wrap gap-2">
              {dropinPlayers.map((p) => (
                <PlayerChip
                  key={p.id}
                  p={p}
                  on={selected.has(p.id)}
                  onClick={() => toggle(p.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            className="btn-primary flex-1"
            disabled={selected.size < 6 || create.isPending}
            onClick={() => create.mutate(Array.from(selected))}
          >
            {selected.size < 6 ? `Select ${6 - selected.size} more` : 'Start session →'}
          </button>
          <button className="btn" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
            Clear
          </button>
        </div>
      </section>

      {sessionsQ.data && sessionsQ.data.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold mb-2">Past sessions</h2>
          <div className="space-y-2">
            {sessionsQ.data.slice(0, 10).map((s: any) => (
              <button
                key={s.id}
                onClick={() => setLocation(`/sessions/${s.id}`)}
                className="card w-full flex items-center justify-between hover:border-accent transition"
              >
                <div className="text-left">
                  <div className="font-medium">{s.date}</div>
                  <div className="text-xs text-muted capitalize">{s.status}</div>
                </div>
                <span className="text-muted">→</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PlayerChip({ p, on, onClick }: { p: Player; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`chip ${on ? 'chip-on' : ''}`}
      style={{ minHeight: 36 }}
    >
      <span>{p.name}</span>
      {p.role === 'gk' ? (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">GK</span>
      ) : null}
    </button>
  );
}
