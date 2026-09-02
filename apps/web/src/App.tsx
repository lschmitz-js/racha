import { Route, Switch, Link, useLocation } from 'wouter';
import { useState } from 'react';
import { Home } from './screens/Home.js';
import { CheckIn } from './screens/CheckIn.js';
import { WhoIsHere } from './screens/WhoIsHere.js';
import { PlayerDB } from './screens/PlayerDB.js';
import { Session } from './screens/Session.js';
import { Match } from './screens/Match.js';
import { MatchEvents } from './screens/MatchEvents.js';
import { Recap } from './screens/Recap.js';
import { Rules } from './screens/Rules.js';
import { EmergencyForm } from './screens/EmergencyForm.js';
import { History } from './screens/History.js';
import { I18nProvider, LanguageToggle, useT } from './lib/i18n.js';
import { AuthProvider, useAuth } from './lib/auth.js';
import { SignInModal } from './components/SignInModal.js';

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </I18nProvider>
  );
}

type TabKey = 'home' | 'checkin' | 'players' | 'stats' | 'rules';

function TabIcon({ name }: { name: TabKey }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      );
    case 'checkin':
      return (
        <svg {...common}>
          <path d="M9 5h6a1 1 0 0 1 1 1v0H8v0a1 1 0 0 1 1-1Z" />
          <path d="M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2" />
          <path d="m9 14 2 2 4-4" />
        </svg>
      );
    case 'players':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
          <path d="M16 5.5a3 3 0 0 1 0 5.8M21 20a5.3 5.3 0 0 0-4-5" />
        </svg>
      );
    case 'stats':
      return (
        <svg {...common}>
          <path d="M5 21V10M12 21V4M19 21v-7" />
        </svg>
      );
    case 'rules':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        </svg>
      );
  }
}

function AppShell() {
  const [location] = useLocation();
  const t = useT();
  const hideNav = location.startsWith('/matches/') || location.startsWith('/e/');
  const tabs: Array<{ path: string; label: string; icon: TabKey }> = [
    { path: '/', label: t('nav.home'), icon: 'home' },
    { path: '/checkin', label: t('nav.checkin'), icon: 'checkin' },
    { path: '/players', label: t('nav.players'), icon: 'players' },
    { path: '/recap', label: t('nav.recap'), icon: 'stats' },
    { path: '/rules', label: t('nav.rules'), icon: 'rules' },
  ];

  return (
    <div className={`min-h-full ${hideNav ? '' : 'pb-24'}`}>
      {hideNav ? null : (
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
          <Link href="/" className="font-bold text-lg tracking-tight truncate">
            {t('home.title')}
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <SignInButton />
            <LanguageToggle />
          </div>
        </div>
      )}
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/checkin" component={CheckIn} />
        <Route path="/start" component={WhoIsHere} />
        <Route path="/players" component={PlayerDB} />
        <Route path="/sessions/:id" component={Session} />
        <Route path="/matches/:id/events" component={MatchEvents} />
        <Route path="/matches/:id" component={Match} />
        <Route path="/recap" component={Recap} />
        <Route path="/rules" component={Rules} />
        <Route path="/history" component={History} />
        <Route path="/e/:token" component={EmergencyForm} />
        <Route>{() => <div className="p-4">{t('common.notFound')}</div>}</Route>
      </Switch>

      {hideNav ? null : (
        <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-md flex items-stretch justify-around rounded-2xl border border-border bg-bg2/95 backdrop-blur px-1.5 py-1.5 shadow-lg shadow-black/30">
            {tabs.map(({ path, label, icon }) => {
              const active =
                path === '/'
                  ? location === '/' ||
                    location.startsWith('/start') ||
                    location.startsWith('/sessions') ||
                    location.startsWith('/matches')
                  : location === path;
              return (
                <Link
                  key={path}
                  href={path}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[11px] transition ${
                    active ? 'text-accent' : 'text-muted hover:text-fg'
                  }`}
                >
                  <TabIcon name={icon} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

function SignInButton() {
  const { authRequired, signedIn, user, signOut } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);

  if (!authRequired) return null;

  if (signedIn) {
    return (
      <button
        type="button"
        title={t('auth.signOut')}
        onClick={signOut}
        className="text-xs px-2 py-1 rounded-md border border-border bg-bg2 hover:border-accent flex items-center gap-1"
      >
        <span>🔓</span>
        {user ? <span className="max-w-[7rem] truncate">{user.name}</span> : null}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={t('auth.signIn')}
        title={t('auth.signIn')}
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 rounded-md border border-border bg-bg2 hover:border-accent"
      >
        🔒
      </button>
      {open ? <SignInModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
