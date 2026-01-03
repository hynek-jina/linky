import react from "@vitejs/plugin-react-swc";
import fs from "node:fs/promises";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin, ViteDevServer } from "vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqliteWasmPath = path.join(__dirname, "public/sqlite-wasm/sqlite3.wasm");

const serveSqliteWasm = (): Plugin => ({
  name: "serve-sqlite-wasm",
  configureServer(server: ViteDevServer) {
    server.middlewares.use(
      async (
        req: Connect.IncomingMessage,
        res: ServerResponse,
        next: Connect.NextFunction
      ) => {
        const url = req.url ?? "";
        if (!url.includes("sqlite3.wasm")) return next();

        try {
          const wasm = await fs.readFile(sqliteWasmPath);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/wasm");
          res.setHeader("Cache-Control", "no-store");
          res.end(wasm);
        } catch (error) {
          server.config.logger.error(
            `Failed to serve sqlite3.wasm from ${sqliteWasmPath}: ${String(
              error
            )}`
          );
          next();
        }
      }
    );
  },
});

export default defineConfig({
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    exclude: ["@evolu/react-web"],
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  resolve: {
    alias: {
      "sqlite-wasm/jswasm/sqlite3.wasm": "/sqlite-wasm/sqlite3.wasm",
    },
  },
  plugins: [
    serveSqliteWasm(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      manifest: {
        name: "linky",
        short_name: "linky",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#3b82f6",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react")) return "react";
          if (id.includes("@evolu")) return "evolu";
          if (id.includes("nostr-tools")) return "nostr";
          if (id.includes("@cashu")) return "cashu";
          if (id.includes("buffer")) return "polyfills";
          return "vendor";
        },
      },
    },
  },
});
