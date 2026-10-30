import { Readable } from "node:stream";
import { Agent, request as streamingRequest } from "undici";
import { getBulkUploadIdleTimeoutMs, getBulkUploadResponseTimeoutMs } from "./bulk-upload-settings.mjs";
import { createBulkUploadDeadline } from "./bulk-upload-deadline.mjs";
import {
  beginUploadObservation, updateUploadObservation, watchUploadTransport, withUploadObservation,
} from "./upload-observation";

export const MAX_BULK_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;

// Phase-aware deadlines replace Undici's independent default 5-minute timers.
const uploadAgent = new Agent({
  headersTimeout: 0,
  bodyTimeout: 0,
  connect: { timeout: 10_000 },
});

export class BulkUploadProxyError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly source: string,
    public readonly uploadId: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "BulkUploadProxyError";
  }
}

function errorChain(error: unknown): { name: string; code: string | null; message: string }[] {
  const chain = [];
  let current = error;
  for (let depth = 0; current && typeof current === "object" && depth < 6; depth++) {
    const item = current as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };
    chain.push({
      name: String(item.name ?? "Error"),
      code: typeof item.code === "string" ? item.code : null,
      message: String(item.message ?? "Unknown network error"),
    });
    current = item.cause;
  }
  return chain;
}

/** Forward bytes as they arrive with backpressure; never parse/rebuild multipart. */
export async function forwardBulkUpload(
  request: Request,
  targetUrl: URL,
  headers: Headers,
  options: { idleTimeoutMs?: number; responseTimeoutMs?: number; maxBytes?: number } = {}
): Promise<Response> {
  const idleTimeoutMs = options.idleTimeoutMs ?? getBulkUploadIdleTimeoutMs();
  const responseTimeoutMs = options.responseTimeoutMs ?? getBulkUploadResponseTimeoutMs();
  const deadline = createBulkUploadDeadline({ idleTimeoutMs, responseTimeoutMs });
  const transferController = new AbortController();
  const signal = AbortSignal.any([request.signal, deadline.signal, transferController.signal]);
  const contentLength = request.headers.get("content-length");
  const entry = beginUploadObservation(
    request.headers.get("x-upload-id"), headers.get("authorization") ?? "",
    headers.get("x-exhibition-id") ?? "", contentLength ? Number(contentLength) : null,
    Math.max(idleTimeoutMs, responseTimeoutMs),
  );
  // Iterator EOF only means we read the browser body. Wait for Undici's actual
  // body-sent event before starting the backend response budget.
  const stopWatching = watchUploadTransport(entry, (event) => {
    if (event === "sent") deadline.waitForResponse();
    else deadline.uploadProgress();
  });
  const uploadId = entry.status.id;
  let bodyReadBytes = 0;
  let limitExceeded = false;
  let incomingReadError = false;
  let bodyComplete = false;
  const cleanup = () => {
    deadline.dispose();
    stopWatching();
    // Early responses can finish while the request iterator is still waiting
    // for browser bytes. Do not leave that reader/connection hanging forever.
    if (!bodyComplete) transferController.abort();
  };
  const maxBytes = options.maxBytes ?? MAX_BULK_UPLOAD_BYTES;
  console.info("Bulk upload proxy accepted", { uploadId, contentLength, idleTimeoutMs, responseTimeoutMs });

  async function* bodyChunks() {
    if (!request.body) return;
    const reader = request.body.getReader();
    const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      signal.throwIfAborted();
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try { chunk = await reader.read(); }
        catch (error) { incomingReadError = true; throw error; }
        signal.throwIfAborted();
        if (chunk.done) {
          bodyComplete = true;
          updateUploadObservation(entry, { receivingFinishedAt: Date.now() });
          break;
        }
        bodyReadBytes += chunk.value.byteLength;
        if (chunk.value.byteLength > 0) deadline.uploadProgress();
        updateUploadObservation(entry, { receivedBytes: bodyReadBytes });
        if (bodyReadBytes > maxBytes) {
          limitExceeded = true;
          throw new Error("Upload body limit exceeded");
        }
        yield chunk.value;
      }
    } finally {
      signal.removeEventListener("abort", cancel);
      if (!bodyComplete) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  const upstreamHeaders = new Headers(headers);
  if (contentLength) upstreamHeaders.set("content-length", contentLength);
  // Correlates a request at gateways/backends that already log request IDs.
  upstreamHeaders.set("x-request-id", uploadId);
  upstreamHeaders.set("x-upload-id", uploadId);

  try {
    // Low-level request consumes the byte iterator directly. Fetch would wrap it
    // in another Web stream and copy every upload chunk into a new Uint8Array.
    const upstream = await withUploadObservation(entry, () => streamingRequest(targetUrl, {
      method: "POST",
      headers: Object.fromEntries(upstreamHeaders),
      body: Readable.from(bodyChunks(), { objectMode: false, highWaterMark: 64 * 1024 }),
      signal,
      dispatcher: uploadAgent,
    }));
    // A server may reject an upload before consuming its body. In that case,
    // stop the transfer idle timer and bound delivery of the early response too.
    deadline.waitForResponse();
    updateUploadObservation(entry, {
      responseReceivedAt: Date.now(), responseStatus: upstream.statusCode,
    });
    console.info("Bulk upload upstream response headers", {
      uploadId, status: upstream.statusCode, elapsedMs: Date.now() - entry.status.startedAt,
      receivedBytes: bodyReadBytes, sentBytes: entry.status.sentBytes,
      bodyComplete, sendingFinishedAt: entry.status.sendingFinishedAt,
    });
    const responseHeaders = new Headers();
    for (const [name, value] of Object.entries(upstream.headers)) {
      if (Array.isArray(value)) value.forEach(item => responseHeaders.append(name, item));
      else if (value !== undefined) responseHeaders.set(name, value);
    }
    responseHeaders.set("X-Upload-Id", uploadId);
    if (upstream.statusCode >= 400) responseHeaders.set("X-Upload-Error-Source", "upstream_http_response");
    // Reading response headers is not the same as receiving the final result.
    // Keep observing body failures after fetch() has already resolved.
    const reader = Readable.toWeb(upstream.body).getReader();
    const responseBody = reader ? new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            cleanup();
            controller.close();
            reader.releaseLock();
            console.info("Bulk upload upstream response body complete", {
              uploadId, status: upstream.statusCode, elapsedMs: Date.now() - entry.status.startedAt,
            });
          } else controller.enqueue(value);
        } catch (error) {
          const chain = errorChain(error);
          const source = deadline.failure?.source ?? "upstream_response_stream";
          const code = chain.find(item => item.code)?.code ?? null;
          cleanup();
          updateUploadObservation(entry, { failure: {
            source, code, message: deadline.failure?.message ?? "상위 서버의 응답 본문을 받는 중 연결이 종료되었습니다.",
          } });
          console.error("Bulk upload upstream response body failed", {
            uploadId, source, code, elapsedMs: Date.now() - entry.status.startedAt, errors: chain,
          });
          reader.releaseLock();
          controller.error(error);
        }
      },
      async cancel(reason) {
        cleanup();
        await reader.cancel(reason).catch(() => {});
        reader.releaseLock();
      },
    }) : null;
    if (!reader) cleanup();
    return new Response(responseBody, {
      status: upstream.statusCode, headers: responseHeaders,
    });
  } catch (error) {
    cleanup();
    const chain = errorChain(error);
    const code = chain.find(item => item.code)?.code ?? null;
    let source = "proxy_backend_connection";
    let status = 502;
    let message = "프록시와 백엔드 사이의 요청이 실패했습니다.";
    if (limitExceeded) {
      source = "manager_size_limit"; status = 413; message = "요청 본문이 너무 큽니다.";
    } else if (deadline.failure) {
      source = deadline.failure.source; status = 504;
      message = deadline.failure.message;
    } else if (request.signal.aborted) {
      source = "client_or_gateway_disconnect";
      message = "브라우저 또는 매니저 앞단에서 연결이 종료되었습니다.";
    } else if (incomingReadError) {
      source = "manager_inbound_stream";
      message = "매니저가 업로드 본문을 수신하는 중 연결이 종료되었습니다.";
    } else if (code && ["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(code)) {
      source = "proxy_backend_connect";
      message = "매니저가 백엔드에 연결하지 못했습니다.";
    } else if (code && ["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(code)) {
      source = "proxy_backend_http_timeout"; status = 504;
      message = "프록시 HTTP 클라이언트의 백엔드 응답 대기 시간이 초과되었습니다.";
    }
    updateUploadObservation(entry, { failure: { source, code, message } });
    console.error("Bulk upload proxy failed", {
      uploadId, source, code, elapsedMs: Date.now() - entry.status.startedAt,
      receivedBytes: bodyReadBytes, sentBytes: entry.status.sentBytes,
      receivingFinishedAt: entry.status.receivingFinishedAt,
      sendingStartedAt: entry.status.sendingStartedAt,
      sendingFinishedAt: entry.status.sendingFinishedAt,
      errors: chain,
    });
    throw new BulkUploadProxyError(message, status, source, uploadId, { cause: error });
  }
}
