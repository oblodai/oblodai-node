// Fail when src/generated is not what the generator makes of the gateway's contract.
//
// Regenerates into a temporary directory with the backend's tools/sdkgen (from
// services/core/api/openapi.json, checked against names.lock) and compares file by file. The backend
// checkout is $OBLODAI_BACKEND, else ../oblodai-backend next to this repository. Without a backend
// that has tools/sdkgen the check is skipped, loudly; with --require it fails instead. Fix drift by
// regenerating (`make sdk` in the backend), never by hand.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED = join(ROOT, "src", "generated");

const backend = process.env.OBLODAI_BACKEND
  ? resolve(process.env.OBLODAI_BACKEND)
  : resolve(ROOT, "..", "oblodai-backend");
const sdkgen = join(backend, "tools", "sdkgen");
const spec = join(backend, "services", "core", "api", "openapi.json");

if (!existsSync(join(sdkgen, "cmd", "sdkgen")) || !existsSync(spec)) {
  const message = `no generator at ${sdkgen} (set OBLODAI_BACKEND to the backend checkout)`;
  if (process.argv.includes("--require")) {
    console.error(`check-generated: ${message}`);
    process.exit(1);
  }
  console.log(`  (skipped: ${message})`);
  process.exit(0);
}

const tsFiles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".ts"))
        .sort()
    : [];

const tmp = mkdtempSync(join(tmpdir(), "oblodai-node-sdkgen-"));
try {
  const done = spawnSync(
    "go",
    [
      "run",
      "./cmd/sdkgen",
      "-spec",
      spec,
      "-lang",
      "node",
      "-out",
      tmp,
      "-lock",
      join(ROOT, "names.lock"),
    ],
    {
      cwd: sdkgen,
      env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? "go1.26.6" },
      encoding: "utf8",
    },
  );
  if (done.status !== 0) {
    console.error(`check-generated: sdkgen failed:\n${done.stderr || done.error}`);
    process.exit(1);
  }
  const fresh = join(tmp, "src", "generated");
  const want = tsFiles(fresh);
  const have = tsFiles(GENERATED);
  const bad = new Set([
    ...want.filter((f) => !have.includes(f)),
    ...have.filter((f) => !want.includes(f)),
  ]);
  for (const f of want) {
    if (
      have.includes(f) &&
      !readFileSync(join(fresh, f)).equals(readFileSync(join(GENERATED, f)))
    ) {
      bad.add(f);
    }
  }
  if (bad.size) {
    console.error(
      `check-generated: src/generated is stale (${[...bad].sort().join(", ")}); regenerate with \`make sdk\` in the backend`,
    );
    process.exit(1);
  }
  console.log(`generated code matches ${spec}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
