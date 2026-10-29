import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import next from "next";
import { getBulkUploadIdleTimeoutMs, getBulkUploadResponseTimeoutMs } from "./src/lib/server/bulk-upload-settings.mjs";
import { enforceIncomingRequestDeadline, incomingHttpTimeouts } from "./src/lib/server/incoming-request-deadline.mjs";

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || "0.0.0.0";
const uploadIdleTimeoutMs = getBulkUploadIdleTimeoutMs();
const uploadResponseTimeoutMs = getBulkUploadResponseTimeoutMs();
const app = next({ dev: false, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();
const sockets = new WeakMap();

const server = createServer(incomingHttpTimeouts, (req, res) => {
  const isBulk = req.method === "POST" && req.url?.split("?")[0] === "/api/backend/admin/items/bulk/upload";
  if (isBulk) {
    const incomingId = req.headers["x-upload-id"];
    const id = typeof incomingId === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(incomingId) ? incomingId : randomUUID();
    req.headers["x-upload-id"] = id;
    const startedAt = Date.now();
    sockets.set(req.socket, { uploadId: id, startedAt });
    const log = (event, extra = {}) => console.info(event, {
      uploadId: id, elapsedMs: Date.now() - startedAt, ...extra,
    });
    log("Bulk upload incoming HTTP headers", { contentLength: req.headers["content-length"] ?? null });
    req.once("end", () => log("Bulk upload incoming HTTP body complete"));
    req.once("aborted", () => log("Bulk upload incoming HTTP aborted", { source: "manager_inbound_connection" }));
    res.once("finish", () => {
      log("Bulk upload outgoing HTTP response complete", { status: res.statusCode });
      sockets.delete(req.socket);
    });
    res.once("close", () => {
      if (!res.writableFinished) log("Bulk upload client connection closed before response completed");
      sockets.delete(req.socket);
    });
  } else {
    enforceIncomingRequestDeadline(req, res, {
      onTimeout: () => console.error("Manager incoming HTTP body deadline expired", {
        source: "manager_inbound_request_timeout",
      }),
    });
  }
  void handle(req, res).catch((error) => {
    console.error("Manager request handler failed", error);
    if (!res.headersSent) { res.statusCode = 500; res.end("Internal Server Error"); }
    else res.destroy();
  });
});

// Last-resort socket *inactivity* protection, including requests rejected before
// the bulk route starts. Never impose an absolute duration on an active upload.
server.setTimeout(Math.min(2_147_483_647, Math.max(uploadIdleTimeoutMs, uploadResponseTimeoutMs) + 60_000));
server.on("timeout", (socket) => {
  const meta = sockets.get(socket);
  console.error("Manager HTTP socket inactive", {
    uploadId: meta?.uploadId ?? null,
    source: "manager_connection_idle_timeout",
  });
  socket.destroy();
});

server.on("clientError", (error, socket) => {
  const meta = sockets.get(socket);
  const timeout = error.code === "ERR_HTTP_REQUEST_TIMEOUT";
  console.error("Manager incoming HTTP error", {
    uploadId: meta?.uploadId ?? null,
    elapsedMs: meta ? Date.now() - meta.startedAt : null,
    source: timeout ? "manager_inbound_request_timeout" : "manager_inbound_connection",
    code: error.code, message: error.message,
  });
  if (socket.writable) {
    const status = timeout ? "408 Request Timeout" : error.code === "HPE_HEADER_OVERFLOW" ? "431 Request Header Fields Too Large" : "400 Bad Request";
    const source = timeout ? "manager_inbound_request_timeout" : "manager_inbound_connection";
    const idHeader = meta ? `X-Upload-Id: ${meta.uploadId}\r\n` : "";
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nX-Upload-Error-Source: ${source}\r\n${idHeader}Content-Length: 0\r\n\r\n`);
  } else socket.destroy();
});
server.listen(port, hostname, () => {
  console.info("Manager listening", {
    hostname, port, incomingRequestTimeoutMs: server.requestTimeout,
    ordinaryIncomingRequestTimeoutMs: 300_000, socketIdleTimeoutMs: server.timeout,
    uploadIdleTimeoutMs, uploadResponseTimeoutMs,
  });
});
