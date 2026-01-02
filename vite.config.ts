import react from "@vitejs/plugin-react-swc";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqliteWasmPath = path.join(__dirname, "public/sqlite-wasm/sqlite3.wasm");

const serveSqliteWasm = () => ({
  name: "serve-sqlite-wasm",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
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
    });
  },
});

export default defineConfig({
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
});
