import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { useCanEdit } from '../lib/auth.js';

export function Home() {
  const [, setLocation] = useLocation();
  const t = useT();
  const canEdit = useCanEdit();

  const activeQ = useQuery({ queryKey: ['session', 'active'], queryFn: api.sessions.active });
  const sessionsQ = useQuery({ queryKey: ['sessions'], queryFn: api.sessions.list });

  return (
    <div className="p-4 pb-32 space-y-6">
      <header className="pt-6 pb-2 flex justify-center">
        <img
          src="/logo-512.png"
          alt={t('home.welcome')}
          className="w-56 h-56 sm:w-64 sm:h-64 object-contain"
        />
      </header>

      {activeQ.data ? (
        <div className="card flex items-center justify-between">
          <div>
            <div className="text-sm text-muted">{t('home.activeSession')}</div>
            <div className="font-semibold">{activeQ.data.date}</div>
          </div>
          <button className="btn-primary" onClick={() => setLocation(`/sessions/${activeQ.data.id}`)}>
            {t('home.open')}
          </button>
        </div>
      ) : (
        <div>
          <button
            className="btn-primary w-full text-lg py-4"
            disabled={!canEdit}
            title={!canEdit ? t('auth.adminOnly') : undefined}
            onClick={() => setLocation('/start')}
          >
            {t('home.startRacha')}
          </button>
          {!canEdit ? (
            <div className="text-xs text-muted mt-2 text-center">{t('auth.adminOnly')}</div>
          ) : null}
        </div>
      )}

      {sessionsQ.data && sessionsQ.data.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold mb-2">{t('home.pastSessions')}</h2>
          <div className="space-y-2">
            {sessionsQ.data.slice(0, 10).map((s: any) => (
              <button
                key={s.id}
                onClick={() => setLocation(`/sessions/${s.id}`)}
                className="card w-full flex items-center justify-between hover:border-accent transition"
              >
                <div className="text-left">
                  <div className="font-medium">{s.date}</div>
                  <div className="text-xs text-muted">{t(`status.${s.status as 'draft' | 'live' | 'done'}`)}</div>
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
