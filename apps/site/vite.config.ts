import react from "@vitejs/plugin-react-swc";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin, ViteDevServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type NextFunction = () => void;

const cashuRedirect = (): Plugin => ({
  name: "cashu-redirect",
  configureServer(server: ViteDevServer) {
    server.middlewares.use(
      (req: IncomingMessage, res: ServerResponse, next: NextFunction) => {
        const url = req.url ?? "";
        if (url === "/cashu") {
          res.statusCode = 302;
          res.setHeader("Location", "/cashu/");
          res.end();
          return;
        }

        next();
      },
    );
  },
});

const lnurlProxy = (): Plugin => ({
  name: "lnurl-proxy",
  configureServer(server: ViteDevServer) {
    server.middlewares.use(
      async (req: IncomingMessage, res: ServerResponse, next: NextFunction) => {
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
  build: {
    rollupOptions: {
      input: {
        cashu: path.resolve(__dirname, "cashu/index.html"),
        main: path.resolve(__dirname, "index.html"),
        privacy: path.resolve(__dirname, "privacy.html"),
      },
    },
  },
  plugins: [react(), cashuRedirect(), lnurlProxy()],
});
