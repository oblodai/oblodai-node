// The contract snapshot CI tests against, without the private backend checkout.
//
// contract/conformance/*.json is the backend's shared conformance suite (tools/sdkgen/conformance),
// and contract/signing.json the spec's `x-oblodai-signing` block the suites point into (request and
// webhook vectors, header names). With a backend ($OBLODAI_BACKEND, else ../oblodai-backend):
//   node scripts/sync-contract.mjs          refresh the snapshot
//   node scripts/sync-contract.mjs --check  fail when the snapshot is stale (part of `make ci`)
// Without one the check is skipped loudly (--require makes that a failure).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "contract");
const backend = process.env.OBLODAI_BACKEND
  ? resolve(process.env.OBLODAI_BACKEND)
  : resolve(ROOT, "..", "oblodai-backend");
const suiteDir = join(backend, "tools", "sdkgen", "conformance");
const spec = join(backend, "services", "core", "api", "openapi.json");
const check = process.argv.includes("--check");

if (!existsSync(suiteDir) || !existsSync(spec)) {
  const message = `no conformance suite at ${suiteDir} (set OBLODAI_BACKEND to the backend checkout)`;
  if (process.argv.includes("--require") || !check) {
    console.error(`sync-contract: ${message}`);
    process.exit(1);
  }
  console.log(`  (contract snapshot check skipped: ${message})`);
  process.exit(0);
}

const want = new Map();
for (const f of readdirSync(suiteDir)
  .filter((n) => n.endsWith(".json"))
  .sort()) {
  want.set(join("conformance", f), readFileSync(join(suiteDir, f), "utf8"));
}
const signing = JSON.parse(readFileSync(spec, "utf8"))["x-oblodai-signing"];
want.set("signing.json", `${JSON.stringify({ "x-oblodai-signing": signing }, null, 2)}\n`);

const have = new Map();
if (existsSync(join(OUT, "conformance"))) {
  for (const f of readdirSync(join(OUT, "conformance"))) {
    have.set(join("conformance", f), readFileSync(join(OUT, "conformance", f), "utf8"));
  }
}
if (existsSync(join(OUT, "signing.json"))) {
  have.set("signing.json", readFileSync(join(OUT, "signing.json"), "utf8"));
}

if (check) {
  const stale = [...new Set([...want.keys(), ...have.keys()])].filter(
    (k) => want.get(k) !== have.get(k),
  );
  if (stale.length) {
    console.error(
      `sync-contract: contract/ is stale (${stale.join(", ")}); run \`node scripts/sync-contract.mjs\``,
    );
    process.exit(1);
  }
  console.log(`contract snapshot matches ${backend}`);
} else {
  rmSync(join(OUT, "conformance"), { recursive: true, force: true });
  mkdirSync(join(OUT, "conformance"), { recursive: true });
  for (const [k, v] of want) writeFileSync(join(OUT, k), v);
  console.log(`contract snapshot refreshed from ${backend}`);
}
