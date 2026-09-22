import { NextResponse } from "next/server";
import {
  getApiBaseUrl,
  isAllowedBackendRoute,
  isSameOriginBrowserRequest,
  UUID_PATTERN,
} from "@/lib/server/proxy-security";

const MAX_QUERY_LENGTH = 4096;
const MAX_REQUEST_BYTES = 100 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 120_000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

async function proxyBackend(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  if (!isSameOriginBrowserRequest(request)) {
    return jsonError("교차 출처 요청은 허용되지 않습니다.", 403);
  }

  // Route Handlers run when the request arrives, after the deployment has
  // injected its runtime environment variables.
  const baseUrl = getApiBaseUrl(process.env.API_BASE_URL);
  if (!baseUrl) return jsonError("API 서버 주소가 올바르게 설정되지 않았습니다.", 500);

  const { path: segments } = await context.params;
  const path = segments.join("/");
  if (!path || !isAllowedBackendRoute(path, request.method)) {
    return jsonError("허용되지 않은 API 경로 또는 메서드입니다.", 404);
  }

  const incomingUrl = new URL(request.url);
  if (incomingUrl.search.length > MAX_QUERY_LENGTH) {
    return jsonError("요청 쿼리가 너무 깁니다.", 414);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const bytes = Number(contentLength);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_REQUEST_BYTES) {
      return jsonError("요청 본문이 너무 큽니다.", 413);
    }
  }

  const targetUrl = new URL(segments.map(encodeURIComponent).join("/"), baseUrl);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers();
  for (const name of ["accept", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const authorization = request.headers.get("authorization");
  const requiresAuthorization =
    path.startsWith("admin/") || path === "users/me" || path === "auth/register";
  if (requiresAuthorization && (!authorization || authorization.length > 8192 || !/^Bearer [A-Za-z0-9._~+\/-]+=*$/.test(authorization))) {
    return jsonError("유효한 인증 토큰이 필요합니다.", 401);
  }
  if (authorization) headers.set("authorization", authorization);

  const exhibitionId = request.headers.get("x-exhibition-id");
  const requiresExhibitionId = /^admin\/(?:categories|event-periods|boards|items)(?:\/|$)/.test(path);
  if (requiresExhibitionId && (!exhibitionId || !UUID_PATTERN.test(exhibitionId))) {
    return jsonError("유효한 전시 ID가 필요합니다.", 400);
  }
  if (exhibitionId) {
    if (!UUID_PATTERN.test(exhibitionId)) return jsonError("유효하지 않은 전시 ID입니다.", 400);
    headers.set("x-exhibition-id", exhibitionId);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstreamRequest: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
  };

  // Node's fetch requires this when forwarding a streaming POST/PUT body.
  if (hasBody) upstreamRequest.duplex = "half";

  try {
    const upstream = await fetch(targetUrl, upstreamRequest);

    const responseHeaders = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of ["content-type", "content-disposition", "www-authenticate"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    return new NextResponse(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    // Do not return upstream details to the browser, but retain the network
    // failure in the workload log so deployment issues can be diagnosed.
    const cause = error instanceof Error ? error.cause : undefined;
    console.error("Backend API proxy request failed", {
      method: request.method,
      targetOrigin: targetUrl.origin,
      path: targetUrl.pathname,
      error: error instanceof Error ? error.message : String(error),
      cause: cause instanceof Error ? cause.message : cause ? String(cause) : undefined,
    });
    return jsonError("백엔드 API에 연결할 수 없습니다.", 502);
  }
}

export const GET = proxyBackend;
export const HEAD = proxyBackend;
export const POST = proxyBackend;
export const PUT = proxyBackend;
export const PATCH = proxyBackend;
export const DELETE = proxyBackend;
