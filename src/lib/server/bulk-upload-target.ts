import { getApiBaseUrl } from "./proxy-security";

/** Only the deployment can choose the direct upload destination, never request input. */
export function getDirectBulkUploadTarget(raw: string | undefined): URL | null {
  if (!raw) return null;
  const base = getApiBaseUrl(raw);
  if (!base || (base.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) {
    throw new Error("BULK_UPLOAD_API_BASE_URL must be an HTTPS API base URL (HTTP is allowed only for localhost)");
  }
  return new URL("admin/items/bulk/upload", base);
}

/** Read at request time so one image can be promoted between environments. */
export function uploadContentSecurityPolicy(raw: string | undefined, development = false): string {
  const target = getDirectBulkUploadTarget(raw);
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws: wss:" : ""}${target ? ` ${target.origin}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
