"use client";

import { useEffect, useRef, useState } from "react";
import type { Category, EventPeriod, Item, PagedResponse } from "@/lib/types";
import { apiJson, apiMultipart } from "@/lib/api";
import { useExhibition } from "./ExhibitionProvider";

export function ItemForm({
  initial,
  onSubmit,
  submitting,
}: {
  initial?: Item | null;
  onSubmit: (data: Record<string, unknown>, files: { name: string; file: File }[]) => Promise<void>;
  submitting: boolean;
}) {
  const { selected } = useExhibition();
  const [categories, setCategories] = useState<Category[]>([]);
  const [periods, setPeriods] = useState<EventPeriod[]>([]);
  const thumbRef = useRef<HTMLInputElement>(null);
  const posterRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    categoryId: initial?.categoryId ?? "",
    eventPeriodId: initial?.eventPeriodId ?? "",
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    participantNames: initial?.participantNames ?? "",
    participantEmails: initial?.participantEmails ?? "",
    advisorNames: initial?.advisorNames ?? "",
    awarded: initial?.awarded ?? false,
  });

  useEffect(() => {
    if (!selected) return;
    const tenantDomain = selected.defaultDomain ?? selected.customDomain;
    if (!tenantDomain) return;
    apiJson<PagedResponse<Category>>("/categories", { tenantDomain })
      .then((d) => setCategories(d.items)).catch(() => {});
    apiJson<PagedResponse<EventPeriod>>("/event-periods", { tenantDomain })
      .then((d) => setPeriods(d.items)).catch(() => {});
  }, [selected]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...form,
      eventPeriodId: form.eventPeriodId || null,
      description: form.description || null,
      participantNames: form.participantNames || null,
      participantEmails: form.participantEmails || null,
      advisorNames: form.advisorNames || null,
      awarded: form.awarded,
    };
    const files: { name: string; file: File }[] = [];
    if (!initial) {
      // 생성 시에만 파일 첨부 가능
      for (const [ref, name] of [
        [thumbRef, "thumbnailFile"],
        [posterRef, "posterFile"],
        [videoRef, "presentationVideoFile"],
      ] as const) {
        const f = ref.current?.files?.[0];
        if (f) files.push({ name, file: f });
      }
    }
    await onSubmit(data, files);
  };

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4">
      <div>
        <label className="label">제목 * (최대 200자)</label>
        <input required maxLength={200} className="input" value={form.title} onChange={set("title")} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">카테고리 *</label>
          <select required className="input" value={form.categoryId} onChange={set("categoryId")}>
            <option value="">선택…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">발표회차</label>
          <select className="input" value={form.eventPeriodId} onChange={set("eventPeriodId")}>
            <option value="">없음</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">설명</label>
        <textarea className="input" rows={4} value={form.description} onChange={set("description")} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">참여자 이름 (쉼표 구분)</label>
          <input className="input" value={form.participantNames} onChange={set("participantNames")} />
        </div>
        <div>
          <label className="label">참여자 이메일 (쉼표 구분)</label>
          <input className="input" value={form.participantEmails} onChange={set("participantEmails")} />
        </div>
        <div>
          <label className="label">지도교수 (쉼표 구분)</label>
          <input className="input" value={form.advisorNames} onChange={set("advisorNames")} />
        </div>
        <div className="flex items-end gap-2 pb-2">
          <input type="checkbox" id="awarded" checked={form.awarded}
            onChange={(e) => setForm((f) => ({ ...f, awarded: e.target.checked }))} />
          <label htmlFor="awarded" className="text-sm font-medium">🏆 수상 작품</label>
        </div>
      </div>

      {!initial && (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">썸네일</label>
            <input ref={thumbRef} type="file" accept="image/*" className="input" />
          </div>
          <div>
            <label className="label">포스터</label>
            <input ref={posterRef} type="file" accept="image/*" className="input" />
          </div>
          <div>
            <label className="label">발표 영상</label>
            <input ref={videoRef} type="file" accept="video/*" className="input" />
          </div>
        </div>
      )}

      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}

export async function createItem(
  data: Record<string, unknown>,
  files: { name: string; file: File }[],
  exhibitionId: string
) {
  return apiMultipart<Item>("/admin/items", [{ name: "request", json: data }, ...files], exhibitionId);
}

export async function updateItem(id: string, data: Record<string, unknown>, exhibitionId: string) {
  return apiJson<Item>(`/admin/items/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    exhibitionId,
  });
}
