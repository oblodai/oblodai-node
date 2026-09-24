import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Oblodai, RESOURCES, SDK_VERSION } from "../../src/index.js";

const ROOT = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** `resource.method` for every generated method, as the client exposes it. */
function clientMethods(): string[] {
  const out: string[] = [];
  for (const [prop, cls] of Object.entries(RESOURCES)) {
    for (const name of Object.getOwnPropertyNames(cls.prototype)) {
      if (name !== "constructor") out.push(`${prop}.${name}`);
    }
  }
  return out.sort();
}

describe("release documents", () => {
  it("names.lock pins exactly the methods the client has", () => {
    const locked = read("names.lock")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(".").map(camel).join("."))
      .sort();
    expect(locked).toEqual(clientMethods());
    const client = new Oblodai({ publicId: "p", secret: "s", env: {} }) as unknown as Record<
      string,
      Record<string, unknown>
    >;
    for (const name of locked) {
      const [resource, method] = name.split(".") as [string, string];
      expect(typeof client[resource]?.[method], name).toBe("function");
    }
  });

  it("MIGRATION-2.0.md names every 2.0 method", () => {
    const migration = read("MIGRATION-2.0.md");
    const missing = clientMethods().filter((m) => !migration.includes(`\`${m}\``));
    expect(missing).toEqual([]);
  });

  it("the version is one number everywhere", () => {
    const pkg = JSON.parse(read("package.json")) as { version: string; engines: { node: string } };
    expect(SDK_VERSION).toBe(pkg.version);
    expect(pkg.engines.node).toBe(">=20");
    expect(read("CHANGELOG.md")).toMatch(
      new RegExp(`^## \\[${pkg.version.replace(/\./g, "\\.")}\\]`, "m"),
    );
    expect(read("CHANGELOG.md").indexOf(`## [${pkg.version}]`)).toBeLessThan(
      read("CHANGELOG.md").indexOf("## [1.3.0]"),
    );
    expect(read("AGENTS.md")).toContain(`(${pkg.version})`);
  });
});
