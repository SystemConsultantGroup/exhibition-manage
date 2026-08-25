"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Category, EventPeriod, Item, PagedResponse } from "@/lib/types";
import { apiFetch, apiJson, buildQuery } from "@/lib/api";
import { useExhibition } from "@/components/ExhibitionProvider";

export default function ItemsPage() {
  const { selected } = useExhibition();
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [periods, setPeriods] = useState<EventPeriod[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const size = 20;
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [awardedFilter, setAwardedFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!selected) return;
    try {
      const tenantDomain = selected.defaultDomain ?? selected.customDomain;
      if (!tenantDomain) return;
      const data = await apiJson<PagedResponse<Item>>(
        `/items${buildQuery({
          page, size, q,
          categoryId: categoryFilter || undefined,
          awarded: awardedFilter === "" ? undefined : awardedFilter === "true",
        })}`,
        { tenantDomain }
      );
      setItems(data.items);
      setTotal(data.total);
    } catch {}
  }, [selected, page, q, categoryFilter, awardedFilter]);

  useEffect(() => {
    if (!selected) return;
    const tenantDomain = selected.defaultDomain ?? selected.customDomain;
    if (!tenantDomain) return;
    load();
    apiJson<PagedResponse<Category>>("/categories", { tenantDomain }).then((d) => setCategories(d.items)).catch(() => {});
    apiJson<PagedResponse<EventPeriod>>("/event-periods", { tenantDomain }).then((d) => setPeriods(d.items)).catch(() => {});
  }, [selected, load]);

  const downloadTemplate = async () => {
    if (!selected) return;
    const periodId = periods[0]?.id;
    if (!periodId) {
      alert("발표회차를 먼저 생성해야 양식을 받을 수 있습니다.");
      return;
    }
    const res = await apiFetch(`/admin/items/bulk/template?eventPeriodId=${periodId}`, { exhibitionId: selected.id });
    if (!res.ok) { alert("양식 다운로드 실패"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "item-bulk-template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const bulkUpload = async () => {
    if (!selected) return;
    const file = fileRef.current?.files?.[0];
    if (!file) { alert("엑셀 파일을 선택하세요."); return; }
    const fd = new FormData();
    fd.append("file", file);
    for (const f of Array.from(mediaRef.current?.files ?? [])) fd.append("mediaFiles", f);
    const res = await apiFetch("/admin/items/bulk/upload", { method: "POST", body: fd, exhibitionId: selected.id });
    if (!res.ok) { alert("일괄 등록 실패"); return; }
    const r = await res.json();
    alert(`등록 완료: 항목 ${r.createdItems}건`);
    load();
  };

  const removeItem = async (item: Item) => {
    if (!selected) return;
    if (!confirm(`${item.title} 항목을 삭제하시겠습니까?`)) return;
    await apiFetch(`/admin/items/${item.id}`, { method: "DELETE", exhibitionId: selected.id });
    load();
  };

  if (!selected) return <p className="text-gray-500">전시를 먼저 선택하세요.</p>;

  const pages = Math.ceil(total / size);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">항목 관리</h1>
        <div className="space-x-2">
          <button onClick={downloadTemplate} className="btn-secondary">양식 다운로드</button>
          <Link href="/items/new" className="btn-primary">+ 새 항목</Link>
        </div>
      </div>

      {/* 일괄 등록 */}
      <details className="card mb-4">
        <summary className="cursor-pointer font-medium">Excel 일괄 등록</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="label">엑셀 파일</label>
            <input ref={fileRef} type="file" accept=".xlsx" className="input" />
          </div>
          <div>
            <label className="label">미디어 파일들 (다중 선택)</label>
            <input ref={mediaRef} type="file" multiple className="input" />
          </div>
          <div className="flex items-end">
            <button onClick={bulkUpload} className="btn-primary w-full">일괄 등록</button>
          </div>
        </div>
      </details>

      {/* 필터 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="제목/참여자/교수 검색…" value={q}
          onChange={(e) => { setPage(0); setQ(e.target.value); }} />
        <select className="input max-w-[180px]" value={categoryFilter}
          onChange={(e) => { setPage(0); setCategoryFilter(e.target.value); }}>
          <option value="">전체 카테고리</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input max-w-[140px]" value={awardedFilter}
          onChange={(e) => { setPage(0); setAwardedFilter(e.target.value); }}>
          <option value="">수상 전체</option>
          <option value="true">수상작만</option>
          <option value="false">미수상만</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">제목</th>
              <th className="px-4 py-3">카테고리</th>
              <th className="px-4 py-3">참여자</th>
              <th className="px-4 py-3">좋아요</th>
              <th className="px-4 py-3">수상</th>
              <th className="px-4 py-3 text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((it) => (
              <tr key={it.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{it.title}</td>
                <td className="px-4 py-3 text-gray-500">
                  {categories.find((c) => c.id === it.categoryId)?.name ?? "-"}
                </td>
                <td className="px-4 py-3 text-gray-500">{it.participantNames}</td>
                <td className="px-4 py-3">{it.likes}</td>
                <td className="px-4 py-3">{it.awarded ? "🏆" : ""}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Link href={`/items/${it.id}`} className="btn-secondary">수정</Link>
                  <button onClick={() => removeItem(it)} className="btn-danger">삭제</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">항목이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: pages }).map((_, i) => (
            <button key={i} onClick={() => setPage(i)}
              className={i === page ? "btn-primary" : "btn-secondary"}>{i + 1}</button>
          ))}
        </div>
      )}
    </div>
  );
}
