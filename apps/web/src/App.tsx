import { Route, Switch, Link, useLocation } from 'wouter';
import { useState } from 'react';
import { Home } from './screens/Home.js';
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

function AppShell() {
  const [location] = useLocation();
  const t = useT();
  const hideNav = location.startsWith('/matches/') || location.startsWith('/e/');
  const tabs: Array<[string, string]> = [
    ['/', t('nav.home')],
    ['/players', t('nav.players')],
    ['/recap', t('nav.recap')],
    ['/rules', t('nav.rules')],
  ];

  return (
    <div className={`min-h-full ${hideNav ? '' : 'pb-20'}`}>
      {hideNav ? null : (
        <div className="fixed top-2 right-2 z-40 flex items-center gap-2">
          <SignInButton />
          <LanguageToggle />
        </div>
      )}
      <Switch>
        <Route path="/" component={Home} />
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
        <nav className="fixed bottom-0 inset-x-0 bg-bg2 border-t border-border flex items-stretch z-30 safe-bottom">
          {tabs.map(([path, label]) => {
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
                className={`flex-1 text-center py-3 text-sm ${
                  active ? 'text-accent font-semibold' : 'text-muted'
                }`}
              >
                {label}
              </Link>
            );
          })}
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
