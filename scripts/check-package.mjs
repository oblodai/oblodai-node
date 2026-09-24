// Packaging gate: pack the package, install the tarball into a scratch consumer and use it the way
// integrators will — `import` and `require` at run time, and TypeScript (NodeNext) type checks for
// both module systems, including the long-running-operation waiters on the generated models.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const work = mkdtempSync(join(tmpdir(), "oblodai-node-pack-"));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: "pipe" });

try {
  const [packed] = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", work], ROOT));
  const files = packed.files.map((f) => f.path);
  for (const want of [
    "dist/index.js",
    "dist/index.cjs",
    "dist/types/esm/index.d.ts",
    "dist/types/cjs/index.d.ts",
    "dist/types/esm/generated/models.d.ts",
    "README.md",
    "MIGRATION-2.0.md",
    "AGENTS.md",
    "LICENSE",
  ]) {
    if (!files.includes(want)) throw new Error(`package is missing ${want}`);
  }
  const stray = files.filter((f) => f.startsWith("src/") || f.startsWith("test/"));
  if (stray.length) throw new Error(`package carries sources: ${stray.slice(0, 5).join(", ")}`);

  const consumer = join(work, "consumer");
  run("mkdir", ["-p", consumer]);
  writeFileSync(join(consumer, "package.json"), '{ "name": "consumer", "private": true }\n');
  run(
    "npm",
    ["install", "--no-audit", "--no-fund", "--offline", join(work, packed.filename)],
    consumer,
  );

  const fake = `async (url) => new Response(JSON.stringify({ state: 0, result: { batch_id: "b-1", status: "completed", url } }), { status: 200, headers: { "content-type": "application/json" } })`;
  const body = (lib, hooks) => `
const client = new lib.Oblodai({ publicId: "pk", secret: "s", baseUrl: "https://api.test", fetch: ${fake} });
if (lib.SDK_VERSION !== ${JSON.stringify(pkg.version)}) throw new Error("version " + lib.SDK_VERSION);
const batch = await client.batches.createPayout({ payouts: [] });
const info = await batch.wait();
if (info.status !== "completed" || typeof hooks.verifyWebhook !== "function") throw new Error("bad");
console.log("ok");
`;
  writeFileSync(
    join(consumer, "esm.mjs"),
    `import * as lib from "@oblodai-npm/sdk";\nimport * as hooks from "@oblodai-npm/sdk/webhooks";\n${body()}`,
  );
  writeFileSync(
    join(consumer, "cjs.cjs"),
    `const lib = require("@oblodai-npm/sdk");\nconst hooks = require("@oblodai-npm/sdk/webhooks");\n(async () => {${body()}})().catch((e) => { console.error(e); process.exit(1); });\n`,
  );
  for (const f of ["esm.mjs", "cjs.cjs"]) {
    const out = run(process.execPath, [f], consumer);
    if (!out.includes("ok")) throw new Error(`${f}: ${out}`);
  }

  const typed = `
import { Oblodai, type BatchInfoResponse, type DocumentJobView, type FileResult } from "@oblodai-npm/sdk";
import { verifyWebhook } from "@oblodai-npm/sdk/webhooks";
export async function use(client: Oblodai): Promise<void> {
  const batch = await client.batches.createPayout({ payouts: [] });
  const info: BatchInfoResponse = await batch.wait({ timeout: 60 });
  const job = await client.documents.createJob({ kind: "statement", format: "pdf" } as never);
  const view: DocumentJobView = await job.wait();
  const file: FileResult = await job.download();
  // @ts-expect-error — amounts are decimal strings, a number does not compile
  await client.payments.create({ amount: 25.5, currency: "USDT" });
  for await (const p of client.payments.listHistory({ limit: 10 })) void p.uuid;
  void info; void view; void file; void verifyWebhook;
}
`;
  writeFileSync(join(consumer, "typed.mts"), typed);
  writeFileSync(join(consumer, "typed.cts"), typed);
  run(
    process.execPath,
    [
      join(ROOT, "node_modules", "typescript", "bin", "tsc"),
      "--noEmit",
      "--strict",
      "--module",
      "nodenext",
      "--moduleResolution",
      "nodenext",
      "--target",
      "es2022",
      "--types",
      "node",
      "--typeRoots",
      join(ROOT, "node_modules", "@types"),
      "typed.mts",
      "typed.cts",
    ],
    consumer,
  );
  console.log(
    `package: ${packed.filename} installs, imports, requires and type-checks (ESM + CJS)`,
  );
} catch (err) {
  console.error(`check-package: ${err.stderr || err.stdout || err.message}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
