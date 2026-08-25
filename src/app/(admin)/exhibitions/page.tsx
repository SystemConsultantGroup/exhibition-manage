"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import type { Exhibition } from "@/lib/types";
import { apiFetch, apiJson } from "@/lib/api";
import { useExhibition } from "@/components/ExhibitionProvider";
import { PageHeader, EmptyState } from "@/components/PageHeader";

export default function ExhibitionsPage() {
  const { exhibitions: managed } = useExhibition();
  const [items, setItems] = useState<Exhibition[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await apiJson<{ items: Exhibition[]; total: number }>(
        `/admin/exhibitions${q ? `?q=${encodeURIComponent(q)}` : ""}`
      );
      setItems(data.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [q]);

  const remove = async (ex: Exhibition) => {
    if (!confirm(`${ex.name} 전시를 삭제하시겠습니까?\n복구할 수 없습니다.`)) return;
    await apiFetch(`/admin/exhibitions/${ex.id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <PageHeader
        title="전시 관리"
        description="관리할 전시를 생성하고 설정하세요"
        action={
          <Link href="/exhibitions/new" className="btn-primary">
            <Plus size={15} /> 새 전시
          </Link>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>
      )}

      <div className="relative mb-4 max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="전시명 검색…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState message="전시가 없습니다." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((ex) => {
            const isManaged = managed.some((m) => m.id === ex.id);
            return (
              <div key={ex.id} className="card group transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-slate-800">{ex.name}</h3>
                  {isManaged && <span className="badge bg-indigo-50 text-indigo-600">내 전시</span>}
                </div>
                <p className="mt-1 truncate text-sm text-slate-500">{ex.description || "설명 없음"}</p>
                <div className="mt-3 space-y-1 text-xs text-slate-400">
                  <p>slug · {ex.slug}</p>
                  <p>domain · {ex.defaultDomain ?? "-"}</p>
                </div>
                {isManaged && (
                  <div className="mt-4 flex gap-2 opacity-70 transition group-hover:opacity-100">
                    <Link href={`/exhibitions/${ex.id}`} className="btn-secondary flex-1 !py-1.5 !text-xs">
                      <Pencil size={13} /> 수정
                    </Link>
                    <button onClick={() => remove(ex)} className="btn-danger !px-2.5 !py-1.5" aria-label="삭제">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

