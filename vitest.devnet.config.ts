import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Opt-in live Devnet suite. Never used by CI.
 * Run with: pnpm test:devnet
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/devnet/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});
