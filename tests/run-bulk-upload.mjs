import { mkdtemp, readFile, writeFile, copyFile, symlink, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

// Test the same TS implementation used by Next, without running a Next server
// or adding a TS runtime dependency. Type checking remains `tsc --noEmit`.
const root = fileURLToPath(new URL("../", import.meta.url));
const build = await mkdtemp(join(tmpdir(), "exhibition-upload-tests-"));
try {
  await writeFile(join(build, "package.json"), JSON.stringify({ type: "module" }));
  await symlink(join(root, "node_modules"), join(build, "node_modules"), "dir");
  for (const name of ["bulk-upload-proxy", "upload-observation", "bulk-upload-target", "proxy-security"]) {
    const source = await readFile(join(root, "src/lib/server", `${name}.ts`), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    });
    // Next resolves extensionless TS imports; native Node ESM needs .js.
    const output = outputText.replace(/(from\s+["'])(\.[^"']+)(["'])/g,
      (_, prefix, specifier, suffix) => `${prefix}${specifier}${extname(specifier) ? "" : ".js"}${suffix}`);
    await writeFile(join(build, `${name}.js`), output);
  }
  for (const name of ["bulk-upload-settings", "bulk-upload-deadline"]) {
    await copyFile(join(root, "src/lib/server", `${name}.mjs`), join(build, `${name}.mjs`));
  }
  const clientSource = await readFile(join(root, "src/lib/bulk-upload.ts"), "utf8");
  const client = ts.transpileModule(clientSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace('from "./auth"', 'from "./auth-test.js"');
  await writeFile(join(build, "bulk-upload-client.js"), client);
  await writeFile(join(build, "auth-test.js"), `
    export async function ensureAccessToken() { return globalThis.__bulkAuth.token; }
    export async function refreshAccessTokenAfterUnauthorized() { globalThis.__bulkAuth.refreshes++; return "new-token"; }
  `);
  const tests = (await readdir(join(root, "tests"))).filter(name => name.endsWith(".test.mjs"));
  const result = spawnSync(process.execPath, ["--test", ...tests.map(name => join(root, "tests", name))], {
    cwd: root, stdio: "inherit", env: { ...process.env, BULK_UPLOAD_TEST_BUILD: build },
  });
  process.exitCode = result.status ?? 1;
  if (result.error) console.error(result.error);
} finally {
  await rm(build, { recursive: true, force: true });
}
