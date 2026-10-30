# Exhibition Admin

Korean-language Next.js 16 / React 19 dashboard for exhibitions, items, categories,
event periods and board posts.

## Run

```bash
npm ci
npm run dev
npm run build
npm start          # standard next start; no server.mjs
npm test           # manager-only upload, backpressure, deadlines and no-replay tests
npm run test:smoke # after build: real Next server, multipart and streaming integrity
npm run lint
```

Development `.env.local`, or production container runtime environment:

```env
API_BASE_URL=http://exhibition-backend:8080
NEXT_PUBLIC_KAKAO_REST_API_KEY=your_kakao_rest_api_key
```

`API_BASE_URL` is server-only and is read at request time. It may point to an
internal service. It is never supplied to the browser. Register the Kakao redirect
URI as `<manager-origin>/login`.

## Required upload architecture

```text
Browser → manager site/ingress → manager streaming proxy → backend → MinIO
```

**All uploads must pass through the manager site.** The browser sends only to the
same-origin `/api/backend/admin/items/bulk/upload`. There is no public upload URL,
URL discovery endpoint, alternate transport or browser-to-backend upload option.
CSP `connect-src 'self'` enforces same-origin browser connections in production.
The manager validates the route, authentication header, exhibition ID and size
before forwarding to the server-configured backend. Backend authorization and
exhibition scope checks remain in force.

### 1. Browser → manager

The browser serializes native FormData with the Excel `file` and repeated
`mediaFiles`. File contents are not loaded into JavaScript, base64-encoded,
compressed, or reconstructed. The client validates file count, sizes and duplicate
names before sending and uses XHR upload progress. UI updates are limited to five
per second during upload; phase changes and final byte counts are immediate.
There is no preparatory public-URL request. Browser send completion does **not**
prove receipt by the manager/backend or successful registration.

### 2. Manager → backend

The manager reads incoming chunks and immediately forwards their existing byte
buffers with backpressure. It never calls `formData()`, `arrayBuffer()` or writes
whole uploads to manager storage. The pooled low-level Undici `request` transport
avoids the extra Web stream/per-chunk copying used by its `fetch` wrapper. A bounded
64 KiB Node stream queue prevents reading the whole request ahead of the backend.
Original content type/boundary and content length are preserved; unknown-length
bodies are counted while streaming. Backend redirects are not followed.

Use an internal `API_BASE_URL` to avoid a needless public API gateway round trip.
Manager ingress request buffering can still defeat streaming before the request
reaches the app; configure that infrastructure explicitly.

### 3. Backend

The API prevalidates the complete workbook and file references before writes,
caches repeated category/classification lookups, batches JPA writes, and runs only
MinIO I/O in a shared bounded worker pool. Entity/DB work stays on the transaction
thread. File transfer failures wait for started work before cleanup; DB rollback
also removes uploaded objects. Entity/table definitions are unchanged.

Defaults: Excel 10 MiB / 1000 rows, media 500 MiB each, 10 GiB total multipart,
3001 parts. Client size validation leaves room for multipart headers. The backend's
`APP_UPLOAD_WORKERS` defaults to 4 (range 1–32). Tune against actual network/storage
capacity rather than setting unbounded parallelism.

### Timeouts and infrastructure

`npm start` uses standard `next start`. There are no custom HTTP entrypoints or
Node monkey-patches. Proxy transport limits are:

- `BULK_UPLOAD_IDLE_TIMEOUT_MS`: default 120000 for transfer inactivity.
- `BULK_UPLOAD_RESPONSE_TIMEOUT_MS`: default 900000 after the outbound body is
  sent; covers the response body too.
- `BULK_UPLOAD_TIMEOUT_MS`: legacy response-budget fallback.

These do not override standard Next/Node incoming request deadlines (Node's
normal request-body deadline still applies) or external ingress limits. An upload
lasting beyond those incoming limits can still fail. Do not work around this by
bypassing the manager. Review supported server/deployment limits separately if
longer transfers are required.

For ingress-nginx, review `proxy-request-buffering: "off"`, `proxy-body-size`,
`proxy-read-timeout`, `proxy-send-timeout` and the client-body timeout. Both manager
and any backend gateway need compatible limits. These settings live outside this
repository and are not changed by application code. Backend multipart uses disk
temp files, so allocate sufficient backend temporary storage.

### Observations and failures

The UI reports browser bytes, manager receipt, backend socket send bytes and the
final registration result separately. `/api/uploads/status?id=<uuid>` provides
bounded/expiring manager-local observations, tied to the original authorization
header and exhibition ID. Missing records on another replica/restart do not prove
failure. Socket writes are not acknowledgements of backend/MinIO persistence.

Uploads are never automatically replayed after a 401, connection failure or 5xx.
Check the item list before manually retrying an uncertain result. Logs correlate
manager and backend requests using `X-Upload-Id`/`X-Request-Id`; backend processing
logs begin after multipart parsing. Tokens and file contents are not logged.

## Docker

```bash
docker build --build-arg NEXT_PUBLIC_KAKAO_REST_API_KEY=your_key -t exhibition-admin .
docker run -p 3000:3000 -e API_BASE_URL=http://backend:8080 exhibition-admin
```

Only the Kakao public key is a build argument. The image runs as numeric UID/GID
1000. Remove deployment command overrides referencing `server.mjs`.

## Verification

`npm test` checks the fixed same-origin client URL, multipart/auth preservation,
progress-event throttling, no body replay, streaming deadlines, backpressure,
cancellation and size limits. `npm run test:smoke` starts the real standard Next
production server, verifies same-origin CSP/no URL discovery, uploads multipart,
and withholds the incoming request's remaining bytes until the backend sees its
first bytes. It checks exact size and SHA-256 for a 32 MiB streamed body.

A local isolated manager-transport comparison (64 MiB, six measured alternating
runs after warm-up) yielded median 124.9 ms with the previous fetch wrapper and
74.9 ms with the low-level request transport. This is a local transport check,
not a browser/ingress/production throughput guarantee. Measure the same real files
through the manager site before and after deployment, comparing browser send time,
manager received/sent time and backend `processingMs`.

## Admin edits

Items support multipart PUT media replacement/removal and classification changes.
Exhibition edits support media replacement/removal and award/latest-period display
settings. Categories support creation, rename/order changes and deletion when not
referenced.
