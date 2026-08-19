import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../api/client';
import type { User } from '../api/types';

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  login: (identifier: string, password: string) => Promise<User>;
  loginWithSms: (phone: string, code: string) => Promise<User>;
  loginWithGoogle: (idToken: string) => Promise<User>;
  register: (payload: { name: string; birthDate: string; contact: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  updateUser: (patch: Record<string, unknown>) => Promise<User>;
  completeVibeSetup: (patch: Record<string, unknown>) => Promise<User>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) {
        if (!cancelled) setInitializing(false);
        return;
      }
      try {
        const { user: me } = await api.me();
        if (!cancelled) setUser(me);
      } catch {
        await setToken(null);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const { token, user: loggedInUser } = await api.login({ identifier, password });
    await setToken(token);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const loginWithSms = useCallback(async (phone: string, code: string) => {
    const { token, user: loggedInUser } = await api.verifySmsCode(phone, code);
    await setToken(token);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const { token, user: loggedInUser } = await api.googleLogin(idToken);
    await setToken(token);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const register = useCallback(
    async (payload: { name: string; birthDate: string; contact: string; password: string }) => {
      const { token, user: newUser } = await api.register(payload);
      await setToken(token);
      setUser(newUser);
      return newUser;
    },
    []
  );

  const logout = useCallback(async () => {
    await setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { user: me } = await api.me();
      setUser(me);
      return me;
    } catch {
      return null;
    }
  }, []);

  const updateUser = useCallback(async (patch: Record<string, unknown>) => {
    const { user: updated } = await api.updateMe(patch);
    setUser(updated);
    return updated;
  }, []);

  const completeVibeSetup = useCallback(async (patch: Record<string, unknown>) => {
    const { user: updated } = await api.vibeSetup(patch);
    setUser(updated);
    return updated;
  }, []);

  const value = useMemo(
    () => ({
      user,
      initializing,
      login,
      loginWithSms,
      loginWithGoogle,
      register,
      logout,
      refreshUser,
      updateUser,
      completeVibeSetup,
    }),
    [
      user,
      initializing,
      login,
      loginWithSms,
      loginWithGoogle,
      register,
      logout,
      refreshUser,
      updateUser,
      completeVibeSetup,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
