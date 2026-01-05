import { Buffer } from "buffer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";

// Some dependencies (e.g. Cashu libs) expect Node's global Buffer.
// Provide a safe browser polyfill.
if (!("Buffer" in globalThis)) {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

// The `buffer` polyfill doesn't implement Node's newer "base64url" encoding.
// Some deps (e.g. Evolu) use it for compact URL-safe IDs.
// Patch in minimal support to avoid boot crashes in the browser.
(() => {
  const B = (globalThis as any).Buffer as typeof Buffer | undefined;
  if (!B) return;

  const proto = (B as any).prototype;
  if (proto && proto.__linkyBase64UrlPatched) return;

  const toBase64Url = (base64: string) =>
    base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");

  const fromBase64Url = (base64url: string) => {
    const base64 = base64url.replaceAll("-", "+").replaceAll("_", "/");
    const pad = base64.length % 4;
    return pad === 0 ? base64 : base64 + "=".repeat(4 - pad);
  };

  const origToString = proto.toString;
  proto.toString = function (encoding?: string, start?: number, end?: number) {
    if (encoding === "base64url") {
      return toBase64Url(origToString.call(this, "base64", start, end));
    }
    return origToString.call(this, encoding, start, end);
  };

  const origFrom = (B as any).from;
  (B as any).from = function (
    value: unknown,
    encodingOrOffset?: unknown,
    length?: unknown
  ) {
    if (typeof value === "string" && encodingOrOffset === "base64url") {
      return origFrom.call(this, fromBase64Url(value), "base64");
    }
    return origFrom.call(this, value, encodingOrOffset, length);
  };

  proto.__linkyBase64UrlPatched = true;
})();

// Dev-only cleanup: if a Service Worker was registered earlier (e.g. from a
// previous PROD preview), it can keep serving stale cached assets on localhost
// and cause a blank screen until a hard refresh.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void (async () => {
    try {
      const reloadKey = "linky_dev_sw_cleanup_reload_v1";
      const hadController = Boolean(navigator.serviceWorker.controller);

      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      if ("caches" in globalThis) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      // Unregistering doesn't immediately stop an already-controlling SW.
      // Force a one-time reload so the page is no longer under SW control.
      if (hadController) {
        try {
          if (sessionStorage.getItem(reloadKey) !== "1") {
            sessionStorage.setItem(reloadKey, "1");
            window.location.reload();
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  })();
}

if (import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.log("[linky][pwa] offline ready");
    },
    onNeedRefresh() {
      console.log("[linky][pwa] update available");
    },
    onRegisteredSW(swUrl, registration) {
      console.log("[linky][pwa] sw registered", {
        swUrl,
        scope: registration?.scope,
        hasActive: Boolean(registration?.active),
        hasWaiting: Boolean(registration?.waiting),
        hasInstalling: Boolean(registration?.installing),
      });
    },
    onRegisterError(error) {
      console.log("[linky][pwa] sw register error", { error });
    },
  });

  if ("serviceWorker" in navigator) {
    console.log("[linky][pwa] controller", {
      hasController: Boolean(navigator.serviceWorker.controller),
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      console.log("[linky][pwa] controller change", {
        hasController: Boolean(navigator.serviceWorker.controller),
      });
    });

    void navigator.serviceWorker.ready
      .then(async (reg) => {
        console.log("[linky][pwa] sw ready", {
          scope: reg.scope,
          hasActive: Boolean(reg.active),
        });

        if ("caches" in globalThis) {
          const keys = await caches.keys();
          const relevant = keys.filter(
            (k) => k.includes("workbox") || k.includes("linky")
          );
          console.log("[linky][pwa] cache keys", { keys: relevant });
        }
      })
      .catch((error) => {
        console.log("[linky][pwa] sw ready error", { error });
      });
  }
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const renderBootError = (error: unknown) => {
  const root = document.getElementById("root");
  if (!root) return;

  const message =
    error instanceof Error
      ? `${error.message}\n\n${error.stack ?? ""}`
      : typeof error === "string"
      ? error
      : JSON.stringify(error, null, 2);

  root.innerHTML = `
    <div style="padding: 40px; color: #ff6b6b; font-family: monospace;">
      <h2>Boot error</h2>
      <pre style="overflow: auto; background: #1a1a1a; padding: 10px; white-space: pre-wrap;">${escapeHtml(
        message
      )}</pre>
    </div>
  `;
};

const bootstrap = async () => {
  try {
    const [{ default: App }, { ErrorBoundary }, { evolu, EvoluProvider }] =
      await Promise.all([
        import("./App.tsx"),
        import("./ErrorBoundary.tsx"),
        import("./evolu.ts"),
      ]);

    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <EvoluProvider value={evolu}>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </EvoluProvider>
      </StrictMode>
    );
  } catch (error) {
    console.error("Boot failed:", error);
    renderBootError(error);
  }
};

window.addEventListener("unhandledrejection", (event) => {
  renderBootError(event.reason);
});

window.addEventListener("error", (event) => {
  renderBootError(event.error ?? event.message);
});

void bootstrap();
