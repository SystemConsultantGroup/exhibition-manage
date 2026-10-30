import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const { getDirectBulkUploadTarget, uploadContentSecurityPolicy } = await import(
  pathToFileURL(join(process.env.BULK_UPLOAD_TEST_BUILD, "bulk-upload-target.js"))
);

test("runtime direct target preserves API prefix and never exposes internal API by default", () => {
  assert.equal(getDirectBulkUploadTarget(undefined), null);
  assert.equal(getDirectBulkUploadTarget("https://api.example.com/v1").href,
    "https://api.example.com/v1/admin/items/bulk/upload");
  assert.equal(getDirectBulkUploadTarget("http://localhost:8080").origin, "http://localhost:8080");
  for (const value of ["http://api.example.com", "https://user:pass@api.example.com", "https://api.example.com?q=1",
    "https://api.example.com/#fragment", "file:///tmp/socket", "not-a-url"]) {
    assert.throws(() => getDirectBulkUploadTarget(value));
  }
});

test("CSP permits only configured API origin and keeps other directives", () => {
  assert.match(uploadContentSecurityPolicy("https://api.example.com/v1"), /connect-src 'self' https:\/\/api.example.com;/);
  assert.match(uploadContentSecurityPolicy(undefined), /connect-src 'self';/);
  assert.match(uploadContentSecurityPolicy(undefined), /object-src 'none'/);
  assert.match(uploadContentSecurityPolicy(undefined), /frame-ancestors 'none'/);
  assert.doesNotMatch(uploadContentSecurityPolicy("https://api.example.com"), /connect-src[^;]*\*/);
});
