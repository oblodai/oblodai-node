import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Oblodai, RESOURCES, SDK_VERSION } from "../../src/index.js";

const ROOT = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** `resource.method` of a names file (`api_allowlist.add_entry` lines), as the client spells it. */
const lockNames = (file: string) =>
  read(file)
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(".").map(camel).join("."))
    .sort();

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
    const locked = lockNames("names.lock");
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

  // names.2.0.txt is the method list of the 2.0.0 release, frozen once: the migration guide
  // documents that release, so methods added later do not have to appear in it.
  it("MIGRATION-2.0.md names every 2.0 method", () => {
    const migration = read("MIGRATION-2.0.md");
    const released = lockNames("names.2.0.txt");
    expect(released.length).toBeGreaterThan(100);
    const missing = released.filter((m) => !migration.includes(`\`${m}\``));
    expect(missing).toEqual([]);
    // Nothing of 2.0 has gone: a removal is a breaking change (the generator refuses it too).
    expect(released.filter((m) => !clientMethods().includes(m))).toEqual([]);
  });

  // The method tables of both READMEs are generated between the sdkgen markers (make sdk).
  it("the README method tables list exactly the client's methods", () => {
    for (const file of ["README.md", "README.ru.md"]) {
      const doc = read(file);
      const begin = doc.indexOf("<!-- sdkgen:methods -->");
      const end = doc.indexOf("<!-- /sdkgen:methods -->");
      expect(begin, file).toBeGreaterThan(0);
      const listed: string[] = [];
      for (const row of doc.slice(begin, end).split("\n")) {
        const cells = /^\| `(\w+)` \| (.+) \|$/.exec(row);
        if (!cells) continue;
        for (const m of cells[2]!.matchAll(/`(\w+)`/g)) listed.push(`${cells[1]}.${m[1]}`);
      }
      expect(listed.sort(), file).toEqual(clientMethods());
    }
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
