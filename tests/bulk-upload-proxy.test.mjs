import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const build = process.env.BULK_UPLOAD_TEST_BUILD;
const { forwardBulkUpload, BulkUploadProxyError } = await import(pathToFileURL(join(build, "bulk-upload-proxy.js")));
const { beginUploadObservation, updateUploadObservation, getUploadObservation } = await import(pathToFileURL(join(build, "upload-observation.js")));
const authorization = "Bearer regression-test";
const exhibitionId = randomUUID();

async function serve(t, handler, options = {}) {
  const server = createServer(options, handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { server, url: new URL(`http://127.0.0.1:${server.address().port}/upload`) };
}

function upload(body, options = {}) {
  const id = randomUUID();
  const headers = new Headers({
    authorization, "x-exhibition-id": exhibitionId,
    "x-upload-id": id, "content-type": "multipart/form-data; boundary=test",
    ...options.headers,
  });
  const request = new Request("http://manager/api/backend/admin/items/bulk/upload", {
    method: "POST", headers, body, duplex: "half", signal: options.signal,
  });
  return { id, request, headers };
}

function observation(id) { return getUploadObservation(id, authorization, exhibitionId); }
function expectedFailure(source, status = 504) {
  return error => error instanceof BulkUploadProxyError && error.source === source && error.status === status;
}

// A stream with one chunk, then no more data until cancelled.
function stalledBody() {
  let cancelled = false;
  return {
    stream: new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); },
      cancel() { cancelled = true; },
    }),
    get cancelled() { return cancelled; },
  };
}

test("actual streaming upload can outlast the response budget and still succeed", async t => {
  let bytes = 0;
  const { url } = await serve(t, (req, res) => {
    req.on("data", chunk => { bytes += chunk.length; });
    req.on("end", () => {
      setTimeout(() => res.end('{"ok":true}'), 60);
    });
  });
  let produced = 0;
  let cancelled = false;
  const body = new ReadableStream({
    async pull(controller) {
      await delay(80);
      if (cancelled) return;
      if (produced++ < 6) controller.enqueue(new Uint8Array(4096).fill(produced));
      else controller.close();
    },
    cancel() { cancelled = true; },
  });
  const { id, request, headers } = upload(body);
  const startedAt = Date.now();
  const response = await forwardBulkUpload(request, url, headers, { idleTimeoutMs: 500, responseTimeoutMs: 250 });
  assert.deepEqual(await response.json(), { ok: true });
  assert.ok(Date.now() - startedAt > 250);
  assert.equal(bytes, 6 * 4096);
  const status = observation(id);
  assert.equal(status.receivedBytes, bytes);
  assert.equal(status.sentBytes, bytes);
  assert.ok(status.receivingFinishedAt);
  assert.ok(status.sendingFinishedAt >= status.receivingFinishedAt);
  assert.equal(status.failure, null);
});

test("stalled incoming body is cancelled with an upload-idle diagnostic", async t => {
  const { url } = await serve(t, req => req.resume());
  const body = stalledBody();
  const { id, request, headers } = upload(body.stream);
  await assert.rejects(forwardBulkUpload(request, url, headers, {
    idleTimeoutMs: 150, responseTimeoutMs: 50,
  }), expectedFailure("manager_upload_idle_timeout"));
  assert.equal(body.cancelled, true);
  assert.equal(observation(id).receivingFinishedAt, null);
  assert.equal(observation(id).failure.source, "manager_upload_idle_timeout");
});

test("backend backpressure eventually expires the transfer-idle timer", async t => {
  const { url } = await serve(t, req => req.pause());
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(64 * 1024)); },
    cancel() { cancelled = true; },
  });
  const { id, request, headers } = upload(body);
  await assert.rejects(forwardBulkUpload(request, url, headers, {
    idleTimeoutMs: 200, responseTimeoutMs: 50,
  }), expectedFailure("manager_upload_idle_timeout"));
  // Undici may finish returning the upload iterator on a later turn.
  for (let attempt = 0; attempt < 20 && !cancelled; attempt++) await delay(10);
  assert.equal(cancelled, true);
  assert.ok(observation(id).receivedBytes > 0);
  assert.equal(observation(id).sendingFinishedAt, null);
});

