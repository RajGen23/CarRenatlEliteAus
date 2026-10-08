import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api, SESSION_KEY } from "@/src/api";
import { storage } from "@/src/utils/storage";
import type { User } from "@/src/types";

type AuthResponse = { session_token: string; user: User };

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (args: { username: string; password: string; name?: string; email?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
      await storage.secureRemove(SESSION_KEY);
    }
  }, []);

  // Bootstrap: restore session
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = await storage.secureGet<string>(SESSION_KEY, "");
        if (token) {
          try {
            const me = await api.get<User>("/auth/me");
            if (mounted) setUser(me);
          } catch {
            await storage.secureRemove(SESSION_KEY);
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const res = await api.post<AuthResponse>("/auth/login", {
      identifier: identifier.trim(),
      password,
    });
    await storage.secureSet(SESSION_KEY, res.session_token);
    setUser(res.user);
  }, []);

  const signUp = useCallback(
    async (args: { username: string; password: string; name?: string; email?: string }) => {
      const res = await api.post<AuthResponse>("/auth/register", {
        username: args.username.trim(),
        password: args.password,
        name: args.name?.trim() || undefined,
        email: args.email?.trim() || undefined,
      });
      await storage.secureSet(SESSION_KEY, res.session_token);
      setUser(res.user);
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    await storage.secureRemove(SESSION_KEY);
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, signIn, signUp, logout, refresh }}>{children}</Ctx.Provider>
  );
}
