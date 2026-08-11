import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, type RegisterInput } from '../services/api/auth.service';
import { ApiRequestError } from '../services/api/client';
import { secureSession } from '../services/session/secureSession';
import { pushStorage } from '../services/session/pushStorage';
import { notificationsApi } from '../services/api/notifications.service';
import type { User } from '../types/domain';

type SessionStatus = 'bootstrapping' | 'anonymous' | 'authenticated';

interface SessionContextValue {
  status: SessionStatus;
  user: User | null;
  isBusy: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: RegisterInput): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<string>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('bootstrapping');
  const [user, setUser] = useState<User | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await secureSession.read();
      if (!stored) {
        if (active) setStatus('anonymous');
        return;
      }
      try {
        const current = await authApi.me();
        if (!active) return;
        setUser(current);
        setStatus('authenticated');
      } catch (error) {
        // Una caída de red no equivale a cerrar sesión. Solo eliminamos los tokens
        // cuando el servidor confirma que ya no sirven.
        if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
          await secureSession.clear();
        }
        if (!active) return;
        setUser(null);
        setStatus('anonymous');
      }
    })();
    return () => { active = false; };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsBusy(true);
    try {
      const result = await authApi.login(email.trim().toLowerCase(), password);
      await secureSession.write(result);
      setUser(result.user);
      setStatus('authenticated');
    } finally {
      setIsBusy(false);
    }
  }, []);

  const signUp = useCallback(async (input: RegisterInput) => {
    setIsBusy(true);
    try {
      const result = await authApi.register({ ...input, email: input.email.trim().toLowerCase() });
      await secureSession.write(result);
      setUser(result.user);
      setStatus('authenticated');
    } finally {
      setIsBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setIsBusy(true);
    try {
      const pushToken = await pushStorage.read();
      if (pushToken) await notificationsApi.unregister(pushToken).catch(() => null);
      await authApi.logout().catch(() => null);
    } finally {
      await secureSession.clear();
      setUser(null);
      setStatus('anonymous');
      setIsBusy(false);
    }
  }, []);

  const requestPasswordReset = useCallback((email: string) => authApi.forgotPassword(email), []);

  const value = useMemo<SessionContextValue>(() => ({
    status, user, isBusy, signIn, signUp, signOut, requestPasswordReset,
  }), [isBusy, requestPasswordReset, signIn, signOut, signUp, status, user]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession debe usarse dentro de SessionProvider');
  return context;
}
