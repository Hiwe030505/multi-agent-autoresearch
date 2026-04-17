import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run unit tests in Node.js mode
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Timeout for async operations
    testTimeout: 10_000,
    // Don't run API/e2e by default — they require servers
    // Run explicitly: vitest run tests/api/ or tests/e2e/
    // coverage: {
    //   provider: "v8",
    //   reporter: ["text", "json", "html"],
    // },
  },
});