import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react-swc";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import type { ServerResponse } from "node:http";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin, ViteDevServer } from "vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqliteWasmPath = path.join(__dirname, "public/sqlite-wasm/sqlite3.wasm");

const packageJsonPath = path.join(__dirname, "package.json");
const appVersion = (() => {
  try {
    const raw = readFileSync(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: unknown };
    return String(pkg.version ?? "").trim() || "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const useHttps = process.env.VITE_HTTPS === "1";

const serveSqliteWasm = (): Plugin => ({
  name: "serve-sqlite-wasm",
  configureServer(server: ViteDevServer) {
    server.middlewares.use(
      async (
        req: Connect.IncomingMessage,
        res: ServerResponse,
        next: Connect.NextFunction,
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
              error,
            )}`,
          );
          next();
        }
      },
    );
  },
});

const mintQuoteProxy = (): Plugin => ({
  name: "mint-quote-proxy",
  configureServer(server: ViteDevServer) {
    server.middlewares.use(
      async (
        req: Connect.IncomingMessage,
        res: ServerResponse,
        next: Connect.NextFunction,
      ) => {
        const url = req.url ?? "";
        if (!url.startsWith("/__mint-quote")) return next();

        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        const parsed = new URL(url, "http://localhost");
        const mint = String(parsed.searchParams.get("mint") ?? "").trim();
        if (!mint) {
          res.statusCode = 400;
          res.end("Missing mint");
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", async () => {
          try {
            const target = `${mint.replace(/\/+$/, "")}/v1/mint/quote/bolt11`;
            const url = new URL(target);
            const isHttps = url.protocol === "https:";
            const client = isHttps ? https : http;

            const proxyReq = client.request(
              {
                method: "POST",
                hostname: url.hostname,
                port: url.port ? Number(url.port) : isHttps ? 443 : 80,
                path: `${url.pathname}${url.search}`,
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(body),
                },
                timeout: 12_000,
              },
              (proxyRes) => {
                res.statusCode = proxyRes.statusCode ?? 502;
                const contentType = proxyRes.headers["content-type"];
                if (contentType) {
                  res.setHeader("Content-Type", contentType);
                } else {
                  res.setHeader("Content-Type", "application/json");
                }
                res.setHeader("Cache-Control", "no-store");
                proxyRes.pipe(res);
              },
            );

            proxyReq.on("timeout", () => {
              proxyReq.destroy(new Error("Proxy timeout"));
            });

            proxyReq.on("error", (error) => {
              if (res.headersSent) return;
              res.statusCode = 502;
              res.end(`Proxy error: ${String(error ?? "")}`);
            });

            proxyReq.write(body);
            proxyReq.end();
          } catch (error) {
            res.statusCode = 502;
            res.end(`Proxy error: ${String(error ?? "")}`);
          }
        });
      },
    );
  },
});

const lnurlProxy = (): Plugin => ({
  name: "lnurl-proxy",
  configureServer(server: ViteDevServer) {
    server.middlewares.use(
      async (
        req: Connect.IncomingMessage,
        res: ServerResponse,
        next: Connect.NextFunction,
      ) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/lnurlp")) return next();

        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        const parsed = new URL(url, "http://localhost");
        const target = String(parsed.searchParams.get("url") ?? "").trim();
        if (!/^https?:\/\//i.test(target)) {
          res.statusCode = 400;
          res.end("Invalid url");
          return;
        }

        try {
          const targetUrl = new URL(target);
          const isHttps = targetUrl.protocol === "https:";
          const client = isHttps ? https : http;

          const proxyReq = client.request(
            {
              method: "GET",
              hostname: targetUrl.hostname,
              port: targetUrl.port
                ? Number(targetUrl.port)
                : isHttps
                  ? 443
                  : 80,
              path: `${targetUrl.pathname}${targetUrl.search}`,
              headers: {
                Accept: "application/json",
              },
              timeout: 12_000,
            },
            (proxyRes) => {
              res.statusCode = proxyRes.statusCode ?? 502;
              const contentType = proxyRes.headers["content-type"];
              if (contentType) {
                res.setHeader("Content-Type", contentType);
              } else {
                res.setHeader("Content-Type", "application/json");
              }
              res.setHeader("Cache-Control", "no-store");
              proxyRes.pipe(res);
            },
          );

          proxyReq.on("timeout", () => {
            proxyReq.destroy(new Error("Proxy timeout"));
          });

          proxyReq.on("error", (error) => {
            if (res.headersSent) return;
            res.statusCode = 502;
            res.end(`Proxy error: ${String(error ?? "")}`);
          });

          proxyReq.end();
        } catch (error) {
          server.config.logger.error(
            `LNURL proxy error: ${String(error ?? "unknown")}`,
          );
          res.statusCode = 502;
          res.end(`Proxy error: ${String(error ?? "")}`);
        }
      },
    );
  },
});

export default defineConfig({
  define: {
    global: "globalThis",
    __APP_VERSION__: JSON.stringify(appVersion),
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
    mintQuoteProxy(),
    lnurlProxy(),
    ...(useHttps ? [basicSsl()] : []),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "linky-runtime-images-v1",
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 256,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      manifest: {
        name: "Linky",
        short_name: "Linky",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#14b8a6",
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
  ...(useHttps ? { server: { host: true, https: {} } } : {}),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react")) return "react";
          if (id.includes("@evolu")) return "evolu";
          if (id.includes("nostr-tools")) return "nostr";
          if (id.includes("@cashu")) return "cashu";
          // Keep `buffer` and its deps together to avoid an ESM circular init:
          // polyfills -> vendor (base64-js/ieee754) and vendor -> polyfills.
          if (
            id.includes("/node_modules/buffer/") ||
            id.includes("/node_modules/base64-js/") ||
            id.includes("/node_modules/ieee754/")
          ) {
            return "polyfills";
          }
          return "vendor";
        },
      },
    },
  },
});
