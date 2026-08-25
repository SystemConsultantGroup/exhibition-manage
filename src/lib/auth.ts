"use client";

import type { TokenResponse } from "./types";

const ACCESS_KEY = "admin.accessToken";
const REFRESH_KEY = "admin.refreshToken";
const EXPIRES_KEY = "admin.expiresAt";

export function saveTokens(res: TokenResponse) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_KEY, res.accessToken);
  localStorage.setItem(REFRESH_KEY, res.refreshToken);
  localStorage.setItem(
    EXPIRES_KEY,
    String(Date.now() + (res.accessTokenExpiresIn - 30) * 1000)
  );
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  [ACCESS_KEY, REFRESH_KEY, EXPIRES_KEY].forEach((k) => localStorage.removeItem(k));
}

/** Access token 만료 시 refresh 토큰으로 재발급 */
export async function ensureAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const access = localStorage.getItem(ACCESS_KEY);
  const expiresAt = Number(localStorage.getItem(EXPIRES_KEY) || 0);
  if (access && Date.now() < expiresAt) return access;

  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) {
    clearTokens();
    return null;
  }
  try {
    const r = await fetch("/api/backend/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!r.ok) {
      clearTokens();
      return null;
    }
    const data = (await r.json()) as TokenResponse;
    saveTokens(data);
    return data.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

/** 카카오 인가 코드로 로그인 */
export async function kakaoLogin(code: string): Promise<TokenResponse> {
  const redirectUri =
    process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI ||
    `${window.location.origin}/login`;
  const r = await fetch("/api/backend/auth/kakao/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirectUri }),
  });
  if (!r.ok) {
    throw new Error(`로그인 실패 (${r.status})`);
  }
  return (await r.json()) as TokenResponse;
}

/** 카카오 로그인 페이지로 이동 (REST API 키 필요) */
export function redirectToKakaoLogin() {
  const key = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;
  if (!key) {
    alert("카카오 REST API 키가 설정되지 않았습니다. .env.local을 확인하세요.");
    return;
  }
  const redirectUri =
    process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI ||
    `${window.location.origin}/login`;
  const url = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${encodeURIComponent(
    key
  )}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  window.location.href = url;
}
