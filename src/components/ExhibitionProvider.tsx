"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Exhibition } from "@/lib/types";

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
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const r = await fetch("/api/backend/admin/exhibitions", {
        headers: { Authorization: `Bearer ${localStorage.getItem("admin.accessToken")}` },
      });
      if (!r.ok) return;
      const data = await r.json();
      setExhibitions(data.items || []);
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && data.items.some((e: Exhibition) => e.id === stored)) {
        setSelectedId(stored);
      } else if (data.items.length > 0) {
        setSelectedId(data.items[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

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
