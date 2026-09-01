import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, getAdminToken, setAdminToken, type AuthUser } from './api.js';

interface AuthContext {
  authRequired: boolean;
  signedIn: boolean;
  user: AuthUser | null;
  // Log in with a player name + password (returns true on success).
  login: (name: string, password: string) => Promise<boolean>;
  // Break-glass: authenticate by pasting the master token directly.
  loginMaster: (token: string) => Promise<boolean>;
  signOut: () => void;
}

const Ctx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authRequired, setAuthRequired] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .authCheck()
      .then((r) => {
        if (cancelled) return;
        setAuthRequired(r.required);
        setUser(r.user);
        if (r.required && !r.ok && getAdminToken()) {
          setAdminToken(null); // stale token
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthRequired(false);
          setUser(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (name: string, password: string) => {
    try {
      const r = await api.auth.login(name, password);
      setAdminToken(r.token);
      setUser(r.user);
      setAuthRequired(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const loginMaster = useCallback(async (token: string) => {
    setAdminToken(token);
    try {
      const r = await api.authCheck();
      if (r.required && !r.ok) {
        setAdminToken(null);
        setUser(null);
        return false;
      }
      setAuthRequired(r.required);
      setUser(r.user);
      return true;
    } catch {
      setAdminToken(null);
      setUser(null);
      return false;
    }
  }, []);

  const signOut = useCallback(() => {
    // Best-effort server-side revocation; the local token is cleared regardless.
    api.auth.logout().catch(() => {});
    setAdminToken(null);
    setUser(null);
  }, []);

  const signedIn = !authRequired || !!user;

  return (
    <Ctx.Provider value={{ authRequired, signedIn, user, login, loginMaster, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

// True when the user is allowed to perform admin-only actions (gated UI).
export function useCanEdit(): boolean {
  const { authRequired, user } = useAuth();
  return !authRequired || !!user;
}
