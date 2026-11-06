import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// The app imports through "@/..."; the tests must resolve it the same way.
// The Supabase clients are built at import time; the tests that need them set dummy values
// before importing, so no request is ever made.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
