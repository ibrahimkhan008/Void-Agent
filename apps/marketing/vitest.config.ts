import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths({ ignoreConfigErrors: true })],
  // Same reason as apps/web: Next compiles JSX with the automatic runtime,
  // so no component imports `React` and esbuild must not use the classic
  // transform (every rendered component test would die on "React is not
  // defined").
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    exclude: ["**/tests/**", "**/node_modules/**"],
  },
});
