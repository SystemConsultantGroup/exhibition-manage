import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TENANT_DOMAIN_HEADER = "x-exhibition-domain";
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";
const ALLOWED_PATH = new RegExp(
  `^(?:items|categories|classifications|event-periods|boards)(?:/${UUID})?$`
);

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

function normalizeDomain(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!value || value.length > 253 || !/^[a-z0-9.-]+$/.test(value)) return null;

  const labels = value.split(".");
  if (labels.some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) {
    return null;
  }

  try {
    const parsed = new URL(`https://${value}`);
    if (parsed.hostname.toLowerCase() !== value || parsed.port || parsed.username || parsed.password) return null;
    return value;
  } catch {
    return null;
  }
}

async function proxyTenantRead(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const apiBaseUrl = process.env.API_BASE_URL;
  if (!apiBaseUrl) return jsonError("API 서버 주소가 설정되지 않았습니다.", 500);

  const { path: segments } = await context.params;
  const path = segments.join("/");
  if (!ALLOWED_PATH.test(path)) return jsonError("허용되지 않은 API 경로입니다.", 404);

  const domain = normalizeDomain(request.headers.get(TENANT_DOMAIN_HEADER));
  if (!domain) return jsonError("유효한 전시 도메인이 필요합니다.", 400);

  const incomingUrl = new URL(request.url);
  if (incomingUrl.search.length > 4096) return jsonError("요청 쿼리가 너무 깁니다.", 414);

  let targetUrl: URL;
  try {
    const baseUrl = new URL(apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`);
    targetUrl = new URL(path, baseUrl);
    targetUrl.search = incomingUrl.search;
  } catch {
    return jsonError("API 서버 주소가 올바르지 않습니다.", 500);
  }

  const headers = new Headers({
    Accept: request.headers.get("accept") ?? "application/json",
    Origin: `https://${domain}`,
  });
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("Authorization", authorization);

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      cache: "no-store",
      redirect: "manual",
    });

    const responseHeaders = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("Content-Type", contentType);

    return new NextResponse(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return jsonError("백엔드 API에 연결할 수 없습니다.", 502);
  }
}

export const GET = proxyTenantRead;
export const HEAD = proxyTenantRead;
