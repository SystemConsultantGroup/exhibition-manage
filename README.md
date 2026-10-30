# Exhibition Admin

Korean-language Next.js 16 / React 19 dashboard for exhibitions, items, categories,
event periods and board posts.

## Run

```bash
npm ci
npm run dev       # development
npm run build
npm start         # standard next start; no custom server.mjs
npm test          # direct/proxy upload, security and timeout regression tests
npm run test:smoke # after build: actual next start, runtime CSP, 1 MiB multipart
npx tsc --noEmit
```

Create `.env.local` for development. In production inject environment variables
at container startup:

```env
# Internal/backend proxy address. Never sent to the browser.
API_BASE_URL=http://exhibition-backend:8080
NEXT_PUBLIC_KAKAO_REST_API_KEY=your_kakao_rest_api_key

# Recommended for bulk uploads: publicly reachable API base URL.
# Runtime setting, NOT a NEXT_PUBLIC_* build argument.
BULK_UPLOAD_API_BASE_URL=https://api.example.com
```

`API_BASE_URL` remains required for ordinary API calls and public tenant data.
`BULK_UPLOAD_API_BASE_URL` is optional; it must be HTTPS (HTTP localhost is allowed
for development). An API path prefix such as `https://api.example.com/v1` is
preserved. Credentials, query strings and fragments are rejected. A malformed
setting fails explicitly rather than silently sending files elsewhere.

Register the Kakao redirect URI as `<manager-origin>/login`. Users with an
incomplete profile are directed to registration.

## Fast bulk upload path

```text
Browser → API ingress → backend → bounded parallel MinIO transfers
```

With `BULK_UPLOAD_API_BASE_URL` configured, the browser sends its native multipart
FormData directly to `/admin/items/bulk/upload` at that base URL. This removes the
manager ingress, Next.js server and manager-to-API hop from the multi-gigabyte data
path. There is no base64 conversion, whole-file JavaScript read, or multipart
reconstruction. XHR provides browser send progress. Only the final API response
confirms DB registration and media storage; browser upload completion alone does
not. No polling of manager-local observations occurs for direct uploads.

`GET /api/uploads/config` exposes only this explicitly public upload URL. It does
not expose the internal `API_BASE_URL`. CSP is generated at request time in
`src/proxy.ts` and permits only the configured API origin in `connect-src`, so the
same production image supports different runtime API addresses. Bearer tokens,
`X-Exhibition-Id` and random `X-Upload-Id` headers are sent to the configured API;
cookies are not sent. The API still enforces authentication and tenant scope.

### Required API / ingress configuration

- Set backend `APP_CORS_ADMIN_ALLOWED_HOSTS` to the manager hostname(s), e.g.
  `manage.example.com`. CORS must permit POST and `Authorization`,
  `X-Exhibition-Id`, `X-Upload-Id` request headers. The updated backend handles
  preflight and exposes upload response headers. Do not use a wildcard origin.
- The **public API ingress** must accept the configured body sizes and long
  uploads/response waits. For ingress-nginx review `proxy-body-size`,
  `proxy-request-buffering: "off"`, `proxy-read-timeout`, `proxy-send-timeout`,
  and client-body timeouts. App changes do not configure external gateways.
- Backend defaults are 10 MiB Excel, 1000 rows, 500 MiB per file, 10 GiB total
  multipart body, 3001 parts (Excel + 3000 media). Client validation leaves room
  for multipart headers. If overriding backend limits, adjust client limits too.
- Backend `APP_UPLOAD_WORKERS` controls the shared MinIO transfer pool (default
  4, range 1–32). Start with 4; increasing workers beyond storage/network capacity
  can hurt throughput. JPA writes stay on the transaction thread, use JDBC
  batches, and roll back together; storage failures clean up transferred objects.

### Backward-compatible proxy path

Without `BULK_UPLOAD_API_BASE_URL`, uploads still use:

```text
Browser → manager ingress → /api/backend streaming proxy → backend → MinIO
```

The proxy forwards raw bytes with backpressure and a 10 GiB body limit. It does
not call `formData()` or `arrayBuffer()`. It retains a pooled Undici agent and
phase-aware timeouts:

- `BULK_UPLOAD_IDLE_TIMEOUT_MS`: default 120000, transfer inactivity timeout.
- `BULK_UPLOAD_RESPONSE_TIMEOUT_MS`: default 900000, response budget beginning
  when the outbound body is sent; includes receiving the response body.
- `BULK_UPLOAD_TIMEOUT_MS`: legacy response-budget fallback.

These are **proxy transport** settings, not overrides of the standard Next/Node
incoming HTTP server. Removing the custom server restores stock incoming request
limits (including Node's normal request-body deadline). Use direct upload for
large/slow transfers rather than relying on the fallback to support uploads
longer than those limits. No Node monkey-patches or custom launch hooks are used.

The fallback UI retains manager received/sent byte observations from
`/api/uploads/status?id=<uuid>`. Records are bounded, expiring and tied to the
original authorization header and exhibition ID. They are local to one process:
other replicas/restarts can make observations unavailable. That is not evidence
of upload failure. Socket writes are not backend/MinIO acknowledgements.

### Failure handling

Neither transport automatically retries a large request, switches transport after
failure, or replays after a 401. Credentials may be refreshed for the next manual
attempt. After a disconnect or 5xx, inspect the item list before retrying because
the transaction may have committed. API logs include `uploadId`, processing time
and counts after multipart parsing. Manager proxy logs additionally identify
`manager_upload_idle_timeout`, `manager_response_deadline`, connection errors and
upstream HTTP responses. Tokens and file bodies are not logged. Inspect ingress
logs too; an error response may come from a gateway rather than the application.

## Docker

```bash
docker build \
  --build-arg NEXT_PUBLIC_KAKAO_REST_API_KEY=your_key \
  -t exhibition-admin .

docker run -p 3000:3000 \
  -e API_BASE_URL=http://backend:8080 \
  -e BULK_UPLOAD_API_BASE_URL=https://api.example.com \
  exhibition-admin
```

Only the existing Kakao public key is a build argument. Upload addresses are read
at runtime. The image runs as numeric UID/GID 1000 and starts with `npm start`
(`next start`). Remove deployment command overrides referencing `server.mjs`.

## Admin edits

- Items support multipart PUT media replacement and explicit per-slot removal;
  omitted files retain existing connections.
- Exhibition edits support media replacement/removal and award/latest-period
  display settings.
- Categories support creation, renaming, ordering and deletion when not referenced.

## Verification

`npm test` covers direct uploads, no replay after 401, runtime target/CSP validation,
proxy fallback, byte streaming, backpressure, cancellations and phase deadlines.
Backend tests cover repeated-reference query reduction, prevalidation before side
effects, concurrent storage I/O without JPA worker access, storage failure cleanup,
and real H2/JPA batched persistence/rollback. These local checks are not a
production bandwidth benchmark. Compare the same workbook/files before and after,
recording browser send time, API processing time and final completion time; verify
counts and references before deleting the test items.
