import { NextResponse } from "next/server";
import { getUploadObservation } from "@/lib/server/upload-observation";
import { isSameOriginBrowserRequest, UUID_PATTERN } from "@/lib/server/proxy-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!isSameOriginBrowserRequest(request)) {
    return NextResponse.json({ message: "교차 출처 요청은 허용되지 않습니다." }, { status: 403, headers });
  }
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const exhibitionId = request.headers.get("x-exhibition-id") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(exhibitionId) ||
      authorization.length > 8192 || !/^Bearer [A-Za-z0-9._~+\/-]+=*$/.test(authorization)) {
    return NextResponse.json({ message: "유효한 업로드 ID와 인증 정보가 필요합니다." }, { status: 400, headers });
  }
  const observation = getUploadObservation(id, authorization, exhibitionId);
  // This does not mean the upload failed. It may be buffered before Next.js,
  // routed to another replica, or have lost its observation on process restart.
  return NextResponse.json({ observation }, { headers });
}
