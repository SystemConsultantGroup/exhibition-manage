"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Exhibition } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import { useAuth } from "./AuthProvider";

interface ExhibitionState {
  exhibitions: Exhibition[];
  selected: Exhibition | null;
  select: (id: string) => void;
  loading: boolean;
}

const ExhibitionContext = createContext<ExhibitionState>({
  exhibitions: [],
  selected: null,
  select: () => {},
  loading: true,
});

const STORAGE_KEY = "admin.selectedExhibitionId";

export function ExhibitionProvider({ children }: { children: React.ReactNode }) {
  const { me, loading: authLoading } = useAuth();
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch("/admin/exhibitions");
      if (!response.ok) throw new Error(`전시 목록 조회 실패 (${response.status})`);
      const data = (await response.json()) as { items?: Exhibition[] };
      const items = Array.isArray(data.items) ? data.items : [];
      setExhibitions(items);
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && items.some((exhibition) => exhibition.id === stored)) {
        setSelectedId(stored);
      } else {
        setSelectedId(items[0]?.id ?? null);
      }
    } catch {
      setExhibitions([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!me) {
      setExhibitions([]);
      setSelectedId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void load();
  }, [authLoading, me, load]);

  const select = (id: string) => {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const value = useMemo(
    () => ({
      exhibitions,
      selected: exhibitions.find((e) => e.id === selectedId) ?? null,
      select,
      loading,
    }),
    [exhibitions, selectedId, loading]
  );

  return <ExhibitionContext.Provider value={value}>{children}</ExhibitionContext.Provider>;
}

export function useExhibition() {
  return useContext(ExhibitionContext);
}
