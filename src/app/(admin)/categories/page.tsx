"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronUp, ChevronDown, Pencil, Check, X, FolderTree } from "lucide-react";
import type { Category, PagedResponse } from "@/lib/types";
import { apiJson } from "@/lib/api";
import { useExhibition } from "@/components/ExhibitionProvider";
import { PageHeader, EmptyState } from "@/components/PageHeader";

export default function CategoriesPage() {
  const { selected } = useExhibition();
  const [items, setItems] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    if (!selected) return;
    try {
      const tenantDomain = selected.defaultDomain ?? selected.customDomain;
      if (!tenantDomain) return;
      const d = await apiJson<PagedResponse<Category>>("/categories", { tenantDomain });
      setItems(d.items);
    } catch {}
  }, [selected]);

  useEffect(() => { load(); }, [load]);

  const reorder = async (reordered: Category[]) => {
    if (!selected) return;
    setItems(reordered);
    setSaving(true);
    try {
      await apiJson("/admin/categories/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryIds: reordered.map((c) => c.id) }),
        exhibitionId: selected.id,
      });
    } catch (error) {
      alert((error as Error).message);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const rename = async (c: Category) => {
    if (!selected || !editName.trim()) return;
    setSaving(true);
    try {
      await apiJson(`/admin/categories/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName }),
        exhibitionId: selected.id,
      });
      setEditingId(null);
      await load();
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!selected) return <p className="text-slate-500">전시를 먼저 선택하세요.</p>;

  return (
    <div className="max-w-2xl">
      <PageHeader title="카테고리" description="생성, 이름·순서 변경 및 비어 있는 카테고리 삭제" />
      <form className="flex gap-2 mb-4" onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          await apiJson("/admin/categories", { method: "POST", exhibitionId: selected.id,
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }) });
          setNewName("");
          await load();
        } catch (error) { alert((error as Error).message); }
        finally { setSaving(false); }
      }}>
        <input required maxLength={128} className="input" aria-label="새 카테고리 이름" value={newName}
          onChange={(event) => setNewName(event.target.value)} />
        <button disabled={saving || !newName.trim()} className="btn-primary whitespace-nowrap">추가</button>
      </form>

      {!saving && items.length === 0 ? (
        <EmptyState message="카테고리가 없습니다." />
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          {items.map((c, i) => (
            <div key={c.id} className="group flex items-center gap-2 px-4 py-3 transition hover:bg-slate-50/60">
              <div className="mr-1 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <FolderTree size={15} />
              </div>
              <span className="flex-1 text-sm font-medium text-slate-700">
                {editingId === c.id ? (
                  <input
                    className="input !py-1.5"
                    value={editName} autoFocus maxLength={128}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && rename(c)}
                  />
                ) : c.name}
              </span>
              {editingId === c.id ? (
                <>
                  <button onClick={() => rename(c)} disabled={saving}
                    className="btn-primary !p-2" aria-label="저장"><Check size={14} /></button>
                  <button onClick={() => setEditingId(null)} className="btn-ghost !p-2" aria-label="취소"><X size={14} /></button>
                </>
              ) : (
                <>
                  <button onClick={() => reorder(swap(items, i, -1))} disabled={i === 0 || saving}
                    className="btn-ghost !p-1.5 opacity-0 transition group-hover:opacity-100" aria-label="위로">
                    <ChevronUp size={15} />
                  </button>
                  <button onClick={() => reorder(swap(items, i, 1))} disabled={i === items.length - 1 || saving}
                    className="btn-ghost !p-1.5 opacity-0 transition group-hover:opacity-100" aria-label="아래로">
                    <ChevronDown size={15} />
                  </button>
                  <button onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                    className="btn-ghost !p-1.5 opacity-0 transition group-hover:opacity-100" aria-label="이름 변경">
                    <Pencil size={14} />
                  </button>
                  <button className="btn-ghost !p-1.5" disabled={saving} onClick={async () => {
                    if (!confirm(`'${c.name}' 카테고리를 삭제할까요?`)) return;
                    setSaving(true);
                    try {
                      await apiJson(`/admin/categories/${c.id}`, { method: "DELETE", exhibitionId: selected.id });
                      await load();
                    } catch (error) { alert((error as Error).message); }
                    finally { setSaving(false); }
                  }}>삭제</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function swap<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
  const next = [...arr];
  const target = idx + dir;
  if (target < 0 || target >= arr.length) return arr;
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}
