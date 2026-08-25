#!/usr/bin/env node
// CI gate: the committed src/contract must be exactly what codegen produces from contract/contract.json.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src", "contract");
const generated = ["routes.ts", "enums.ts", "requests.ts", "version.ts"];
const before = Object.fromEntries(generated.map((f) => [f, readFileSync(join(dir, f), "utf8")]));
execFileSync(process.execPath, [join(root, "scripts", "codegen.mjs")], { stdio: "inherit" });
execFileSync("npx", ["prettier", "--write", ...generated.map((f) => join(dir, f))], {
  stdio: "ignore",
});
const drifted = generated.filter((f) => readFileSync(join(dir, f), "utf8") !== before[f]);
if (drifted.length) {
  console.error(
    `contract drift: ${drifted.join(", ")} differ from contract/contract.json — commit the regenerated files`,
  );
  process.exit(1);
}
console.log(`check-drift: ${readdirSync(dir).length} files in src/contract are in sync`);
