import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  api,
  getAdminToken,
  setAdminToken,
  getSessionCode,
  setSessionCode,
  OPERATOR_USER_ID,
  type AuthUser,
} from './api.js';

interface AuthContext {
  authRequired: boolean;
  signedIn: boolean;
  user: AuthUser | null;
  // Log in with a player name + password (returns true on success).
  login: (name: string, password: string) => Promise<boolean>;
  // Break-glass: authenticate by pasting the master token directly.
  loginMaster: (token: string) => Promise<boolean>;
  // Enter the day's 4-digit session code to help run the live game.
  enterCode: (code: string) => Promise<boolean>;
  clearCode: () => void;
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
        if (r.required && !r.ok) {
          if (getAdminToken()) setAdminToken(null); // stale token
          if (getSessionCode()) setSessionCode(null); // code's session ended
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

  const enterCode = useCallback(async (code: string) => {
    setSessionCode(code);
    try {
      const r = await api.authCheck();
      if (r.user) {
        setUser(r.user);
        setAuthRequired(r.required);
        return true;
      }
      setSessionCode(null);
      return false;
    } catch {
      setSessionCode(null);
      return false;
    }
  }, []);

  const clearCode = useCallback(() => {
    setSessionCode(null);
    setUser((u) => (u && u.id === OPERATOR_USER_ID ? null : u));
  }, []);

  const signOut = useCallback(() => {
    // Best-effort server-side revocation; the local token is cleared regardless.
    api.auth.logout().catch(() => {});
    setAdminToken(null);
    setUser(null);
  }, []);

  const signedIn = !authRequired || !!user;

  return (
    <Ctx.Provider value={{ authRequired, signedIn, user, login, loginMaster, enterCode, clearCode, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

// True when the caller may RUN a live game — an admin, or someone who entered
// the day's session code (operator). Operational controls gate on this.
export function useCanEdit(): boolean {
  const { authRequired, user } = useAuth();
  return !authRequired || !!user;
}

// True only for a real admin (not the operator code). Admin-only controls —
// opening/closing sessions, deleting, roster/settings, seeing the code, and
// editing finished games — gate on this.
export function useIsAdmin(): boolean {
  const { authRequired, user } = useAuth();
  return !authRequired || (!!user && user.id !== OPERATOR_USER_ID);
}
