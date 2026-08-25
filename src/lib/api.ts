"use client";

import { ensureAccessToken } from "./auth";

type ApiOptions = RequestInit & {
  exhibitionId?: string;
  tenantDomain?: string;
};

/**
 * 관리자 API 공통 호출 헬퍼.
 * - Authorization 헤더 자동 부착 및 토큰 만료 시 재발급
 * - exhibitionId 지정 시 X-Exhibition-Id 헤더 추가
 */
export async function apiFetch(
  path: string,
  options: ApiOptions = {}
): Promise<Response> {
  const { exhibitionId, tenantDomain, headers: extraHeaders, ...rest } = options;
  let headers: Record<string, string> = {};
  if (extraHeaders instanceof Headers) {
    extraHeaders.forEach((v, k) => {
      headers[k] = v;
    });
  } else if (extraHeaders) {
    Object.entries(extraHeaders).forEach(([k, v]) => {
      headers[k] = v;
    });
  }

  const token = await ensureAccessToken();
  if (!token) {
    window.location.href = "/login";
    throw new Error("인증이 필요합니다.");
  }
  headers["Authorization"] = `Bearer ${token}`;
  if (exhibitionId) headers["X-Exhibition-Id"] = exhibitionId;
  if (tenantDomain) headers["X-Exhibition-Domain"] = tenantDomain;

  const requestUrl = `${tenantDomain ? "/api/tenant" : "/api/backend"}${path}`;

  const doFetch = () =>
    fetch(requestUrl, { ...rest, headers });

  let res = await doFetch();
  // 토큰이 서버에서 만료된 경우 한 번 재시도
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await ensureAccessToken();
    if (refreshed && refreshed !== token) {
      headers["Authorization"] = `Bearer ${refreshed}`;
      res = await fetch(requestUrl, { ...rest, headers });
    }
  }
  return res;
}

export async function apiJson<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) throw new Error(`${options.method || "GET"} ${path} 실패 (${res.status})`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** multipart FormData 요청 (JSON 파트는 Blob으로 전송해 Content-Type 명시) */
export async function apiMultipart<T>(
  path: string,
  fields: { name: string; json?: unknown; file?: File }[],
  exhibitionId?: string
): Promise<T> {
  const fd = new FormData();
  for (const f of fields) {
    if (f.json !== undefined) {
      fd.append(f.name, new Blob([JSON.stringify(f.json)], { type: "application/json" }));
    } else if (f.file) {
      fd.append(f.name, f.file);
    }
  }
  const res = await apiFetch(path, { method: "POST", body: fd, exhibitionId });
  if (!res.ok) throw new Error(`업로드 실패 (${res.status})`);
  return (await res.json()) as T;
}
