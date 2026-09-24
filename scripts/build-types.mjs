// Declarations for both module systems. `tsc` writes dist/types/esm (the package is "type": "module",
// so TypeScript reads those .d.ts files as ESM); the same tree is copied to dist/types/cjs under a
// package.json of "type": "commonjs", which TypeScript then reads as CommonJS declarations for
// `require` consumers.
import { spawnSync } from "node:child_process";
import { cpSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const types = join(ROOT, "dist", "types");
rmSync(types, { recursive: true, force: true });
const tsc = spawnSync(
  process.execPath,
  [join(ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.build.json"],
  {
    cwd: ROOT,
    stdio: "inherit",
  },
);
if (tsc.status !== 0) process.exit(tsc.status ?? 1);
cpSync(join(types, "esm"), join(types, "cjs"), { recursive: true });
writeFileSync(join(types, "cjs", "package.json"), '{ "type": "commonjs" }\n');
writeFileSync(join(types, "esm", "package.json"), '{ "type": "module" }\n');
