import { defineConfig } from "vitest/config";

const TEST_DB = "postgresql://mailclock:mailclock@127.0.0.1:5432/mailclock_test";

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? TEST_DB,
      MAILCLOCK_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    },
    // Tests share one database, so run files serially.
    fileParallelism: false,
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // lcov feeds scripts/coverage-gate.mjs (changed-lines check); text-summary is for humans.
      reporter: ["lcov", "text-summary"],
      reportsDirectory: "coverage",
    },
  },
});
