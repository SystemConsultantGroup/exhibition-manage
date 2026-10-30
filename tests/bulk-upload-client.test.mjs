import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const { uploadBulkItems } = await import(pathToFileURL(join(process.env.BULK_UPLOAD_TEST_BUILD, "bulk-upload-client.js")));
const result = { createdItems: 1, createdMediaAssets: 1, createdClassificationMappings: 0 };

function setup(t, { direct = true, status = 200 } = {}) {
  const sends = [];
  const fetches = [];
  const original = { xhr: globalThis.XMLHttpRequest, fetch: globalThis.fetch, auth: globalThis.__bulkAuth };
  globalThis.__bulkAuth = { token: "test-token", refreshes: 0 };
  globalThis.fetch = async (url) => {
    fetches.push(url);
    return Response.json(url === "/api/uploads/config"
      ? { uploadUrl: direct ? "https://api.example.com/admin/items/bulk/upload" : null }
      : { observation: null });
  };
  globalThis.XMLHttpRequest = class {
    upload = {};
    headers = {};
    status = status;
    responseText = JSON.stringify(status === 200 ? result : { message: "rejected" });
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    getResponseHeader() { return null; }
    send(body) {
      sends.push({ body, url: this.url, method: this.method, headers: this.headers, credentials: this.withCredentials });
      this.upload.onprogress?.({ loaded: 100, total: 100, lengthComputable: true });
      this.upload.onload?.({ loaded: 100, total: 100, lengthComputable: true });
      this.onload();
    }
  };
  t.after(() => {
    globalThis.XMLHttpRequest = original.xhr;
    globalThis.fetch = original.fetch;
    globalThis.__bulkAuth = original.auth;
  });
  return { sends, fetches };
}

function files() {
  return [new File(["xlsx"], "items.xlsx"), [new File(["image"], "thumb.jpg")]];
}

test("direct upload bypasses manager body/progress proxy and preserves multipart/auth", async t => {
  const { sends, fetches } = setup(t);
  const progress = [];
  assert.deepEqual(await uploadBulkItems(...files(), "exhibition-id", value => progress.push(value)), result);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].url, "https://api.example.com/admin/items/bulk/upload");
  assert.equal(sends[0].headers.Authorization, "Bearer test-token");
  assert.equal(sends[0].headers["X-Exhibition-Id"], "exhibition-id");
  assert.equal(sends[0].credentials, false);
  assert.equal(sends[0].body.getAll("mediaFiles").length, 1);
  assert.equal(sends[0].body.get("file").name, "items.xlsx");
  assert.deepEqual(fetches, ["/api/uploads/config"]);
  assert.equal(progress.at(-1).transport, "direct");
  assert.equal(progress.at(-1).phase, "completed");
});

test("unconfigured deployment keeps same-origin streaming fallback", async t => {
  const { sends, fetches } = setup(t, { direct: false });
  assert.deepEqual(await uploadBulkItems(...files(), "exhibition-id"), result);
  assert.equal(sends[0].url, "/api/backend/admin/items/bulk/upload");
  assert.ok(fetches.some(url => url.startsWith("/api/uploads/status")));
});

test("401 refresh never replays large body or switches transport", async t => {
  const { sends } = setup(t, { status: 401 });
  await assert.rejects(uploadBulkItems(...files(), "exhibition-id"), /자동 재전송하지 않았습니다/);
  assert.equal(sends.length, 1);
  assert.equal(globalThis.__bulkAuth.refreshes, 1);
});

test("duplicate filenames are rejected before any bytes are uploaded", async t => {
  const { sends } = setup(t);
  await assert.rejects(uploadBulkItems(new File(["xlsx"], "items.xlsx"), [
    new File(["one"], "same.jpg"), new File(["two"], "same.jpg"),
  ], "exhibition-id"), /중복/);
  assert.equal(sends.length, 0);
});

test("a failed runtime configuration never sends the token to a guessed URL", async t => {
  const { sends } = setup(t);
  globalThis.fetch = async () => new Response("error", { status: 500 });
  await assert.rejects(uploadBulkItems(...files(), "exhibition-id"), /연결 설정/);
  assert.equal(sends.length, 0);
});
