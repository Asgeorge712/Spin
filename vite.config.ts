import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Emits dist/sw.js: a service worker that precaches every file in the build,
 * so the app keeps working with no internet connection once it has loaded.
 */
function serviceWorker(): Plugin {
  return {
    name: "spin-service-worker",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const files = new Set(["./", "index.html", ...readdirSync("public")]);
      for (const name of Object.keys(bundle)) {
        if (!name.endsWith(".map")) files.add(name);
      }
      const precache = [...files].sort().map((f) => (f.startsWith(".") ? f : `./${f}`));
      const hash = createHash("sha256");
      for (const [name, chunk] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
        hash.update(name);
        hash.update(chunk.type === "chunk" ? chunk.code : chunk.source);
      }
      const source = readFileSync("sw/sw.js", "utf8")
        .replace("__VERSION__", hash.digest("hex").slice(0, 12))
        .replace("__PRECACHE__", JSON.stringify(precache, null, 2));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  // Relative paths so the build works from any folder, e.g. GitHub Pages.
  base: "./",
  plugins: [react(), serviceWorker()],
});
