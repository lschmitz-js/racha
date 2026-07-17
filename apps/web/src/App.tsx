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
import { I18nProvider, LanguageToggle, useT } from './lib/i18n.js';
import { AuthProvider, useAuth } from './lib/auth.js';

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
  const hideNav = location.startsWith('/matches/');
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
  const { authRequired, signedIn, signIn, signOut } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!authRequired) return null;

  const label = signedIn ? '🔓' : '🔒';
  const aria = signedIn ? t('auth.signOut') : t('auth.signIn');

  return (
    <>
      <button
        type="button"
        aria-label={aria}
        title={aria}
        onClick={() => {
          if (signedIn) {
            signOut();
          } else {
            setError(null);
            setPwd('');
            setOpen(true);
          }
        }}
        className="text-xs px-2 py-1 rounded-md border border-border bg-bg2 hover:border-accent"
      >
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-bg2 border border-border rounded-xl p-4 w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-3">{t('auth.adminMode')}</h2>
            <input
              type="password"
              autoFocus
              className="w-full bg-bg3 border border-border rounded-lg px-3 py-2 mb-2"
              placeholder={t('auth.passwordPlaceholder')}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setBusy(true);
                  const ok = await signIn(pwd);
                  setBusy(false);
                  if (ok) setOpen(false);
                  else setError(t('auth.wrongPassword'));
                }
              }}
            />
            {error ? <div className="text-xs text-red-400 mb-2">{error}</div> : null}
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={() => setOpen(false)} disabled={busy}>
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary flex-1"
                disabled={busy || !pwd}
                onClick={async () => {
                  setBusy(true);
                  const ok = await signIn(pwd);
                  setBusy(false);
                  if (ok) setOpen(false);
                  else setError(t('auth.wrongPassword'));
                }}
              >
                {t('auth.signIn')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
