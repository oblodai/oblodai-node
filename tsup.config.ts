import { defineConfig } from "tsup";

// JavaScript only: the declarations come from `tsc -p tsconfig.build.json` (scripts/build-types.mjs),
// file for file, so the module augmentation in src/lro.ts reaches the generated models it extends —
// a bundled .d.ts would drop it.
export default defineConfig({
  entry: { index: "src/index.ts", webhooks: "src/webhooks.ts" },
  format: ["esm", "cjs"],
  dts: false,
  clean: true,
  sourcemap: true,
  target: "node20",
  splitting: false,
});
