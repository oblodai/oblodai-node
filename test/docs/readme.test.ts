import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { gateway } from "../support/gateway.js";

// The READMEs are the integration surface most people meet first. Every TypeScript block of both
// is (a) type-checked against the sources, (b) executed against the stand-in gateway, and
// README.ru.md repeats the English blocks byte for byte, so a translation cannot drift into
// different code.

const ROOT = join(__dirname, "..", "..");
const WORK = join(ROOT, ".doc-snippets");

interface Block {
  lang: string;
  code: string;
  line: number;
}

function readBlocks(file: string): Block[] {
  const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^```([a-z]*)\s*$/.exec(lines[i] ?? "");
    if (!open) continue;
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length && lines[j] !== "```"; j++) body.push(lines[j] ?? "");
    blocks.push({ lang: open[1] ?? "", code: body.join("\n"), line: i + 1 });
    i = j;
  }
  return blocks;
}

const EN = readBlocks("README.md");
const RU = readBlocks("README.ru.md");
const TS = EN.filter((b) => b.lang === "ts");
const file = (b: Block) => join(WORK, `readme-${b.line}.ts`);

const headings = (name: string) =>
  readFileSync(join(ROOT, name), "utf8")
    .split("\n")
    .filter((l) => /^##+ /.test(l))
    .map((l) => l.replace(/[^#]/g, ""));

beforeAll(() => {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  for (const b of TS) writeFileSync(file(b), `${b.code}\n`);
  writeFileSync(
    join(WORK, "tsconfig.json"),
    JSON.stringify({
      extends: "../tsconfig.json",
      compilerOptions: {
        rootDir: "..",
        noEmit: true,
        noUnusedLocals: false,
        paths: {
          "@oblodai-npm/sdk": ["../src/index.ts"],
          "@oblodai-npm/sdk/webhooks": ["../src/webhooks.ts"],
        },
      },
      include: ["./*.ts", "../src/**/*"],
      exclude: [],
    }),
  );
});

describe("README code blocks", () => {
  it("both READMEs carry the TypeScript blocks, identical, under the same sections", () => {
    expect(TS.length).toBeGreaterThan(8);
    expect(RU.map((b) => `${b.lang}\n${b.code}`)).toEqual(EN.map((b) => `${b.lang}\n${b.code}`));
    expect(headings("README.ru.md")).toEqual(headings("README.md"));
  });

  it("every block type-checks against the sources", () => {
    try {
      execFileSync(
        process.execPath,
        [join(ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", join(WORK, "tsconfig.json")],
        { cwd: ROOT, encoding: "utf8", stdio: "pipe" },
      );
    } catch (err) {
      throw new Error(`README snippets do not compile:\n${(err as { stdout?: string }).stdout}`);
    }
  }, 120_000);

  describe("every block runs against the stand-in gateway", () => {
    const realFetch = globalThis.fetch;
    let calls: ReturnType<typeof gateway>["calls"];

    beforeEach(() => {
      const g = gateway();
      calls = g.calls;
      globalThis.fetch = g.fetch as typeof fetch;
      vi.stubEnv("OBLODAI_PUBLIC_ID", "test_oblodai_demo");
      vi.stubEnv("OBLODAI_SECRET", "oblodai_test_demo");
      vi.stubEnv("OBLODAI_BASE_URL", "");
      vi.stubEnv("OBLODAI_LOG", "");
      vi.stubEnv("OBLODAI_WEBHOOK_SECRET", "whsec_demo");
      for (const level of ["log", "info", "warn", "error", "debug"] as const) {
        vi.spyOn(console, level).mockImplementation(() => undefined);
      }
    });

    afterEach(() => {
      globalThis.fetch = realFetch;
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it.each(TS.map((b) => [`README.md:${b.line}`, b] as const))("%s", async (_, block) => {
      await import(file(block));
      if (/await oblodai\./.test(block.code)) expect(calls.length).toBeGreaterThan(0);
    });
  });
});
