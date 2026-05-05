import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, getAdminToken, setAdminToken } from './api.js';

interface AuthContext {
  authRequired: boolean;
  signedIn: boolean;
  signIn: (token: string) => Promise<boolean>;
  signOut: () => void;
}

const Ctx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authRequired, setAuthRequired] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .authCheck()
      .then((r) => {
        if (cancelled) return;
        setAuthRequired(r.required);
        setSignedIn(r.required ? !!r.ok : true);
        if (r.required && !r.ok && getAdminToken()) {
          // Stale token — clear it.
          setAdminToken(null);
        }
      })
      .catch(() => {
        // If the check fails, assume auth is not required so the UI doesn't lock up.
        if (!cancelled) {
          setAuthRequired(false);
          setSignedIn(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (token: string) => {
    setAdminToken(token);
    try {
      const r = await api.authCheck();
      if (r.required && !r.ok) {
        setAdminToken(null);
        setSignedIn(false);
        return false;
      }
      setAuthRequired(r.required);
      setSignedIn(true);
      return true;
    } catch {
      setAdminToken(null);
      setSignedIn(false);
      return false;
    }
  }, []);

  const signOut = useCallback(() => {
    setAdminToken(null);
    setSignedIn(!authRequired);
  }, [authRequired]);

  return (
    <Ctx.Provider value={{ authRequired, signedIn, signIn, signOut }}>
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
  const { authRequired, signedIn } = useAuth();
  return !authRequired || signedIn;
}
