import { defineConfig } from "vitest/config";

// Unit tests only: no global setup, so no PostgreSQL/Redis/MinIO required.
// Environment values still come from .env.test through src/config.ts.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
