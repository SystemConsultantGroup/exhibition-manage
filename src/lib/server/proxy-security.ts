// Spring's UUID.fromString accepts any canonical UUID, regardless of version/variant.
const UUID_SOURCE = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
export const UUID_PATTERN = new RegExp(`^${UUID_SOURCE}$`);

const ROUTES: ReadonlyArray<{ pattern: RegExp; methods: ReadonlySet<string> }> = [
  { pattern: /^auth\/(?:refresh|kakao\/login|register)$/, methods: new Set(["POST"]) },
  { pattern: /^users\/me$/, methods: new Set(["GET", "HEAD"]) },
  { pattern: /^admin\/exhibitions$/, methods: new Set(["GET", "HEAD", "POST"]) },
  { pattern: new RegExp(`^admin/exhibitions/${UUID_SOURCE}$`), methods: new Set(["GET", "HEAD", "PUT", "DELETE"]) },
  { pattern: /^admin\/categories\/order$/, methods: new Set(["PUT"]) },
  { pattern: new RegExp(`^admin/categories/${UUID_SOURCE}$`), methods: new Set(["PUT"]) },
  { pattern: /^admin\/event-periods$/, methods: new Set(["POST"]) },
  { pattern: new RegExp(`^admin/event-periods/${UUID_SOURCE}$`), methods: new Set(["PUT", "DELETE"]) },
  { pattern: /^admin\/boards$/, methods: new Set(["POST"]) },
  { pattern: new RegExp(`^admin/boards/${UUID_SOURCE}$`), methods: new Set(["PUT", "DELETE"]) },
  { pattern: /^admin\/items$/, methods: new Set(["POST"]) },
  { pattern: new RegExp(`^admin/items/${UUID_SOURCE}$`), methods: new Set(["PUT", "DELETE"]) },
  { pattern: /^admin\/items\/bulk\/template$/, methods: new Set(["GET", "HEAD"]) },
  { pattern: /^admin\/items\/bulk\/upload$/, methods: new Set(["POST"]) },
];

export function isAllowedBackendRoute(path: string, method: string): boolean {
  return ROUTES.some(({ pattern, methods }) => pattern.test(path) && methods.has(method));
}

export function isSameOriginBrowserRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function getApiBaseUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.endsWith("/") ? raw : `${raw}/`);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
