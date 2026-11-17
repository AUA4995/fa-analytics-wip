import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Integration tests share one database and the Xero sync refreshes every client's hold state —
    // run test files one at a time so they can't see each other's half-written fixtures.
    fileParallelism: false,
    // Tests send X-Forwarded-For to check the per-address limits (in the app it is trusted only behind a proxy)
    env: { TRUST_PROXY: "1" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
