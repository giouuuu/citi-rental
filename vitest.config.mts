import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Mirrors the `paths` aliases in tsconfig.json so modules under test can use
 * the project's normal `@/…` imports instead of relative ones.
 * Order matters: the more specific `@/features/*` prefix must resolve first.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/features\//, replacement: `${root}src/features/` },
      { find: /^@\//, replacement: root },
    ],
  },
});
