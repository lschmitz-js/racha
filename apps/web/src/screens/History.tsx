import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { api, type AuditEntry } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { useCanEdit } from '../lib/auth.js';

// Human-readable one-liner for an audit entry.
function describe(e: AuditEntry, t: (k: any) => string): string {
  if (e.path === '/api/auth/login') return e.status < 400 ? t('history.loginOk') : t('history.loginFail');
  if (e.path === '/api/auth/logout') return t('history.logout');
  return `${e.action} ${e.path}`;
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

  if (!canEdit) return <div className="p-4 text-muted">{t('auth.adminOnly')}</div>;

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
                <div className="text-muted break-all font-mono text-xs">
                  {describe(e, t)} · {e.status}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
