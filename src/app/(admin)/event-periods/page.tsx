"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { EventPeriod, PagedResponse } from "@/lib/types";
import { apiFetch, apiJson } from "@/lib/api";
import { useExhibition } from "@/components/ExhibitionProvider";
import { PageHeader, EmptyState } from "@/components/PageHeader";

interface PeriodForm {
  name: string;
  startTime: string;
  endTime: string;
}

const EMPTY: PeriodForm = { name: "", startTime: "", endTime: "" };

export default function EventPeriodsPage() {
  const { selected } = useExhibition();
  const [items, setItems] = useState<EventPeriod[]>([]);
  const [form, setForm] = useState<PeriodForm>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!selected) return;
    try {
      const tenantDomain = selected.defaultDomain ?? selected.customDomain;
      if (!tenantDomain) return;
      const d = await apiJson<PagedResponse<EventPeriod>>("/event-periods", { tenantDomain });
      setItems(d.items);
    } catch {}
  }, [selected]);

  useEffect(() => { load(); }, [load]);

  const toLocalInput = (iso: string) => iso.slice(0, 16);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const body = JSON.stringify({
        name: form.name,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
      });
      const res = editingId
        ? await apiFetch(`/admin/event-periods/${editingId}`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body,
            exhibitionId: selected.id })
        : await apiFetch("/admin/event-periods", {
            method: "POST", headers: { "Content-Type": "application/json" }, body,
            exhibitionId: selected.id });
      if (!res.ok) { alert("저장 실패"); return; }
      setForm(EMPTY);
      setEditingId(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: EventPeriod) => {
    if (!selected || !confirm(`${p.name}을 삭제하시겠습니까?`)) return;
    await apiFetch(`/admin/event-periods/${p.id}`, { method: "DELETE", exhibitionId: selected.id });
    load();
  };

  if (!selected) return <p className="text-slate-500">전시를 먼저 선택하세요.</p>;

  return (
    <div className="max-w-3xl">
      <PageHeader title="발표회차" description="전시의 발표 기간을 관리합니다" />

      {/* 폼 카드 */}
      <form onSubmit={submit} className="card mb-6 border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_1fr_1fr_auto]">
          <div>
            <label className="label">회차명 *</label>
            <input required maxLength={50} placeholder="예: 2026-1학기" className="input" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">시작 *</label>
            <input required type="datetime-local" className="input" value={form.startTime}
              onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
          </div>
          <div>
            <label className="label">종료 *</label>
            <input required type="datetime-local" className="input" value={form.endTime}
              onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
          </div>
          <div className="flex items-end">
            {editingId ? (
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary">
                  <Pencil size={14} /> 수정
                </button>
                <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }} className="btn-secondary">
                  취소
                </button>
              </div>
            ) : (
              <button type="submit" disabled={saving} className="btn-primary w-full md:w-auto">
                <Plus size={15} /> 추가
              </button>
            )}
          </div>
        </div>
      </form>

      {/* 목록 */}
      {items.length === 0 ? (
        <EmptyState message="발표회차가 없습니다." />
      ) : (
        <div className="space-y-2.5">
          {items.map((p) => (
            <div key={p.id}
              className="card flex flex-wrap items-center justify-between gap-3 !py-4 transition hover:border-indigo-200">
              <div>
                <span className="badge mr-2 bg-indigo-50 text-indigo-600">{p.name}</span>
                <span className="text-sm text-slate-500">
                  {new Date(p.startTime).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}
                  {" → "}
                  {new Date(p.endTime).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <div className="flex gap-1.5 opacity-60 transition hover:opacity-100">
                <button onClick={() => {
                  setEditingId(p.id);
                  setForm({ name: p.name, startTime: toLocalInput(p.startTime), endTime: toLocalInput(p.endTime) });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }} className="btn-secondary !py-1.5 !text-xs"><Pencil size={13} /> 수정</button>
                <button onClick={() => remove(p)} className="btn-danger !px-2.5 !py-1.5" aria-label="삭제">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
