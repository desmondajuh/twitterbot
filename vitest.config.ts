import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    exclude: ["node_modules", "dist", "dist-electron", ".next"],
    testTimeout: 20000,
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    server: {
      deps: {
        external: ["node:sqlite"],
      },
    },
  },
});
