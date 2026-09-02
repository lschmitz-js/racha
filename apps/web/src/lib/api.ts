import type { ImportEnvelope, Player } from '@racha/shared';

export interface EmergencyContact {
  player_phone: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  relationship: string | null;
  medical_notes: string | null;
}

export interface AuthUser {
  id: string;
  name: string;
  master: boolean;
}

export interface AuditEntry {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  path: string;
  status: number;
  detail: string | null;
  created_at: number;
}

export interface CheckinEntry {
  id: string;
  name: string;
  type: 'season' | 'dropin' | 'guest';
  checked_in_at: number | null;
}
export interface CheckinBoard {
  game_date: string | null;
  cap: number;
  confirmed: CheckinEntry[];
  waitlist: CheckinEntry[];
  out: CheckinEntry[];
  guest_cap: number;
  guest_count: number;
  guests_allowed: boolean;
}

// Fields accepted when creating/updating a player. is_admin + password are
// optional admin-management fields; password is write-only.
type PlayerWrite = Omit<Player, 'id' | 'active' | 'is_admin'> & {
  active?: boolean;
  is_admin?: boolean;
  password?: string;
};

const ADMIN_TOKEN_KEY = 'racha.adminToken';
const SESSION_CODE_KEY = 'racha.code';

// The synthetic user id the server returns for a caller authorized by the day's
// session code (not an admin login).
export const OPERATOR_USER_ID = '__operator__';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function getSessionCode(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(SESSION_CODE_KEY);
}

