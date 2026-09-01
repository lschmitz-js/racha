import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { api, type AuditEntry } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { useCanEdit } from '../lib/auth.js';

// Turn an audit row into a plain-English line, resolving player ids to names.
function describe(e: AuditEntry, names: Map<string, string>, t: (k: any, v?: any) => string): string {
  const p = e.path;
  const nameFor = (id: string) => names.get(id) ?? `#${id.slice(0, 6)}`;

  if (p === '/api/auth/login') return e.status < 400 ? t('history.loginOk') : t('history.loginFail');
  if (p === '/api/auth/logout') return t('history.logout');
  if (p === '/api/players') return t('history.act.addPlayer');
  if (p === '/api/players/import') return t('history.act.import');

  const pm = p.match(/^\/api\/players\/([^/]+)(\/.*)?$/);
  if (pm) {
    const who = nameFor(pm[1]!);
    const sub = pm[2] ?? '';
    if (sub === '/emergency/rotate') return t('history.act.rotate', { name: who });
    if (sub.startsWith('/avatar')) return t('history.act.photo', { name: who });
    if (e.action === 'DELETE') return t('history.act.removePlayer', { name: who });
    if (e.action === 'PUT') return t('history.act.editPlayer', { name: who });
  }
  if (p.startsWith('/api/sessions')) {
    if (e.action === 'POST' && p.endsWith('/end')) return t('history.act.endSession');
    if (e.action === 'POST') return t('history.act.startSession');
    if (e.action === 'DELETE') return t('history.act.deleteSession');
  }
  if (p.startsWith('/api/matches')) return t('history.act.match');
  if (p.startsWith('/api/events')) {
    return e.action === 'DELETE' ? t('history.act.undoEvent') : t('history.act.recordEvent');
  }
  // Fallback: keep it readable by swapping any known player id for a name.
  return `${e.action} ${p.replace(/([a-z0-9]{12,})/gi, (m) => names.get(m) ?? m)}`;
}

export function History() {
  const t = useT();
  const canEdit = useCanEdit();
  const [, setLocation] = useLocation();
  const [userId, setUserId] = useState('');

  const q = useQuery({
    queryKey: ['audit', userId],
    queryFn: () => api.audit.list(userId || undefined, 300),
    enabled: canEdit,
  });
  // Includes inactive (removed) players, so deleted ids still resolve to a name.
  const playersQ = useQuery({ queryKey: ['players'], queryFn: api.players.list, enabled: canEdit });

  if (!canEdit) return <div className="p-4 text-muted">{t('auth.adminOnly')}</div>;

  const names = new Map((playersQ.data ?? []).map((p) => [p.id, p.name] as const));
  const entries = q.data?.entries ?? [];
  const users = q.data?.users ?? [];

  return (
    <div className="p-4 pb-32 space-y-3 max-w-2xl mx-auto">
      <header className="space-y-1">
        <button className="text-sm text-muted hover:text-fg" onClick={() => setLocation('/players')}>
          {t('history.back')}
        </button>
        <h1 className="text-xl font-bold">{t('history.title')}</h1>
        <p className="text-sm text-muted">{t('history.subtitle')}</p>
      </header>

      <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
        <option value="">{t('history.allUsers')}</option>
        {users.map((u) => (
          <option key={u.user_id} value={u.user_id}>
            {u.user_name}
          </option>
        ))}
      </select>

      {q.isLoading ? (
        <div className="text-muted text-sm">{t('common.loading')}</div>
      ) : entries.length === 0 ? (
        <div className="text-muted text-sm">{t('history.empty')}</div>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e) => (
            <li key={e.id} className="card flex items-start gap-3 text-sm">
              <span
                className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                  e.status < 400 ? 'bg-accent' : 'bg-red-500'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <span className="font-medium truncate">{e.user_name}</span>
                  <span className="text-xs text-muted shrink-0">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-fg/80">{describe(e, names, t)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
