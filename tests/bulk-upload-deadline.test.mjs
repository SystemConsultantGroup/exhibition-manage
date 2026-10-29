import test from "node:test";
import assert from "node:assert/strict";
import { createBulkUploadDeadline } from "../src/lib/server/bulk-upload-deadline.mjs";
import {
  getBulkUploadIdleTimeoutMs, getBulkUploadResponseTimeoutMs, getBulkUploadTimeoutMs,
} from "../src/lib/server/bulk-upload-settings.mjs";

function setup(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const deadline = createBulkUploadDeadline({ idleTimeoutMs: 120_000, responseTimeoutMs: 900_000 });
  t.after(() => deadline.dispose());
  return deadline;
}

test("active upload survives well beyond the former 15-minute total limit", t => {
  const deadline = setup(t);
  for (let minute = 0; minute < 60; minute++) {
    t.mock.timers.tick(60_000);
    assert.equal(deadline.signal.aborted, false);
    deadline.uploadProgress();
  }
  assert.equal(deadline.failure, null);
});

test("a stalled transfer expires only after the full inactivity interval", t => {
  const deadline = setup(t);
  t.mock.timers.tick(100_000);
  deadline.uploadProgress();
  t.mock.timers.tick(119_999);
  assert.equal(deadline.signal.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(deadline.signal.aborted, true);
  assert.equal(deadline.failure.source, "manager_upload_idle_timeout");
  deadline.uploadProgress();
  deadline.waitForResponse();
  assert.equal(deadline.failure.source, "manager_upload_idle_timeout");
});

test("body-sent starts a fresh response budget, unaffected by later progress", t => {
  const deadline = setup(t);
  for (let minute = 0; minute < 20; minute++) {
    t.mock.timers.tick(60_000);
    deadline.uploadProgress();
  }
  deadline.waitForResponse();
  t.mock.timers.tick(899_999);
  assert.equal(deadline.signal.aborted, false);
  deadline.uploadProgress();
  deadline.waitForResponse(); // early headers must not restart the response timer
  t.mock.timers.tick(1);
  assert.equal(deadline.signal.aborted, true);
  assert.equal(deadline.failure.source, "manager_response_deadline");
});

test("cleanup prevents timeouts after success, failure, or cancellation", t => {
  const deadline = setup(t);
  deadline.dispose();
  deadline.uploadProgress();
  deadline.waitForResponse();
  t.mock.timers.tick(3_600_000);
  assert.equal(deadline.signal.aborted, false);
  assert.equal(deadline.failure, null);
});

test("settings validate values and retain the legacy response fallback", t => {
  const original = process.env.BULK_UPLOAD_TIMEOUT_MS;
  process.env.BULK_UPLOAD_TIMEOUT_MS = "123456";
  t.after(() => {
    if (original === undefined) delete process.env.BULK_UPLOAD_TIMEOUT_MS;
    else process.env.BULK_UPLOAD_TIMEOUT_MS = original;
  });
  assert.equal(getBulkUploadResponseTimeoutMs(""), 123456);
  assert.equal(getBulkUploadResponseTimeoutMs("234567"), 234567);
  for (const value of ["", "0", "-1", "bad", "1.5", "2147483648"]) {
    assert.equal(getBulkUploadIdleTimeoutMs(value), 120000);
  }
  assert.equal(getBulkUploadTimeoutMs("bad"), 900000);
});
