import { Route, Switch, Link, useLocation } from 'wouter';
import { Home } from './screens/Home.js';
import { PlayerDB } from './screens/PlayerDB.js';
import { Session } from './screens/Session.js';
import { Match } from './screens/Match.js';
import { Recap } from './screens/Recap.js';

export function App() {
  const [location] = useLocation();
  const hideNav = location.startsWith('/matches/');
  const tabs: Array<[string, string]> = [
    ['/', 'Home'],
    ['/players', 'Players'],
    ['/recap', 'Recap'],
  ];

  return (
    <div className={`min-h-full ${hideNav ? '' : 'pb-20'}`}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/players" component={PlayerDB} />
        <Route path="/sessions/:id" component={Session} />
        <Route path="/matches/:id" component={Match} />
        <Route path="/recap" component={Recap} />
        <Route>{() => <div className="p-4">Not found.</div>}</Route>
      </Switch>

      {hideNav ? null : (
        <nav className="fixed bottom-0 inset-x-0 bg-bg2 border-t border-border flex items-stretch z-30 safe-bottom">
          {tabs.map(([path, label]) => {
            const active =
              path === '/'
                ? location === '/' || location.startsWith('/sessions') || location.startsWith('/matches')
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
