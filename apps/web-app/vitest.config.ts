import react from "@vitejs/plugin-react-swc";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./vitest.setup.ts",
    css: true,
    // *.spec.ts files in tests/ are Playwright E2E suites, not vitest tests.
    exclude: [...configDefaults.exclude, "tests/**/*.spec.ts"],
  },
});
