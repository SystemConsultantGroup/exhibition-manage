import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const { uploadBulkItems } = await import(pathToFileURL(join(process.env.BULK_UPLOAD_TEST_BUILD, "bulk-upload-client.js")));
const result = { createdItems: 1, createdMediaAssets: 1, createdClassificationMappings: 0 };

function setup(t, { status = 200, burst = false } = {}) {
  const sends = [];
  const fetches = [];
  const original = { xhr: globalThis.XMLHttpRequest, fetch: globalThis.fetch, auth: globalThis.__bulkAuth };
  globalThis.__bulkAuth = { token: "test-token", refreshes: 0 };
  globalThis.fetch = async (url) => {
    fetches.push(url);
    assert.ok(url.startsWith("/api/uploads/status?"), "only manager observation polling is allowed");
    return Response.json({ observation: null });
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
      sends.push({ body, url: this.url, method: this.method, headers: this.headers });
      for (let loaded = 1; loaded <= (burst ? 100 : 1); loaded++) {
        this.upload.onprogress?.({ loaded, total: 100, lengthComputable: true });
      }
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

test("upload always uses manager origin and original multipart/auth, with no config round trip", async t => {
  const { sends, fetches } = setup(t);
  const progress = [];
  assert.deepEqual(await uploadBulkItems(...files(), "exhibition-id", value => progress.push(value)), result);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].url, "/api/backend/admin/items/bulk/upload");
  assert.equal(sends[0].headers.Authorization, "Bearer test-token");
  assert.equal(sends[0].headers["X-Exhibition-Id"], "exhibition-id");
  assert.equal(sends[0].body.getAll("mediaFiles").length, 1);
  assert.equal(sends[0].body.get("file").name, "items.xlsx");
  assert.ok(fetches.every(url => url.startsWith("/api/uploads/status?")));
  assert.equal(progress.at(-1).phase, "completed");
});

test("progress bursts do not re-render per event and final byte count is exact", async t => {
  setup(t, { burst: true });
  const progress = [];
  await uploadBulkItems(...files(), "exhibition-id", value => progress.push(value));
  assert.ok(progress.filter(value => value.phase === "uploading").length <= 1);
  assert.equal(progress.at(-1).loadedBytes, 100);
  assert.equal(progress.at(-1).totalBytes, 100);
  assert.equal(progress.at(-1).browserUploadFinished, true);
});

test("401 refresh never replays large body or changes route", async t => {
  const { sends } = setup(t, { status: 401 });
  await assert.rejects(uploadBulkItems(...files(), "exhibition-id"), /자동 재전송하지 않았습니다/);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].url, "/api/backend/admin/items/bulk/upload");
  assert.equal(globalThis.__bulkAuth.refreshes, 1);
});

test("duplicate filenames are rejected before any bytes are uploaded", async t => {
  const { sends } = setup(t);
  await assert.rejects(uploadBulkItems(new File(["xlsx"], "items.xlsx"), [
    new File(["one"], "same.jpg"), new File(["two"], "same.jpg"),
  ], "exhibition-id"), /중복/);
  assert.equal(sends.length, 0);
});
