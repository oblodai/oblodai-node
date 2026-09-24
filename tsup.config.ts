import { defineConfig } from "tsup";

// JavaScript only: the declarations come from `tsc -p tsconfig.build.json` (scripts/build-types.mjs),
// file for file, so the generated models keep their imports of the runtime waiter types.
export default defineConfig({
  entry: { index: "src/index.ts", webhooks: "src/webhooks.ts" },
  format: ["esm", "cjs"],
  dts: false,
  clean: true,
  sourcemap: true,
  target: "node20",
  splitting: false,
});
