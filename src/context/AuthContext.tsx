import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../api/client';
import type { User } from '../api/types';

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  login: (identifier: string, password: string) => Promise<User>;
  loginWithGoogle: (idToken: string) => Promise<User>;
  loginWithFacebook: (code: string, redirectUri: string) => Promise<User>;
  loginWithApple: (idToken: string, fullName?: string) => Promise<User>;
  register: (payload: { name: string; birthDate: string; contact: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  updateUser: (patch: Record<string, unknown>) => Promise<User>;
  completeVibeSetup: (patch: Record<string, unknown>) => Promise<User>;
  verifySelfie: (selfieUrl: string) => Promise<User>;
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

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const { token, user: loggedInUser } = await api.googleLogin(idToken);
    await setToken(token);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const loginWithFacebook = useCallback(async (code: string, redirectUri: string) => {
    const { token, user: loggedInUser } = await api.facebookLogin(code, redirectUri);
    await setToken(token);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  // `fullName` is only ever available from the native Apple sign-in sheet on
  // someone's very FIRST authorization (see utils/appleAuth.ts) - undefined
  // on every later sign-in, which is fine since the backend only uses it
  // once too (see routes/auth.js's POST /api/auth/apple).
  const loginWithApple = useCallback(async (idToken: string, fullName?: string) => {
    const { token, user: loggedInUser } = await api.appleLogin(idToken, fullName);
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
    try {
      // Best effort - clear this device's push registration so a shared or
      // reused device doesn't keep notifying whoever just logged out.
      // Must happen before the token is cleared below (needs auth).
      await api.registerPushToken('');
    } catch {
      // Not worth blocking logout over - a stale token just means a future
      // push might not reach this device, not a broken login flow.
    }
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

  const verifySelfie = useCallback(async (selfieUrl: string) => {
    const { user: updated } = await api.verifySelfie(selfieUrl);
    setUser(updated);
    return updated;
  }, []);

  const value = useMemo(
    () => ({
      user,
      initializing,
      login,
      loginWithGoogle,
      loginWithFacebook,
      loginWithApple,
      register,
      logout,
      refreshUser,
      updateUser,
      completeVibeSetup,
      verifySelfie,
    }),
    [
      user,
      initializing,
      login,
      loginWithGoogle,
      loginWithFacebook,
      loginWithApple,
      register,
      logout,
      refreshUser,
      updateUser,
      completeVibeSetup,
      verifySelfie,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
