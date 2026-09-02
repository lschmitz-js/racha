import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { api } from '../lib/api.js';
import { useI18n, useT } from '../lib/i18n.js';
import { useCanEdit, useIsAdmin } from '../lib/auth.js';
import { GameCalendar } from '../components/GameCalendar.js';
import {
  nextGameDateISO,
  SEASON_START,
  SEASON_END,
  isNoGameDate,
  upcomingMondayISO,
  NO_GAME_DATES,
} from '../lib/schedule.js';

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
  const isAdmin = useIsAdmin();

  const activeQ = useQuery({ queryKey: ['session', 'active'], queryFn: api.sessions.active });
  const sessionsQ = useQuery({ queryKey: ['sessions'], queryFn: api.sessions.list });
  const cancellationsQ = useQuery({ queryKey: ['cancellations'], queryFn: api.cancellations.list });

  const locale = lang === 'pt' ? 'pt-BR' : 'en-US';
  const cancels = cancellationsQ.data ?? [];
  const cancelledSet = new Set(cancels.map((c) => c.date));
  const cancelReasons = new Map(cancels.map((c) => [c.date, c.reason]));
  const nextIso = nextGameDateISO(new Date(), Array.from(cancelledSet));

  const holidayName = (iso: string) => {
    const h = NO_GAME_DATES.find((d) => d.date === iso);
    return h ? (lang === 'pt' ? h.pt : h.en) : null;
  };
  const offReason = (iso: string) => holidayName(iso) ?? cancelReasons.get(iso) ?? '';

  const fmtLong = (iso: string | null) =>
    iso
      ? new Date(iso + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' })
      : t('home.seasonOver');
  const fmtShort = (s: string) => {
    const d = new Date(s + 'T12:00:00');
    return isNaN(d.getTime()) ? s : d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  };
  const fmtFull = (s: string) => {
    const d = new Date(s + 'T12:00:00');
    return isNaN(d.getTime()) ? s : d.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // Home only lists this season's games; older sessions live on the Stats page.
  const seasonSessions = ((sessionsQ.data ?? []) as any[]).filter(
    (s) => s.date >= SEASON_START && s.date <= SEASON_END
  );
  const nextLabel = fmtLong(nextIso);
  const active = activeQ.data;

  // Banner state for the coming Monday. "Off" = an in-season Monday that's a
  // holiday or a cancellation. Otherwise the game is on: worded as "this Monday"
  // when the next racha IS the coming Monday, else it points ahead (e.g. before
  // the opener, or the week of a skip).
  const upcomingMon = upcomingMondayISO();
  const upcomingInSeason = upcomingMon >= SEASON_START && upcomingMon <= SEASON_END;
  const upcomingOff = upcomingInSeason && (isNoGameDate(upcomingMon) || cancelledSet.has(upcomingMon));
  const nextIsThisMonday = !!nextIso && nextIso === upcomingMon;

  return (
    <div className="p-4 pt-1 pb-28 space-y-5">
      {/* Next racha / resume-active card */}
      <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-4 space-y-3">
        <div className="tile-label text-accent">
          {active ? t('home.activeSession') : t('home.nextRacha')}
        </div>
        <div className="text-2xl font-bold capitalize">
          {active ? fmtShort(active.date) : nextLabel}
        </div>
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

      {/* Weekly status banner */}
      {!active && nextIso && upcomingOff ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 text-red-300 p-3 flex items-start gap-2.5">
          <span className="text-lg leading-none">✕</span>
          <div className="text-sm">
            <div className="font-semibold">{t('home.noGameMonday')}</div>
            <div className="opacity-90">
              {offReason(upcomingMon)} · {t('home.nextRachaShort', { date: nextLabel })}
            </div>
          </div>
        </div>
      ) : null}
      {!active && nextIso && !upcomingOff ? (
        <div className="rounded-2xl border border-accent/40 bg-accent/10 text-accent p-3 flex items-center gap-2.5">
          <span className="text-lg leading-none">✓</span>
          <div className="text-sm font-semibold">
            {nextIsThisMonday ? t('home.gameOnMonday') : t('home.nextRachaShort', { date: nextLabel })}
          </div>
        </div>
      ) : null}

      {/* Month calendar + admin cancel */}
      <GameCalendar
        locale={locale}
        startIso={nextIso}
        cancelledSet={cancelledSet}
        offReason={offReason}
        isAdmin={isAdmin}
      />

      {seasonSessions.length > 0 ? (
        <section>
          <div className="section-head flex items-center justify-between">
            <h2 className="font-semibold">{t('home.thisSeason')}</h2>
            <button className="text-xs text-muted hover:text-fg" onClick={() => setLocation('/recap')}>
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
                    <div className="font-medium truncate capitalize">{fmtFull(s.date)}</div>
                    <div className="text-xs text-muted">
                      {t(`status.${s.status as 'draft' | 'live' | 'done'}`)}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      done ? 'text-accent border-accent/40 bg-accent/10' : 'text-muted border-border'
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
