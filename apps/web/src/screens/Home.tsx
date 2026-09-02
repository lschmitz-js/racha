import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { api } from '../lib/api.js';
import { useI18n, useT } from '../lib/i18n.js';
import { useCanEdit } from '../lib/auth.js';
import { nextGameDateISO, SEASON_START, SEASON_END } from '../lib/schedule.js';

function ClockIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function Home() {
  const [, setLocation] = useLocation();
  const t = useT();
  const { lang } = useI18n();
  const canEdit = useCanEdit();

  const activeQ = useQuery({ queryKey: ['session', 'active'], queryFn: api.sessions.active });
  const sessionsQ = useQuery({ queryKey: ['sessions'], queryFn: api.sessions.list });

  const locale = lang === 'pt' ? 'pt-BR' : 'en-US';
  const nextIso = nextGameDateISO();

  // Home only lists this season's games; older sessions live on the Stats page.
  const seasonSessions = ((sessionsQ.data ?? []) as any[]).filter(
    (s) => s.date >= SEASON_START && s.date <= SEASON_END
  );
  const nextLabel = nextIso
    ? new Date(nextIso + 'T12:00:00').toLocaleDateString(locale, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
    : t('home.seasonOver');
  const fmtDate = (s: string) => {
    const d = new Date(s);
    return isNaN(d.getTime())
      ? s
      : d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  };
  const active = activeQ.data;

  return (
    <div className="p-4 pb-28 space-y-5">
      <header>
        <h1 className="title-lg">{t('home.title')}</h1>
        <p className="text-sm text-muted">{t('home.subtitle')}</p>
      </header>

      {/* Next racha / resume-active card */}
      <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-4 space-y-3">
        <div className="tile-label text-accent">
          {active ? t('home.activeSession') : t('home.nextRacha')}
        </div>
        <div className="text-2xl font-bold capitalize">{active ? fmtDate(active.date) : nextLabel}</div>
        <div className="text-sm text-muted space-y-1">
          <div className="flex items-center gap-1.5">
            <ClockIcon /> {t('home.time')}
          </div>
          <div className="flex items-center gap-1.5">
            <PinIcon /> {t('home.location')}
          </div>
        </div>
        {active ? (
          <button className="btn-primary w-full" onClick={() => setLocation(`/sessions/${active.id}`)}>
            {t('home.openSession')} →
          </button>
        ) : (
          <>
            <button className="btn-primary w-full" onClick={() => setLocation('/checkin')}>
              ✅ {t('home.checkIn')}
            </button>
            {canEdit ? (
              <button className="btn w-full" onClick={() => setLocation('/start')}>
                ▶ {t('home.startRacha')}
              </button>
            ) : null}
          </>
        )}
      </div>

      {seasonSessions.length > 0 ? (
        <section>
          <div className="section-head flex items-center justify-between">
            <h2 className="font-semibold">{t('home.thisSeason')}</h2>
            <button
              className="text-xs text-muted hover:text-fg"
              onClick={() => setLocation('/recap')}
            >
              {t('home.pastSessionsLink')} →
            </button>
          </div>
          <div className="space-y-2">
            {seasonSessions.slice(0, 8).map((s: any) => {
              const d = new Date(s.date);
              const mon = isNaN(d.getTime())
                ? ''
                : d.toLocaleDateString(locale, { month: 'short' }).toUpperCase();
              const day = isNaN(d.getTime()) ? '' : String(d.getDate());
              const done = s.status === 'done';
              return (
                <button
                  key={s.id}
                  onClick={() => setLocation(`/sessions/${s.id}`)}
                  className="card w-full flex items-center gap-3 hover:border-accent/50 transition"
                >
                  <div className="w-11 h-11 shrink-0 rounded-lg bg-bg3 border border-border flex flex-col items-center justify-center leading-none">
                    <span className="text-[9px] text-muted">{mon}</span>
                    <span className="text-base font-bold">{day}</span>
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-medium truncate capitalize">{fmtDate(s.date)}</div>
                    <div className="text-xs text-muted">
                      {t(`status.${s.status as 'draft' | 'live' | 'done'}`)}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      done
                        ? 'text-accent border-accent/40 bg-accent/10'
                        : 'text-muted border-border'
                    }`}
                  >
                    {t(`status.${s.status as 'draft' | 'live' | 'done'}`)}
                  </span>
                  <span className="text-muted">›</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
