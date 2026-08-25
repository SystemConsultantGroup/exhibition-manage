"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Boxes } from "lucide-react";
import { kakaoLogin, redirectToKakaoLogin, saveTokens } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshMe } = useAuth();
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) return;
    setProcessing(true);
    (async () => {
      try {
        const tokens = await kakaoLogin(code);
        saveTokens(tokens);
        await refreshMe();
        if (tokens.registrationRequired) {
          router.replace("/register");
        } else {
          router.replace("/");
        }
      } catch (e) {
        alert((e as Error).message);
        setProcessing(false);
      }
    })();
  }, [searchParams, router, refreshMe]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950">
      {/* 배경 장식 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-600/25 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/40">
            <Boxes size={26} />
          </div>
          <h1 className="text-xl font-bold text-white">전시 관리자</h1>
          <p className="mt-1 text-sm text-slate-400">
            카카오 계정으로 로그인하세요
          </p>
        </div>

        {searchParams.get("code") || processing ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-white/20 border-t-white" />
            <p className="text-sm text-slate-400">로그인 처리 중…</p>
          </div>
        ) : (
          <button
            onClick={redirectToKakaoLogin}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] px-4 py-3.5 font-bold text-black/85 transition hover:brightness-95 active:scale-[0.98]"
          >
            <KakaoIcon /> 카카오로 시작하기
          </button>
        )}

        <p className="mt-5 text-center text-xs text-slate-500">
          관리자 권한이 있는 계정만 접근할 수 있습니다
        </p>
      </div>
    </main>
  );
}

function KakaoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3C6.48 3 2 6.54 2 10.89c0 2.79 1.87 5.23 4.68 6.62-.15.51-.55 1.94-.63 2.24-.1.37.13.36.28.26.11-.08 1.85-1.26 2.6-1.77.99.16 2.01.24 3.07.24 5.52 0 10-3.54 10-7.59S17.52 3 12 3z"/>
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
