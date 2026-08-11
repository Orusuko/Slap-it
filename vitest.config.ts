import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.integration.test.ts",
      "apps/**/*.test.ts",
      "apps/**/*.integration.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
