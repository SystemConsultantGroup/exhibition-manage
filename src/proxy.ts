import { NextResponse } from "next/server";
import { uploadContentSecurityPolicy } from "./lib/server/bulk-upload-target";

/** Runtime CSP permits only the operator-configured direct upload API origin. */
export function proxy() {
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", uploadContentSecurityPolicy(
    process.env.BULK_UPLOAD_API_BASE_URL, process.env.NODE_ENV === "development",
  ));
  return response;
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next/static|_next/image|favicon.ico).*)"],
};
