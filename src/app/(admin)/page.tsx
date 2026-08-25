"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Boxes, FolderTree, CalendarClock, Newspaper, ArrowRight } from "lucide-react";
import type { BoardPost, Category, EventPeriod, Item, PagedResponse } from "@/lib/types";
import { apiJson } from "@/lib/api";
import { useExhibition } from "@/components/ExhibitionProvider";

export default function DashboardPage() {
  const { selected } = useExhibition();
  const [stats, setStats] = useState({ items: 0, categories: 0, periods: 0, boards: 0 });
  const [recentBoards, setRecentBoards] = useState<BoardPost[]>([]);

  useEffect(() => {
    if (!selected) return;
    const tenantDomain = selected.defaultDomain ?? selected.customDomain;
    if (!tenantDomain) return;
    (async () => {
      const [items, cats, periods, boards] = await Promise.all([
        apiJson<PagedResponse<Item>>(`/items?size=1`, { tenantDomain }).catch(() => null),
        apiJson<PagedResponse<Category>>(`/categories`, { tenantDomain }).catch(() => null),
        apiJson<PagedResponse<EventPeriod>>(`/event-periods`, { tenantDomain }).catch(() => null),
        apiJson<PagedResponse<BoardPost>>(`/boards`, { tenantDomain }).catch(() => null),
      ]);
      setStats({
        items: items?.total ?? 0,
        categories: cats?.total ?? 0,
        periods: periods?.total ?? 0,
        boards: boards?.total ?? 0,
      });
      setRecentBoards(boards?.items?.slice(0, 5) ?? []);
    })();
  }, [selected]);

  if (!selected) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Boxes size={26} />
        </div>
        <h1 className="mb-1 text-xl font-bold">관리 가능한 전시가 없습니다</h1>
        <p className="mb-5 text-sm text-slate-500">새 전시를 생성해 시작하세요.</p>
        <Link href="/exhibitions/new" className="btn-primary w-full">전시 생성하기</Link>
      </div>
    );
  }

  const cards = [
    { label: "항목", value: stats.items, href: "/items", icon: Boxes, color: "bg-indigo-50 text-indigo-600" },
    { label: "카테고리", value: stats.categories, href: "/categories", icon: FolderTree, color: "bg-emerald-50 text-emerald-600" },
    { label: "발표회차", value: stats.periods, href: "/event-periods", icon: CalendarClock, color: "bg-amber-50 text-amber-600" },
    { label: "게시글", value: stats.boards, href: "/boards", icon: Newspaper, color: "bg-rose-50 text-rose-600" },
  ];

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-8 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-7 text-white shadow-lg shadow-indigo-500/20">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{selected.slug}</p>
        <h1 className="mt-1 text-2xl font-bold">{selected.name}</h1>
        <p className="mt-1 text-sm text-white/80">{selected.defaultDomain}</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(({ label, value, href, icon: Icon, color }) => (
          <Link key={label} href={href}
            className="card group transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
                <Icon size={19} />
              </div>
              <ArrowRight size={15} className="mt-1 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-400" />
            </div>
            <p className="mt-3 text-[13px] font-medium text-slate-500">{label}</p>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
          </Link>
        ))}
      </div>

      {/* 최근 게시글 */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">최근 게시글</h2>
        <Link href="/boards" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          전체 보기 →
        </Link>
      </div>
      {recentBoards.length === 0 ? (
        <div className="card mt-3 text-center text-sm text-slate-400">게시글이 없습니다.</div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          {recentBoards.map((b) => (
            <li key={b.id} className="flex items-center justify-between px-5 py-3.5 transition hover:bg-slate-50/60">
              <Link href="/boards" className="font-medium text-slate-700 hover:text-indigo-600">{b.title}</Link>
              <span className="text-xs text-slate-400">
                {new Date(b.createdAt).toLocaleDateString("ko-KR")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