export function setSessionCode(code: string | null) {
  if (typeof window === 'undefined') return;
  if (code) window.localStorage.setItem(SESSION_CODE_KEY, code);
  else window.localStorage.removeItem(SESSION_CODE_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const code = getSessionCode();
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-racha-token': token } : {}),
      ...(code ? { 'x-racha-code': code } : {}),
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
  authCheck: () =>
    request<{ required: boolean; ok: boolean; user: AuthUser | null }>(`/api/auth/check`),

  auth: {
    login: (name: string, password: string) =>
      request<{ token: string; user: AuthUser }>(`/api/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ name, password }),
      }),
    logout: () => request<{ ok: true }>(`/api/auth/logout`, { method: 'POST' }),
  },

  settings: {
    get: () =>
      request<{
        vests: Record<string, { color: string; label: string }>;
        contact: { etransfer: string; siteUrl: string };
        guests: { selfAdd: boolean };
      }>(`/api/settings`),
    updateVests: (vests: Record<string, { color: string; label: string }>) =>
      request<{ vests: Record<string, { color: string; label: string }> }>(`/api/settings`, {
        method: 'PUT',
        body: JSON.stringify({ vests }),
      }),
    updateContact: (contact: { etransfer: string; siteUrl: string }) =>
      request<{ contact: { etransfer: string; siteUrl: string } }>(`/api/settings`, {
        method: 'PUT',
        body: JSON.stringify({ contact }),
      }),
    updateGuests: (guests: { selfAdd: boolean }) =>
      request<{ guests: { selfAdd: boolean } }>(`/api/settings`, {
        method: 'PUT',
        body: JSON.stringify({ guests }),
      }),
  },

  audit: {
    list: (userId?: string, limit = 200) => {
      const q = new URLSearchParams();
      if (userId) q.set('user', userId);
      q.set('limit', String(limit));
      return request<{ entries: AuditEntry[]; users: Array<{ user_id: string; user_name: string }> }>(
        `/api/audit?${q.toString()}`
      );
    },
  },

  players: {
    list: () => request<Player[]>(`/api/players`),
    avatarUrl: (id: string, version?: string | number | null) =>
      `/api/players/${id}/avatar${version ? `?v=${version}` : ''}`,
    uploadAvatar: async (id: string, blob: Blob) => {
      const fd = new FormData();
      fd.append('file', blob, 'avatar');
      const token = getAdminToken();
      const res = await fetch(`/api/players/${id}/avatar`, {
        method: 'POST',
        body: fd,
        headers: token ? { 'x-racha-token': token } : {},
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      return res.json() as Promise<{ ok: true; ext: string }>;
    },
    deleteAvatar: (id: string) =>
      request<{ ok: true }>(`/api/players/${id}/avatar`, { method: 'DELETE' }),
    create: (input: PlayerWrite) =>
      request<Player>(`/api/players`, { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: PlayerWrite) =>
      request<Player>(`/api/players/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    remove: (id: string) =>
      request<{ ok: true }>(`/api/players/${id}`, { method: 'DELETE' }),
    import: (env: ImportEnvelope) =>
      request<{ ok: true; imported: number }>(`/api/players/import`, {
        method: 'POST',
        body: JSON.stringify(env),
      }),
    export: () => request<ImportEnvelope>(`/api/players/export`),
    // Admin: which players have submitted emergency contacts. { [id]: true }
    emergencyStatus: () => request<Record<string, boolean>>(`/api/players/emergency-status`),
    // Admin: download all emergency contacts as CSV text (token-gated).
    emergencyExportCsv: async (): Promise<string> => {
      const token = getAdminToken();
      const res = await fetch(`/api/players/emergency-export`, {
        headers: token ? { 'x-racha-token': token } : {},
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      return res.text();
    },
    // Admin: a player's private link token + submitted contact.
    emergencyAdmin: (id: string) =>
      request<{ token: string; contact: (EmergencyContact & { updated_at: number }) | null }>(
        `/api/players/${id}/emergency`
      ),
    // Admin: issue a fresh emergency token, invalidating the old link.
    emergencyRotate: (id: string) =>
      request<{ token: string }>(`/api/players/${id}/emergency/rotate`, { method: 'POST' }),
  },

  // Public self-service emergency-contact flow (secret token = authorization).
  emergency: {
    get: (token: string) =>
      request<{ name: string; contact: EmergencyContact | null }>(
        `/api/emergency/${encodeURIComponent(token)}`
      ),
    save: (token: string, data: EmergencyContact) =>
      request<{ ok: true }>(`/api/emergency/${encodeURIComponent(token)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  sessions: {
    list: () => request<any[]>(`/api/sessions`),
    active: () => request<any | null>(`/api/sessions/active`),
    get: (id: string) => request<any>(`/api/sessions/${id}`),
    create: (player_ids: string[], late_ids: string[] = []) =>
      request<{ id: string }>(`/api/sessions`, {
        method: 'POST',
        body: JSON.stringify({ player_ids, late_ids }),
      }),
    setArrived: (sessionId: string, playerId: string, arrived = true) =>
      request<any>(`/api/sessions/${sessionId}/players/${playerId}/arrival`, {
        method: 'POST',
        body: JSON.stringify({ arrived }),
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
    create: (input: {
      session_id: string;
      team_a_id: string;
      team_b_id: string;
      bench_team_id: string;
      borrow?: { player_ids: string[] };
    }) => request<any>(`/api/matches`, { method: 'POST', body: JSON.stringify(input) }),
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
    remove: (id: string) => request<{ ok: true }>(`/api/matches/${id}`, { method: 'DELETE' }),
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
      clock_ms?: number;
    }) =>
      request<any>(`/api/events`, { method: 'POST', body: JSON.stringify(input) }),
    update: (
      id: string,
      input: { type?: string; player_id?: string; team_id?: string; clock_ms?: number }
    ) =>
      request<any>(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    sub: (input: { match_id: string; team_id: string; out_player_id?: string; in_player_id: string }) =>
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
    // No range => all-time; { from, to } => that season window.
    season: (range?: { from?: string; to?: string }) => {
      const q = new URLSearchParams();
      if (range?.from) q.set('from', range.from);
      if (range?.to) q.set('to', range.to);
      const qs = q.toString();
      return request<any[]>(`/api/stats/season${qs ? `?${qs}` : ''}`);
    },
    weeks: () => request<any[]>(`/api/stats/weeks`),
  },

  checkin: {
    get: () => request<CheckinBoard>(`/api/checkin`),
    set: (player_id: string, status: 'in' | 'out' | 'none') =>
      request<CheckinBoard>(`/api/checkin`, {
        method: 'POST',
        body: JSON.stringify({ player_id, status }),
      }),
    clearAll: () => request<CheckinBoard>(`/api/checkin/all`, { method: 'DELETE' }),
    addGuest: (name: string) =>
      request<CheckinBoard>(`/api/checkin/guest`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
  },
};
