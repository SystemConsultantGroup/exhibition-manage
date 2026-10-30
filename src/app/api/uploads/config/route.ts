import { NextResponse } from "next/server";
import { getDirectBulkUploadTarget } from "@/lib/server/bulk-upload-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public runtime connection information only; never expose the internal API_BASE_URL. */
export function GET() {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const target = getDirectBulkUploadTarget(process.env.BULK_UPLOAD_API_BASE_URL);
    return NextResponse.json({ uploadUrl: target?.href ?? null }, { headers });
  } catch {
    return NextResponse.json({ message: "대량 업로드 API 주소 설정이 올바르지 않습니다." }, { status: 500, headers });
  }
}
