import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The marketing site and its interactive demo.
 *
 * It reuses the real app components, so the Tauri bridge is swapped for the
 * sample-data adapter in `src/demo/tauri`. The app build (`vite.config.ts` at the
 * repository root) never sees these aliases.
 */
export default defineConfig({
  root: here("./"),
  // Relative assets so the build works at both `/` and the GitHub Pages project
  // path (`/easycptrans/`, case differences included). The site has no nested
  // routes, so a relative base is safe here.
  base: process.env.WEBSITE_BASE ?? "./",
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@tauri-apps\/api\/core$/, replacement: here("./src/demo/tauri/core.ts") },
      { find: /^@tauri-apps\/api\/event$/, replacement: here("./src/demo/tauri/event.ts") },
      {
        find: /^@tauri-apps\/plugin-dialog$/,
        replacement: here("./src/demo/tauri/dialog.ts"),
      },
    ],
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 4173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
