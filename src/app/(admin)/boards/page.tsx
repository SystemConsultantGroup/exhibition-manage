"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2, ChevronDown } from "lucide-react";
import type { BoardPost, PagedResponse } from "@/lib/types";
import { apiFetch, apiJson } from "@/lib/api";
import { useExhibition } from "@/components/ExhibitionProvider";
import { PageHeader, EmptyState } from "@/components/PageHeader";

interface BoardForm {
  title: string;
  content: string;
}

const EMPTY: BoardForm = { title: "", content: "" };

export default function BoardsPage() {
  const { selected } = useExhibition();
  const [items, setItems] = useState<BoardPost[]>([]);
  const [form, setForm] = useState<BoardForm>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!selected) return;
    try {
      const tenantDomain = selected.defaultDomain ?? selected.customDomain;
      if (!tenantDomain) return;
      const d = await apiJson<PagedResponse<BoardPost>>("/boards", { tenantDomain });
      setItems(d.items);
    } catch {}
  }, [selected]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const res = editingId
        ? await apiFetch(`/admin/boards/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
            exhibitionId: selected.id,
          })
        : await apiFetch("/admin/boards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
            exhibitionId: selected.id,
          });
      if (!res.ok) { alert("저장 실패"); return; }
      setForm(EMPTY);
      setEditingId(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b: BoardPost) => {
    if (!selected || !confirm(`${b.title} 게시글을 삭제하시겠습니까?`)) return;
    await apiFetch(`/admin/boards/${b.id}`, { method: "DELETE", exhibitionId: selected.id });
    load();
  };

  if (!selected) return <p className="text-slate-500">전시를 먼저 선택하세요.</p>;

  return (
    <div className="max-w-3xl">
      <PageHeader title="게시글" description="전시 공지사항을 작성하고 관리합니다" />

      {/* 작성 폼 */}
      <form onSubmit={submit} className="card mb-6 border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white">
        <div className="space-y-3">
          <div>
            <label className="label">제목 * (최대 200자)</label>
            <input required maxLength={200} placeholder="제목을 입력하세요" className="input" value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="label">내용 * (최대 16,000자)</label>
            <textarea required maxLength={16000} rows={6} placeholder="내용을 입력하세요" className="input resize-y" value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {editingId ? "수정 완료" : "작성하기"}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }} className="btn-secondary">
                취소
              </button>
            )}
          </div>
        </div>
      </form>

      {/* 목록 */}
      {items.length === 0 ? (
        <EmptyState message="게시글이 없습니다." />
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          {items.map((b) => (
            <div key={b.id} className="px-5 py-4 transition hover:bg-slate-50/60">
              <div className="flex items-center gap-3">
                <button
                  className="flex flex-1 items-center gap-2 text-left"
                  onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                >
                  <ChevronDown size={15}
                    className={`shrink-0 text-slate-400 transition-transform ${expandedId === b.id ? "rotate-180" : ""}`} />
                  <span className="font-semibold text-slate-700 hover:text-indigo-600">{b.title}</span>
                  {b.attachmentMedias?.length > 0 && (
                    <span className="badge bg-sky-50 text-sky-600">첨부 {b.attachmentMedias.length}</span>
                  )}
                </button>
                <span className="hidden shrink-0 text-xs text-slate-400 sm:block">
                  {new Date(b.updatedAt).toLocaleDateString("ko-KR")}
                </span>
                <button onClick={() => {
                  setEditingId(b.id);
                  setForm({ title: b.title, content: b.content });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }} className="btn-ghost !p-1.5 opacity-0 transition group-hover:opacity-100 hover:!opacity-100 sm:opacity-60" aria-label="수정">
                  <Pencil size={14} />
                </button>
                <button onClick={() => remove(b)} className="btn-ghost !p-1.5 text-rose-500 opacity-0 transition group-hover:opacity-100 hover:!opacity-100 sm:opacity-60" aria-label="삭제">
                  <Trash2 size={14} />
                </button>
              </div>
              {expandedId === b.id && (
                <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
                  {b.content}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
