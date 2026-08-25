"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Me } from "@/lib/types";
import { clearTokens, ensureAccessToken } from "@/lib/auth";

interface AuthState {
  me: Me | null;
  loading: boolean;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  me: null,
  loading: true,
  logout: () => {},
  refreshMe: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    const token = await ensureAccessToken();
    if (!token) {
      setMe(null);
      return;
    }
    try {
      const r = await fetch("/api/backend/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setMe(await r.json());
      else if (r.status === 401) {
        clearTokens();
        setMe(null);
      }
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    refreshMe().finally(() => setLoading(false));
  }, [refreshMe]);

  const logout = () => {
    clearTokens();
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ me, loading, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
