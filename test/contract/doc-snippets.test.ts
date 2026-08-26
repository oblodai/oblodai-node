import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../../src/contract/enums.js";
import { Oblodai } from "../../src/client.js";

// The READMEs are the integration surface most people meet first: a snippet that no longer compiles
// is a bug shipped to every new integrator. This suite (a) type-checks every TypeScript block in
// both READMEs against the real sources, (b) holds README.ru.md to the same blocks byte for byte, so
// a translation can never drift into different code, and (c) refuses error codes and environment
// variables the SDK does not actually have.

const ROOT = join(__dirname, "..", "..");
const WORK = join(ROOT, ".doc-snippets");

interface Block {
  lang: string;
  code: string;
  line: number;
}

function readBlocks(file: string): Block[] {
  const source = readFileSync(join(ROOT, file), "utf8");
  const blocks: Block[] = [];
  const lines = source.split("\n");
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

// Placeholders the prose introduces as "your own function"; declaring them here keeps the snippets
// readable instead of padding every example with a stub definition.
const AMBIENT = `declare function markOrderPaid(orderId: string, webhookId?: string): void;
declare function scheduleRetry(afterSeconds: number): void;
`;

const SNIPPET_TSCONFIG = {
  extends: "../tsconfig.json",
  compilerOptions: {
    rootDir: "..",
    noEmit: true,
    module: "NodeNext",
    moduleResolution: "NodeNext",
    paths: {
      "@oblodai-npm/sdk": ["../src/index.ts"],
      "@oblodai-npm/sdk/webhooks": ["../src/webhooks.ts"],
    },
  },
  include: ["./*.ts", "../src/**/*"],
};

describe("README code blocks", () => {
  it("both READMEs actually contain snippets", () => {
    expect(EN.length).toBeGreaterThan(5);
    expect(EN.filter((b) => b.lang === "ts").length).toBeGreaterThan(5);
  });

  it("README.ru.md repeats the English blocks byte for byte", () => {
    expect(RU.map((b) => `${b.lang}\n${b.code}`)).toEqual(EN.map((b) => `${b.lang}\n${b.code}`));
  });

  it("both READMEs have the same section structure", () => {
    const headings = (file: string) =>
      readFileSync(join(ROOT, file), "utf8")
        .split("\n")
        .filter((l) => /^##+ /.test(l))
        .map((l) => l.replace(/[^#]/g, ""));
    expect(headings("README.ru.md")).toEqual(headings("README.md"));
  });

  it("every TypeScript block type-checks against the sources", () => {
    rmSync(WORK, { recursive: true, force: true });
    mkdirSync(WORK, { recursive: true });
    writeFileSync(join(WORK, "ambient.d.ts"), AMBIENT);
    writeFileSync(join(WORK, "tsconfig.json"), JSON.stringify(SNIPPET_TSCONFIG, null, 2));
    const ts = EN.filter((b) => b.lang === "ts");
    ts.forEach((b, i) =>
      writeFileSync(join(WORK, `snippet-${String(i).padStart(2, "0")}-line-${b.line}.ts`), b.code),
    );

    const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
    try {
      execFileSync(process.execPath, [tsc, "--noEmit", "-p", join(WORK, "tsconfig.json")], {
        cwd: ROOT,
        stdio: "pipe",
      });
    } catch (err) {
      const out = (err as { stdout?: Buffer }).stdout?.toString() ?? String(err);
      throw new Error(
        `README snippets do not compile (file name carries the README line):\n${out}`,
      );
    }
    rmSync(WORK, { recursive: true, force: true });
  }, 120_000);
});

// A code the gateway never sends sends an integrator down a branch that can never run.
const FAMILIES = new Set(ERROR_CODES.map((c) => c.split(".")[0]));
const KNOWN = new Set<string>(ERROR_CODES);
const SDK_LOCAL = /^(sdk|transport|webhook)\./;
// `contract.json`, `examples.ts`, `shop.example` … share the dotted shape without being codes.
const NOT_A_CODE =
  /\.(json|jsonc|ts|tsx|js|mjs|cjs|md|yml|yaml|sh|toml|html|lock|com|dev|io|org|net|example)$/;

// `sandbox.faucet` reads like an error code and is a method; the client itself settles which is
// which, so a renamed or deleted method is caught here too.
const client = new Oblodai({ publicId: "test_oblodai_docs", secret: "oblodai_test_docs" });
const NAMESPACES = new Set<string>();
const METHODS = new Set<string>();
for (const ns of Object.keys(client)) {
  const value = (client as unknown as Record<string, unknown>)[ns];
  if (ns === "transport" || typeof value !== "object" || value === null) continue;
  NAMESPACES.add(ns);
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(value))) {
    if (name !== "constructor") METHODS.add(`${ns}.${name}`);
  }
}

function dotted(source: string): string[] {
  return [...source.matchAll(/`([a-zA-Z_]+\.[a-zA-Z_]+)`/g)].map((m) => m[1]!);
}

describe("README prose", () => {
  it.each(["README.md", "README.ru.md"])("%s names only catalogued error codes", (file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    const named = new Set<string>();
    for (const code of dotted(source)) {
      if (SDK_LOCAL.test(code) || NOT_A_CODE.test(code) || METHODS.has(code)) continue;
      if (!FAMILIES.has(code.split(".")[0]!)) continue;
      named.add(code);
    }
    expect([...named].filter((c) => !KNOWN.has(c))).toEqual([]);
  });

  it.each(["README.md", "README.ru.md"])("%s names only methods the client has", (file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    const referenced = dotted(source).filter((t) => NAMESPACES.has(t.split(".")[0]!));
    expect(referenced.length).toBeGreaterThan(10);
    expect([...new Set(referenced)].filter((t) => !METHODS.has(t))).toEqual([]);
  });

  it.each(["README.md", "README.ru.md"])("%s documents every env var the SDK reads", (file) => {
    const config = readFileSync(join(ROOT, "src", "config.ts"), "utf8");
    const read = [...config.matchAll(/env\.(OBLODAI_[A-Z_]+)/g)].map((m) => m[1]!);
    expect(read.length).toBeGreaterThan(0);
    const source = readFileSync(join(ROOT, file), "utf8");
    expect([...new Set(read)].filter((v) => !source.includes(v))).toEqual([]);
  });

  it.each(["README.md", "README.ru.md"])("%s invents no OBLODAI_ env var", (file) => {
    // Everything the SDK itself reads, plus the two the prose explicitly attributes elsewhere:
    // the webhook secret belongs to the caller's process, OBLODAI_LIVE_URL to the dev scripts.
    const owned = new Set([
      ...[
        ...readFileSync(join(ROOT, "src", "config.ts"), "utf8").matchAll(/env\.(OBLODAI_[A-Z_]+)/g),
      ].map((m) => m[1]!),
      "OBLODAI_WEBHOOK_SECRET",
      "OBLODAI_WEBHOOK_SECRET_PREV",
      "OBLODAI_LIVE_URL",
    ]);
    const named = new Set(
      [...readFileSync(join(ROOT, file), "utf8").matchAll(/\bOBLODAI_[A-Z_]+/g)].map((m) => m[0]),
    );
    expect([...named].filter((v) => !owned.has(v) && !v.startsWith("OBLODAI_PAYOUT_"))).toEqual([]);
  });
});
