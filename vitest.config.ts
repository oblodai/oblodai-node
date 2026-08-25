import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "test/unit/**/*.test.ts",
      "test/contract/**/*.test.ts",
      ...(process.env.OBLODAI_LIVE_URL ? ["test/live/**/*.test.ts"] : []),
    ],
    environment: "node",
  },
});
