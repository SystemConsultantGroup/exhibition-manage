"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Boxes, FolderTree, CalendarClock,
  Newspaper, Settings2, LogOut,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useExhibition } from "./ExhibitionProvider";

const NAV = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/items", label: "항목 관리", icon: Boxes },
  { href: "/categories", label: "카테고리", icon: FolderTree },
  { href: "/event-periods", label: "발표회차", icon: CalendarClock },
  { href: "/boards", label: "게시글", icon: Newspaper },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading, logout } = useAuth();
  const { exhibitions, selected, select, loading: exLoading } = useExhibition();

  if (loading || exLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
          <p className="text-sm text-slate-500">불러오는 중…</p>
        </div>
      </div>
    );
  }

  if (!me) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  return (
    <div className="flex min-h-screen">
      {/* 사이드바 */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30">
            <Boxes size={18} />
          </div>
          <div>
            <p className="text-[15px] font-bold leading-tight text-slate-800">전시 관리자</p>
            <p className="text-[11px] text-slate-400">Exhibition Console</p>
          </div>
        </div>

        {/* 전시 선택 */}
        <div className="border-y border-slate-100 px-4 py-4">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            관리 전시
          </label>
          <select
            className="input"
            value={selected?.id ?? ""}
            onChange={(e) => select(e.target.value)}
          >
            {exhibitions.length === 0 && <option value="">전시 없음</option>}
            {exhibitions.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>
        </div>

        {/* 내비게이션 */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon size={17} className={active ? "text-indigo-600" : "text-slate-400"} />
                {label}
              </Link>
            );
          })}
          <div className="!my-3 border-t border-slate-100" />
          <Link
            href="/exhibitions"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname.startsWith("/exhibitions")
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Settings2 size={17} className={pathname.startsWith("/exhibitions") ? "text-indigo-600" : "text-slate-400"} />
            전시 설정
          </Link>
        </nav>

        {/* 사용자 */}
        <div className="border-t border-slate-100 p-4">
          <div className="mb-2.5 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
              {(me.name || "?")[0]}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-700">{me.name}</p>
              <p className="truncate text-xs text-slate-400">{me.email}</p>
            </div>
          </div>
          <button onClick={logout} className="btn-secondary w-full">
            <LogOut size={14} /> 로그아웃
          </button>
        </div>
      </aside>

      {/* 메인 */}
      <main className="ml-64 flex-1 p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

