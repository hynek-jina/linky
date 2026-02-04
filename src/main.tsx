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
  const B = (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
  if (!B) return;

  const proto = B.prototype as unknown as {
    __linkyBase64UrlPatched?: boolean;
    toString: (encoding?: string, start?: number, end?: number) => string;
  };
  if (proto.__linkyBase64UrlPatched) return;

  const toBase64Url = (base64: string) =>
    base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const fromBase64Url = (base64url: string) => {
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
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

  const origFrom = (B as unknown as { from: (...args: unknown[]) => Buffer })
    .from;
  (B as unknown as { from: (...args: unknown[]) => Buffer }).from = function (
    value: unknown,
    encodingOrOffset?: unknown,
    length?: unknown,
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
            (k) => k.includes("workbox") || k.includes("linky"),
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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const applyEvoluWebCompatPolyfills = () => {
  // Some iOS/WebKit environments (notably private browsing) may lack
  // `navigator.locks` and/or `BroadcastChannel`, which Evolu's shared worker
  // implementation depends on. These lightweight polyfills make Evolu fall
  // back to a single-tab worker model instead of crashing during boot.
  if (typeof document === "undefined") return;

  const ensureBroadcastChannel = () => {
    const BC = (globalThis as unknown as { BroadcastChannel?: unknown })
      .BroadcastChannel;
    if (typeof BC === "undefined") return false;
    try {
      const test = new (BC as typeof BroadcastChannel)("__linky_test__");
      test.close();
      return true;
    } catch {
      return false;
    }
  };

  if (!ensureBroadcastChannel()) {
    type Listener = ((event: MessageEvent<unknown>) => void) | null;
    const channelsByName = new Map<string, Set<PolyBroadcastChannel>>();

    class PolyBroadcastChannel {
      readonly name: string;
      onmessage: Listener = null;

      constructor(name: string) {
        this.name = String(name);
        const set = channelsByName.get(this.name) ?? new Set();
        set.add(this);
        channelsByName.set(this.name, set);
      }

      postMessage(message: unknown) {
        const set = channelsByName.get(this.name);
        if (!set) return;
        for (const ch of set) {
          const handler = ch.onmessage;
          if (!handler) continue;
          try {
            handler({ data: message } as MessageEvent<unknown>);
          } catch {
            // ignore
          }
        }
      }

      close() {
        const set = channelsByName.get(this.name);
        if (!set) return;
        set.delete(this);
        if (set.size === 0) channelsByName.delete(this.name);
      }

      addEventListener() {
        // Not used by Evolu.
      }

      removeEventListener() {
        // Not used by Evolu.
      }

      dispatchEvent() {
        return false;
      }
    }

    (globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel =
      PolyBroadcastChannel as unknown;
  }

  const nav = navigator as unknown as { locks?: unknown };
  const locks = nav.locks as
    | {
        request?: (
          name: string,
          cb: () => Promise<unknown>,
        ) => Promise<unknown>;
      }
    | undefined;

  if (!locks?.request) {
    const lockPolyfill = {
      request: async (_name: string, cb: () => Promise<unknown>) => cb(),
    };
    try {
      (navigator as unknown as { locks: unknown }).locks = lockPolyfill;
    } catch {
      try {
        Object.defineProperty(navigator, "locks", {
          value: lockPolyfill,
          configurable: true,
        });
      } catch {
        // ignore
      }
    }
  }
};

const renderBootError = (error: unknown) => {
  const root = document.getElementById("root");
  if (!root) return;

  const message =
    error instanceof Error
      ? `${error.message}\n\n${error.stack ?? ""}`
      : typeof error === "string"
        ? error
        : JSON.stringify(error, null, 2);

  const diagnostics = {
    href: globalThis.location?.href ?? null,
    userAgent: globalThis.navigator?.userAgent ?? null,
    isSecureContext:
      typeof globalThis.isSecureContext === "boolean"
        ? globalThis.isSecureContext
        : null,
    hasWorker: typeof globalThis.Worker !== "undefined",
    hasBroadcastChannel:
      typeof (globalThis as unknown as { BroadcastChannel?: unknown })
        .BroadcastChannel !== "undefined",
    hasLocks: Boolean(
      (globalThis.navigator as unknown as { locks?: unknown })?.locks,
    ),
    hasIndexedDB: typeof globalThis.indexedDB !== "undefined",
    hasStorage:
      typeof (globalThis.navigator as unknown as { storage?: unknown })
        ?.storage !== "undefined",
  };

  root.innerHTML = `
    <div style="padding: 40px; color: #ff6b6b; font-family: monospace;">
      <h2>Boot error</h2>
      <pre style="overflow: auto; background: #1a1a1a; padding: 10px; white-space: pre-wrap;">${escapeHtml(
        message,
      )}</pre>
      <pre style="overflow: auto; background: #111827; padding: 10px; white-space: pre-wrap; margin-top: 12px;">${escapeHtml(
        JSON.stringify(diagnostics, null, 2),
      )}</pre>
    </div>
  `;
};

const bootstrap = async () => {
  try {
    applyEvoluWebCompatPolyfills();

    const [{ default: App }, { ErrorBoundary }] = await Promise.all([
      import("./App.tsx"),
      import("./ErrorBoundary.tsx"),
    ]);

    const { evolu, EvoluProvider } = await import("./evolu.ts");

    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <EvoluProvider value={evolu}>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </EvoluProvider>
      </StrictMode>,
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
