import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" throws outside Next's server bundle; it's a no-op under test.
      "server-only": path.resolve(__dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    projects: [
      { extends: true, test: { name: "unit", include: ["src/**/*.test.ts"], environment: "node" } },
      {
        extends: true,
        test: {
          name: "emulator",
          include: ["tests/emulator/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/support/emulatorEnv.ts"],
          // Emulator tests share one database; run files one at a time.
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
