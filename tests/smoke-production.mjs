// Requires npm run build. Exercise the real standard Next production entrypoint.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(packageJson.scripts.start, "next start");
await assert.rejects(access(new URL("../server.mjs", import.meta.url)));
const received = [];
const backend = createServer((req, res) => {
  let bytes = 0;
  req.on("data", chunk => { bytes += chunk.length; });
  req.on("end", () => {
    received.push({ bytes, path: req.url, headers: req.headers });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ createdItems: 1, createdMediaAssets: 1, createdClassificationMappings: 0 }));
  });
});
await new Promise(resolve => backend.listen(0, "127.0.0.1", resolve));
const backendUrl = `http://127.0.0.1:${backend.address().port}`;

async function run(direct) {
  // Reserve a random available local port, then hand it to Next.
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  let logs = "";
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: root, env: { ...process.env, API_BASE_URL: backendUrl, BULK_UPLOAD_API_BASE_URL: direct ? backendUrl : "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", chunk => { logs += chunk; });
  child.stderr.on("data", chunk => { logs += chunk; });
  const managerUrl = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(logs);
      try { ready = (await fetch(`${managerUrl}/api/uploads/config`)).ok; } catch { /* startup */ }
      if (ready) break;
      await delay(100);
    }
    assert.ok(ready, `Next did not become ready: ${logs}`);
    const configResponse = await fetch(`${managerUrl}/api/uploads/config`);
    assert.match(configResponse.headers.get("cache-control"), /no-store/);
    const { uploadUrl } = await configResponse.json();
    assert.equal(uploadUrl, direct ? `${backendUrl}/admin/items/bulk/upload` : null);
    const page = await fetch(`${managerUrl}/login`);
    assert.equal(page.status, 200);
    const csp = page.headers.get("content-security-policy");
    assert.ok(csp);
    assert.equal(csp.includes(backendUrl), direct, "CSP must reflect runtime, not build-time, target");
    const body = new FormData();
    body.append("file", new File(["workbook"], "items.xlsx"));
    body.append("mediaFiles", new File([new Uint8Array(1024 * 1024)], "sample.jpg"));
    const response = await fetch(uploadUrl ?? `${managerUrl}/api/backend/admin/items/bulk/upload`, {
      method: "POST", body,
      headers: { Authorization: "Bearer smoke-test", "X-Exhibition-Id": "12345678-1234-1234-1234-123456789abc" },
    });
    assert.equal(response.status, 200, await response.text());
    const last = received.at(-1);
    assert.equal(last.path, "/admin/items/bulk/upload");
    assert.ok(last.bytes > 1024 * 1024);
    assert.equal(last.headers.authorization, "Bearer smoke-test");
    assert.match(last.headers["content-type"], /multipart\/form-data; boundary=/);
    console.info(`PASS standard Next production: ${direct ? "direct" : "proxy fallback"}, runtime CSP, 1 MiB multipart`);
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await new Promise(resolve => child.once("exit", resolve));
  }
}

try {
  await run(true);
  await run(false);
} finally {
  backend.closeAllConnections();
  await new Promise(resolve => backend.close(resolve));
}
