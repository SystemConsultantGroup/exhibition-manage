import { NextResponse } from "next/server";

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
  // Route Handlers run when the request arrives, after the deployment has
  // injected its runtime environment variables.
  const apiBaseUrl = process.env.API_BASE_URL;
  if (!apiBaseUrl) return jsonError("API 서버 주소가 설정되지 않았습니다.", 500);

  const { path: segments } = await context.params;
  if (segments.length === 0) return jsonError("API 경로가 필요합니다.", 404);

  let targetUrl: URL;
  try {
    const baseUrl = new URL(apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`);
    const path = segments.map(encodeURIComponent).join("/");
    targetUrl = new URL(path, baseUrl);
    targetUrl.search = new URL(request.url).search;
  } catch {
    return jsonError("API 서버 주소가 올바르지 않습니다.", 500);
  }

  const headers = new Headers();
  for (const name of ["accept", "authorization", "content-type", "x-exhibition-id", "x-exhibition-domain"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      cache: "no-store",
      redirect: "manual",
    });

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
  } catch {
    return jsonError("백엔드 API에 연결할 수 없습니다.", 502);
  }
}

export const GET = proxyBackend;
export const HEAD = proxyBackend;
export const POST = proxyBackend;
export const PUT = proxyBackend;
export const PATCH = proxyBackend;
export const DELETE = proxyBackend;
