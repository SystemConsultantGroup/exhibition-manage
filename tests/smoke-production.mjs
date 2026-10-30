// Requires npm run build. Verify the complete manager-only production data path.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, access } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(packageJson.scripts.start, "next start");
await assert.rejects(access(new URL("../server.mjs", import.meta.url)));
const received = [];
let firstBackendByte;
const backend = createServer((req, res) => {
  let bytes = 0;
  const hash = createHash("sha256");
  req.on("data", chunk => {
    firstBackendByte?.();
    bytes += chunk.length;
    hash.update(chunk);
  });
  req.on("end", () => {
    received.push({ bytes, digest: hash.digest("hex"), path: req.url, headers: req.headers, socket: req.socket.remotePort });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ createdItems: 1, createdMediaAssets: 1, createdClassificationMappings: 0 }));
  });
});
await new Promise(resolve => backend.listen(0, "127.0.0.1", resolve));
const backendUrl = `http://127.0.0.1:${backend.address().port}`;
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
let logs = "";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
  cwd: root, env: { ...process.env, API_BASE_URL: backendUrl }, stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", chunk => { logs += chunk; });
child.stderr.on("data", chunk => { logs += chunk; });
const managerUrl = `http://127.0.0.1:${port}`;
const headers = { Authorization: "Bearer smoke-test", "X-Exhibition-Id": randomUUID() };

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(logs);
    try { ready = (await fetch(`${managerUrl}/login`)).ok; } catch { /* startup */ }
    if (ready) break;
    await delay(100);
  }
  assert.ok(ready, `Next did not become ready: ${logs}`);
  const page = await fetch(`${managerUrl}/login`);
  const csp = page.headers.get("content-security-policy");
  assert.match(csp, /connect-src 'self';/);
  assert.ok(!csp.includes(backendUrl), "browser must not be allowed to connect to the backend");
  const removedRoute = await fetch(`${managerUrl}/api/uploads/config`);
  assert.equal(removedRoute.status, 404, "public backend upload URL must not be exposed");

  const body = new FormData();
  body.append("file", new File(["workbook"], "items.xlsx"));
  body.append("mediaFiles", new File([new Uint8Array(1024 * 1024)], "sample.jpg"));
  const response = await fetch(`${managerUrl}/api/backend/admin/items/bulk/upload`, { method: "POST", body, headers });
  assert.equal(response.status, 200, await response.text());
  const first = received.at(-1);
  assert.equal(first.path, "/admin/items/bulk/upload");
  assert.ok(first.bytes > 1024 * 1024);
  assert.equal(first.headers.authorization, headers.Authorization);
  assert.match(first.headers["content-type"], /multipart\/form-data; boundary=/);
  console.info("PASS manager-only multipart, same-origin CSP, no public upload configuration");

  // Do not finish the incoming body until backend receipt is proven. This fails
  // if any manager layer waits for or buffers the whole request before forwarding.
  let release;
  const backendStarted = new Promise(resolve => { release = resolve; });
  firstBackendByte = release;
  const expectedHash = createHash("sha256");
  const chunk = new Uint8Array(64 * 1024).fill(0x5a);
  const totalChunks = 512;
  let produced = 0;
  const streamed = new ReadableStream({
    async pull(controller) {
      if (produced === 1) {
        await Promise.race([backendStarted, delay(5000).then(() => { throw new Error("Manager buffered the request instead of streaming"); })]);
      }
      if (produced++ < totalChunks) {
        expectedHash.update(chunk);
        controller.enqueue(chunk);
      } else controller.close();
    },
  });
  const start = performance.now();
  const streamedResponse = await fetch(`${managerUrl}/api/backend/admin/items/bulk/upload`, {
    method: "POST", body: streamed, duplex: "half", headers: { ...headers, "Content-Type": "application/octet-stream" },
  });
  assert.equal(streamedResponse.status, 200, await streamedResponse.text());
  const last = received.at(-1);
  assert.equal(last.bytes, totalChunks * chunk.length);
  assert.equal(last.digest, expectedHash.digest("hex"));
  console.info(`PASS manager forwards before incoming EOF; 32 MiB exact byte/hash match in ${(performance.now() - start).toFixed(1)} ms (local only)`);
} finally {
  child.kill("SIGTERM");
  if (child.exitCode === null) await new Promise(resolve => child.once("exit", resolve));
  backend.closeAllConnections();
  await new Promise(resolve => backend.close(resolve));
}