test("post-upload wait uses the response timer, not the shorter transfer-idle timer", async t => {
  const { url } = await serve(t, req => req.resume());
  const { id, request, headers } = upload(new Uint8Array([1, 2, 3]));
  await assert.rejects(forwardBulkUpload(request, url, headers, {
    idleTimeoutMs: 75, responseTimeoutMs: 200,
  }), expectedFailure("manager_response_deadline"));
  assert.ok(observation(id).receivingFinishedAt);
  assert.ok(observation(id).sendingFinishedAt);
  assert.equal(observation(id).failure.source, "manager_response_deadline");
});

test("response-body stalls remain bounded after headers have arrived", async t => {
  const { url } = await serve(t, (req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write("{");
    });
  });
  const { id, request, headers } = upload(new Uint8Array([1]));
  const response = await forwardBulkUpload(request, url, headers, {
    idleTimeoutMs: 500, responseTimeoutMs: 150,
  });
  await assert.rejects(response.text());
  assert.equal(observation(id).failure.source, "manager_response_deadline");
});

test("an early upstream rejection is delivered without waiting for upload EOF", async t => {
  const { url } = await serve(t, (_req, res) => {
    res.writeHead(413, { "content-type": "application/json" });
    res.end('{"message":"rejected"}');
  });
  const body = stalledBody();
  const { id, request, headers } = upload(body.stream);
  const response = await forwardBulkUpload(request, url, headers, {
    idleTimeoutMs: 200, responseTimeoutMs: 200,
  });
  assert.equal(response.status, 413);
  assert.equal(response.headers.get("x-upload-error-source"), "upstream_http_response");
  assert.deepEqual(await response.json(), { message: "rejected" });
  await delay(250);
  assert.equal(observation(id).failure, null);
  assert.equal(body.cancelled, true);
});

test("client cancellation is not reported as a manager timeout", async t => {
  const { url } = await serve(t, req => req.resume());
  const controller = new AbortController();
  const body = stalledBody();
  const { request, headers } = upload(body.stream, { signal: controller.signal });
  const result = forwardBulkUpload(request, url, headers, { idleTimeoutMs: 1000 });
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(result, expectedFailure("client_or_gateway_disconnect", 502));
  assert.equal(body.cancelled, true);
});

test("streamed size limits still reject oversized uploads", async t => {
  const { url } = await serve(t, req => req.resume());
  const { request, headers } = upload(new Uint8Array([1, 2, 3]));
  await assert.rejects(forwardBulkUpload(request, url, headers, { maxBytes: 2 }),
    expectedFailure("manager_size_limit", 413));
});

test("proxy preserves content length and correlates the backend upload ID", async t => {
  let receivedHeaders;
  const { url } = await serve(t, (req, res) => {
    receivedHeaders = req.headers;
    req.resume();
    req.on("end", () => res.end("ok"));
  });
  const { id, request, headers } = upload(new Uint8Array([1, 2, 3]), { headers: { "content-length": "3" } });
  const response = await forwardBulkUpload(request, url, headers);
  assert.equal(await response.text(), "ok");
  assert.equal(receivedHeaders["content-length"], "3");
  assert.equal(receivedHeaders["x-upload-id"], id);
  assert.equal(receivedHeaders["x-request-id"], id);
  assert.equal(receivedHeaders.authorization, authorization);
});

test("backend redirects are returned without replaying the upload elsewhere", async t => {
  let requests = 0;
  const { url } = await serve(t, (req, res) => {
    requests++;
    req.resume();
    res.writeHead(307, { location: "/different-upload" });
    res.end("redirect refused");
  });
  const { request, headers } = upload(new Uint8Array([1, 2, 3]));
  const response = await forwardBulkUpload(request, url, headers);
  assert.equal(response.status, 307);
  assert.equal(await response.text(), "redirect refused");
  assert.equal(requests, 1);
});

test("active upload observations survive their original expiration time", t => {
  t.mock.timers.enable({ apis: ["Date"] });
  const id = randomUUID();
  const entry = beginUploadObservation(id, authorization, exhibitionId, null, 1000);
  t.mock.timers.tick(300_000);
  updateUploadObservation(entry, { receivedBytes: 1 });
  t.mock.timers.tick(2000);
  assert.equal(observation(id).receivedBytes, 1);
  t.mock.timers.tick(300_000);
  assert.equal(observation(id), null);
});

