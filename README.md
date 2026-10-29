# Exhibition Admin

A Korean-language admin dashboard for managing online exhibitions. It supports exhibition settings, items, categories, event periods, and board posts.

## Tech stack

- Next.js 16, React 19, and TypeScript
- Tailwind CSS
- Kakao OAuth login
- External backend API (streamed through the app's same-origin proxy)

## Getting started

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Create `.env.local`:

   ```env
   API_BASE_URL=https://your-api-server.example.com
   NEXT_PUBLIC_KAKAO_REST_API_KEY=your_kakao_rest_api_key
   ```

`API_BASE_URL` is required at runtime. It is used to forward `/api/backend/*` requests to the backend API and to read tenant data.

3. Start the development server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Commands

```bash
npm run dev    # Start the development server
npm run build  # Create a production build
npm run start  # Start the production HTTP server with explicit upload timeouts
npm run lint   # Run linting
npm test       # Run upload timeout/streaming regression tests
```

## Docker

`API_BASE_URL` is read when the container handles a request, so inject it when starting the container. Only `NEXT_PUBLIC_*` values need to be supplied while building the image. Environment files are not copied into the image.

```bash
docker build \
  --build-arg NEXT_PUBLIC_KAKAO_REST_API_KEY=your_kakao_rest_api_key \
  -t exhibition-admin .

docker run -p 3000:3000 \
  -e API_BASE_URL=https://your-api-server.example.com \
  exhibition-admin
```

`NEXT_PUBLIC_*` values for existing OAuth configuration are embedded in the browser bundle. Uploads do **not** require a public API environment variable, build argument, browser CORS allowance, or public backend address. The existing runtime `API_BASE_URL` is sufficient and may point to an internal service.

## Streaming bulk uploads

```text
Browser → manager ingress → manager streaming proxy → backend → MinIO
```

The browser uses XHR to send the original `file` and repeated `mediaFiles` fields with `Authorization`, `X-Exhibition-Id`, and a random `X-Upload-Id`. The proxy starts forwarding the multipart body as bytes arrive, with backpressure. It never calls `formData()`/`arrayBuffer()` on the upload or reconstructs its multipart body. The original content length is forwarded when present; unknown-length bodies are counted and limited while streaming. No automatic retry/replay is performed, even after refreshing credentials on a 401.

The original proxy already streamed requests. These changes do not promise higher network bandwidth: they avoid whole-body buffering in the manager, reuse backend connections, preserve the content length, and replace independent HTTP client timeouts with phase-aware limits. Upstream request buffering can still prevent true end-to-end streaming.

### Observable states

The UI displays each leg separately, together with elapsed time, request ID, errors, and the final registration result:

1. **Browser → manager ingress:** browser-reported upload progress, not proof of delivery to Next.js.
2. **Manager receipt:** bytes actually read by the proxy and whether it reached the end of the incoming body.
3. **Proxy → backend connection:** body bytes written to the outbound socket and Undici's request-sent event. A socket write is not an acknowledgement by the backend or MinIO.
4. **Backend processing / MinIO:** internal progress is unavailable without backend changes. Only receipt of upstream response headers and the final successful registration response can be shown. An upstream HTTP error may originate from a gateway, not the application.

`GET /api/uploads/status?id=<upload-id>` returns local, bounded, expiring observations tied to the original authorization header and exhibition ID. The browser polls with the original credentials; it does not refresh/replay the upload. Polling failures do not interrupt the upload. Records are in-process, not shared across replicas: a request routed to another replica, a restart, or buffering before Next.js may make the observation unavailable. The UI marks missing/stale data rather than treating it as zero progress or success. Use ingress affinity for reliable live observation with multiple manager replicas, or add a shared status store separately.

### Timeouts and production entrypoint

`npm start` now runs `server.mjs`, not `next start`. Docker copies this entrypoint and its settings module. Deployments overriding the container command must use `npm start` or `node server.mjs` to receive the incoming HTTP timeout fix. This is a Node/Docker custom server, not a serverless or Next.js standalone entrypoint.

- **An actively progressing upload has no fixed total duration limit.** A slow 3 GiB upload is not cut off simply because 15 minutes elapsed.
- `BULK_UPLOAD_IDLE_TIMEOUT_MS`: default **120000 (2 minutes)** without any body bytes being read from the browser or written toward the backend. Progress refreshes this timer, including outbound socket writes under backpressure. This starts when the route begins, not while an external ingress buffers the request.
- `BULK_UPLOAD_RESPONSE_TIMEOUT_MS`: default **900000 (15 minutes)** for the upstream response, including its body. This budget starts only when Undici reports the request body sent, **not** when forwarding starts or when the browser body is merely read. Early upstream responses also enter this phase. Upload progress cannot extend this response budget.
- The legacy `BULK_UPLOAD_TIMEOUT_MS` is retained as the response timeout fallback; it no longer limits active upload duration. All settings are read at runtime.
- The custom HTTP server disables Node's server-wide absolute request-body deadline. Ordinary, non-bulk requests retain an explicit **5-minute** incoming-body deadline. Header receipt still has a **60-second** deadline. Bulk transfers are bounded by the proxy's inactivity timer instead. A last-resort socket inactivity limit (the larger phase timeout plus 60 seconds) also bounds connections rejected before the bulk proxy starts; it is not a total upload duration limit.
- The bulk transport uses its own Undici agent: `headersTimeout: 0`, `bodyTimeout: 0`, connect timeout **10 seconds**, and the phase-aware limits above. This avoids Undici's independent default **300-second** header/body timers.
- Other API routes keep their existing two-minute upstream deadline. Streaming upload size limit: **10 GiB**. Backend and gateway limits remain independent.

### Diagnose an early timeout (no backend changes)

Search manager logs by the UI's request ID. Tokens and file contents are not logged.

| Log / error source | What is actually known |
| --- | --- |
| `Bulk upload incoming HTTP headers` | The manager HTTP server received the request headers. If absent, investigate routing, ingress buffering/timeouts, pod restarts, and whether these logs cover the right pod. |
| `Bulk upload proxy accepted` | The route passed validation and began the outbound operation. |
| `Bulk upload incoming HTTP body complete` | Node received the incoming body. |
| `Bulk upload upstream socket body sent` | The proxy finished writing the outbound request. Not proof of backend storage. |
| `Bulk upload upstream response headers` | An upstream application or gateway returned an HTTP status. |
| `manager_inbound_request_timeout` / `ERR_HTTP_REQUEST_TIMEOUT` | The manager's incoming HTTP request-body timer expired. |
| `manager_upload_idle_timeout` | No upload body progress in either direction for the configured inactivity interval. Counters locate the last observed leg; downstream backpressure can stall receipt too. |
| `manager_response_deadline` | The separate response budget expired after outbound body completion (or an early upstream response). |
| `manager_connection_idle_timeout` | The custom server's last-resort socket inactivity guard closed a connection. |
| `manager_upload_deadline` (older deployments) | The old absolute deadline included active upload time and could cut off a partially received body. Removed by the phase-aware timeout change. |
| `proxy_backend_connect` | Connect/DNS failure, including `UND_ERR_CONNECT_TIMEOUT`, `ECONNREFUSED`, `ENOTFOUND`, or `EAI_AGAIN`. |
| `proxy_backend_http_timeout` | HTTP client timer, with `UND_ERR_HEADERS_TIMEOUT` or `UND_ERR_BODY_TIMEOUT`. |
| `client_or_gateway_disconnect` / `manager_inbound_stream` | The downstream connection/body stream ended. This alone cannot identify whether the browser or gateway caused it. |
| `upstream_http_response` | An upstream HTTP error was returned; it cannot be attributed to the backend application without its gateway/access logs. |

Failures include elapsed time, bytes read/written, completion timestamps, and nested network error codes in manager logs. Manager-generated transport error responses carry `X-Upload-Error-Source` and `X-Upload-Id`. Errors generated before reaching the manager may not have these headers. A client-visible 408/502/504 without these headers is not sufficient to locate its source. After connection loss or a server error, check the item list before manually retrying to avoid duplicate registration.

Both Node's incoming-body default and Undici's header wait default are concrete **five-minute candidates**, not a confirmed diagnosis of any past incident. A backend controller may also have no logs until multipart parsing finishes, so the absence of application logs does not prove the backend received no bytes. Confirm with the request ID, elapsed time, and ingress/backend access logs.

### Infrastructure settings outside this repository

App code cannot disable buffering or extend deadlines in an external ingress/gateway. For ingress-nginx, review `proxy-request-buffering: "off"`, `proxy-body-size`, `proxy-read-timeout`, and `proxy-send-timeout`, and the controller's client-body timeout. The manager ingress needs to allow the long wait for a registration response; any backend ingress on `API_BASE_URL` needs compatible limits too. Use this deployment's annotation namespace and units rather than applying these blindly. If `API_BASE_URL` can reach the internal backend service directly, use that to avoid an unnecessary external gateway hop.

`npm test` exercises phase-aware timers and the actual Undici proxy against local HTTP servers, including slow progressing uploads, stalled transfers, and response deadlines. These local checks do not measure production throughput or verify ingress settings.

## Project structure

```text
src/app/         Pages, layouts, and API proxy routes
src/components/  Authentication, exhibition state, and admin UI components
src/lib/         API helpers, authentication helpers, and TypeScript types
```

## Authentication

Administrators sign in with Kakao. The Kakao app's redirect URI must be registered as `<current-domain>/login` (for example, `http://localhost:3000/login`); users without a completed profile are sent to the registration page.
