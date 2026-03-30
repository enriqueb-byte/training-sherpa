import { defineConfig } from "vite";

/** Production builds use repo subpath for GitHub Pages; local dev keeps relative base. */
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/training-sherpa/" : "./",
}));
