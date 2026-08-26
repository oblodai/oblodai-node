import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../../src/contract/enums.js";

// Every error code a method doc tells the caller to branch on must exist in the core's catalogue.
// A code that is not in contract.json is a code the gateway never sends — a doc that names one
// sends an integrator down a branch that can never run.
const RESOURCES = join(__dirname, "..", "..", "src", "resources");
const KNOWN = new Set<string>(ERROR_CODES);
const FAMILIES = new Set(ERROR_CODES.map((c) => c.split(".")[0]));
// Event types (`wallet.paid`) share the dotted shape; they live in the same generated module.
const ENUMS_SOURCE = readFileSync(
  join(__dirname, "..", "..", "src", "contract", "enums.ts"),
  "utf8",
);
const SDK_LOCAL = /^(sdk|transport|webhook)\./;

describe("error codes named in method docs", () => {
  const files = readdirSync(RESOURCES).filter((f) => f.endsWith(".ts"));
  it.each(files)("%s names only catalogued codes", (file) => {
    const source = readFileSync(join(RESOURCES, file), "utf8");
    const named = new Set<string>();
    for (const m of source.matchAll(/`([a-z_]+\.[a-z_]+)`/g)) {
      const family = m[1].split(".")[0];
      if (SDK_LOCAL.test(m[1]) || !FAMILIES.has(family)) continue;
      if (ENUMS_SOURCE.includes(`"${m[1]}"`)) continue;
      named.add(m[1]);
    }
    const unknown = [...named].filter((c) => !KNOWN.has(c));
    expect(unknown).toEqual([]);
  });
});
