import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (file: string) => fileURLToPath(new URL(`./src/${file}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Examples and README snippets import the package by name; run them against the sources.
    alias: [
      { find: /^@oblodai-npm\/sdk\/webhooks$/, replacement: src("webhooks.ts") },
      { find: /^@oblodai-npm\/sdk$/, replacement: src("index.ts") },
    ],
  },
  test: {
    include: [
      "test/unit/**/*.test.ts",
      "test/conformance/**/*.test.ts",
      "test/docs/**/*.test.ts",
      ...(process.env.OBLODAI_LIVE_URL ? ["test/live/**/*.test.ts"] : []),
    ],
    environment: "node",
  },
});
