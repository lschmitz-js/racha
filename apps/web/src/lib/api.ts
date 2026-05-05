import type { ImportEnvelope, Player } from '@racha/shared';

const ADMIN_TOKEN_KEY = 'racha.adminToken';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-racha-token': token } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: () => request<{ ok: true }>(`/api/health`),
  authCheck: () => request<{ required: boolean; ok: boolean }>(`/api/auth/check`),

  players: {
    list: () => request<Player[]>(`/api/players`),
    create: (input: Omit<Player, 'id' | 'active'> & { active?: boolean }) =>
      request<Player>(`/api/players`, { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: Omit<Player, 'id' | 'active'> & { active?: boolean }) =>
      request<Player>(`/api/players/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    remove: (id: string) =>
      request<{ ok: true }>(`/api/players/${id}`, { method: 'DELETE' }),
    import: (env: ImportEnvelope) =>
      request<{ ok: true; imported: number }>(`/api/players/import`, {
        method: 'POST',
        body: JSON.stringify(env),
      }),
    export: () => request<ImportEnvelope>(`/api/players/export`),
  },

  sessions: {
    list: () => request<any[]>(`/api/sessions`),
    active: () => request<any | null>(`/api/sessions/active`),
    get: (id: string) => request<any>(`/api/sessions/${id}`),
    create: (player_ids: string[]) =>
      request<{ id: string }>(`/api/sessions`, {
        method: 'POST',
        body: JSON.stringify({ player_ids }),
      }),
    draw: (id: string, randomize: boolean, mode: 'normal' | 'dropin-split') =>
      request<any>(`/api/sessions/${id}/draw`, {
        method: 'POST',
        body: JSON.stringify({ randomize, mode }),
      }),
    end: (id: string) =>
      request<{ ok: true }>(`/api/sessions/${id}/end`, { method: 'POST' }),
    remove: (id: string) =>
      request<{ ok: true }>(`/api/sessions/${id}`, { method: 'DELETE' }),
    recap: (id: string) => request<any[]>(`/api/sessions/${id}/recap`),
    assignPlayerToTeam: (sessionId: string, teamId: string, playerId: string) =>
      request<any>(`/api/sessions/${sessionId}/teams/${teamId}/players`, {
        method: 'POST',
        body: JSON.stringify({ player_id: playerId }),
      }),
    removePlayerFromTeam: (sessionId: string, teamId: string, playerId: string) =>
      request<any>(`/api/sessions/${sessionId}/teams/${teamId}/players/${playerId}`, {
        method: 'DELETE',
      }),
  },

  matches: {
    create: (input: { session_id: string; team_a_id: string; team_b_id: string; bench_team_id: string }) =>
      request<any>(`/api/matches`, { method: 'POST', body: JSON.stringify(input) }),
    get: (id: string) => request<any>(`/api/matches/${id}`),
    start: (id: string) => request<any>(`/api/matches/${id}/start`, { method: 'POST' }),
    pause: (id: string) => request<any>(`/api/matches/${id}/pause`, { method: 'POST' }),
    resume: (id: string) => request<any>(`/api/matches/${id}/resume`, { method: 'POST' }),
    end: (id: string, body?: { result?: 'a' | 'b' | 'draw' }) =>
      request<any>(`/api/matches/${id}/end`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
    setResult: (id: string, body: { result: 'a' | 'b' | 'draw' }) =>
      request<any>(`/api/matches/${id}/result`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  events: {
    create: (input: {
      id: string;
      match_id: string;
      type: string;
      player_id: string;
      team_id: string;
      link_id?: string | null;
      clock_offset_ms?: number;
    }) =>
      request<any>(`/api/events`, { method: 'POST', body: JSON.stringify(input) }),
    sub: (input: { match_id: string; team_id: string; out_player_id: string; in_player_id: string }) =>
      request<{ link_id: string; clock_ms: number }>(`/api/events/sub`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    remove: (id: string, link = false) =>
      request<{ ok: true }>(`/api/events/${id}${link ? '?link=1' : ''}`, {
        method: 'DELETE',
      }),
  },

  stats: {
    season: () => request<any[]>(`/api/stats/season`),
    weeks: () => request<any[]>(`/api/stats/weeks`),
  },
};
