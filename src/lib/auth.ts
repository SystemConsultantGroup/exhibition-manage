"use client";

import type { TokenResponse } from "./types";

const ACCESS_KEY = "admin.accessToken";
const REFRESH_KEY = "admin.refreshToken";
const EXPIRES_KEY = "admin.expiresAt";
const OAUTH_STATE_KEY = "admin.kakaoOAuthState";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

let refreshPromise: Promise<string | null> | null = null;

function isTokenResponse(value: unknown): value is TokenResponse {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.accessToken === "string" &&
    data.accessToken.length > 0 &&
    typeof data.refreshToken === "string" &&
    data.refreshToken.length > 0 &&
    typeof data.accessTokenExpiresIn === "number" &&
    Number.isFinite(data.accessTokenExpiresIn) &&
    data.accessTokenExpiresIn > 0 &&
    typeof data.refreshTokenExpiresIn === "number" &&
    Number.isFinite(data.refreshTokenExpiresIn) &&
    typeof data.registrationRequired === "boolean"
  );
}

async function readTokenResponse(response: Response): Promise<TokenResponse> {
  const data: unknown = await response.json();
  if (!isTokenResponse(data)) throw new Error("인증 서버 응답이 올바르지 않습니다.");
  return data;
}

export function saveTokens(res: TokenResponse) {
  if (typeof window === "undefined" || !isTokenResponse(res)) return;
  localStorage.setItem(ACCESS_KEY, res.accessToken);
  localStorage.setItem(REFRESH_KEY, res.refreshToken);
  const refreshSkewSeconds = Math.min(30, Math.max(1, res.accessTokenExpiresIn / 10));
  localStorage.setItem(
    EXPIRES_KEY,
    String(Date.now() + Math.max(0, res.accessTokenExpiresIn - refreshSkewSeconds) * 1000)
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

async function refreshAccessToken(): Promise<string | null> {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) {
    clearTokens();
    return null;
  }

  try {
    const response = await fetch("/api/backend/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!response.ok) {
      clearTokens();
      return null;
    }
    const data = await readTokenResponse(response);
    saveTokens(data);
    return data.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

/** Access token 만료 시 refresh 토큰으로 재발급 */
export async function ensureAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const access = localStorage.getItem(ACCESS_KEY);
  const expiresAt = Number(localStorage.getItem(EXPIRES_KEY) || 0);
  if (access && Number.isFinite(expiresAt) && Date.now() < expiresAt) return access;

  // 여러 컴포넌트가 동시에 시작되어 refresh token rotation을 충돌시키지 않게 한다.
  refreshPromise ??= refreshAccessToken().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/** 401 응답 뒤에는 아직 만료 시각이 남아 있어도 기존 access token을 강제로 교체한다. */
export async function refreshAccessTokenAfterUnauthorized(
  rejectedToken: string
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const current = localStorage.getItem(ACCESS_KEY);
  if (current && current !== rejectedToken) return current;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  return ensureAccessToken();
}

function getRedirectUri(): string {
  const configured = process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI;
  if (!configured) return `${window.location.origin}/login`;

  const redirect = new URL(configured, window.location.origin);
  if (redirect.origin !== window.location.origin || redirect.pathname !== "/login") {
    throw new Error("카카오 redirect URI는 현재 사이트의 /login 경로여야 합니다.");
  }
  return redirect.toString();
}

function createOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function consumeOAuthState(receivedState: string | null): boolean {
  const stored = sessionStorage.getItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  if (!stored || !receivedState) return false;

  try {
    const value = JSON.parse(stored) as { value?: unknown; createdAt?: unknown };
    return (
      typeof value.value === "string" &&
      typeof value.createdAt === "number" &&
      Date.now() - value.createdAt >= 0 &&
      Date.now() - value.createdAt <= OAUTH_STATE_TTL_MS &&
      value.value === receivedState
    );
  } catch {
    return false;
  }
}

/** 카카오 인가 코드로 로그인 */
export async function kakaoLogin(code: string, state: string | null): Promise<TokenResponse> {
  if (!consumeOAuthState(state)) {
    throw new Error("로그인 요청을 확인할 수 없습니다. 다시 로그인해주세요.");
  }

  const response = await fetch("/api/backend/auth/kakao/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirectUri: getRedirectUri() }),
  });
  if (!response.ok) throw new Error(`로그인 실패 (${response.status})`);
  return readTokenResponse(response);
}

/** 카카오 로그인 페이지로 이동 (REST API 키 필요) */
export function redirectToKakaoLogin() {
  const key = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;
  if (!key) {
    alert("카카오 REST API 키가 설정되지 않았습니다. .env.local을 확인하세요.");
    return;
  }

  try {
    const state = createOAuthState();
    sessionStorage.setItem(
      OAUTH_STATE_KEY,
      JSON.stringify({ value: state, createdAt: Date.now() })
    );
    const params = new URLSearchParams({
      response_type: "code",
      client_id: key,
      redirect_uri: getRedirectUri(),
      state,
    });
    window.location.assign(`https://kauth.kakao.com/oauth/authorize?${params}`);
  } catch (error) {
    alert(error instanceof Error ? error.message : "로그인을 시작할 수 없습니다.");
  }
}
