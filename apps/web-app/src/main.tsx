import { Buffer } from "buffer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import type {
  BroadcastChannelLike,
  BroadcastMessageHandler,
  GlobalWithOptionalBroadcastChannel,
  LockManagerLike,
  NavigatorWithOptionalLocks,
  NavigatorWithOptionalStorage,
} from "./types/browser";
import type { JsonValue } from "./types/json";
import "./index.css";

type BufferFromArgs =
  | [arrayLike: ArrayLike<number> | ArrayBufferView]
  | [
      arrayBuffer: ArrayBuffer | SharedArrayBuffer,
      byteOffset?: number,
      length?: number,
    ]
  | [value: string, encoding?: string];

const isBufferConstructor = (value: unknown): value is typeof Buffer => {
  return typeof value === "function" && "from" in value && "prototype" in value;
};

const getGlobalBuffer = (): typeof Buffer | null => {
  const candidate = Reflect.get(globalThis, "Buffer");
  return isBufferConstructor(candidate) ? candidate : null;
};

// Some dependencies (e.g. Cashu libs) expect Node's global Buffer.
// Provide a safe browser polyfill.
if (!getGlobalBuffer()) {
  try {
    Object.defineProperty(globalThis, "Buffer", {
      configurable: true,
      value: Buffer,
      writable: true,
    });
  } catch {
    Object.defineProperty(globalThis, "Buffer", {
      configurable: true,
      value: Buffer,
      writable: true,
    });
  }
}

// The `buffer` polyfill doesn't implement Node's newer "base64url" encoding.
// Some deps (e.g. Evolu) use it for compact URL-safe IDs.
// Patch in minimal support to avoid boot crashes in the browser.
(() => {
  const B = getGlobalBuffer();
  if (!B) return;

  const patchMarker = "__linkyBase64UrlPatched";
  if (Reflect.get(B.prototype, patchMarker) === true) return;

  const toBase64Url = (base64: string) =>
    base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const fromBase64Url = (base64url: string) => {
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    return pad === 0 ? base64 : base64 + "=".repeat(4 - pad);
  };

  const origToString = B.prototype.toString;
  Object.defineProperty(B.prototype, "toString", {
    configurable: true,
    value: function (
      this: Buffer,
      encoding?: string,
      start?: number,
      end?: number,
    ) {
      if (encoding === "base64url") {
        return toBase64Url(origToString.call(this, "base64", start, end));
      }
      return origToString.call(this, encoding, start, end);
    },
    writable: true,
  });

  const origFrom = B.from;
  Object.defineProperty(B, "from", {
    configurable: true,
    value: function (this: typeof Buffer, ...args: BufferFromArgs) {
      const [value, encodingOrOffset] = args;
      if (typeof value === "string" && encodingOrOffset === "base64url") {
        return origFrom.call(this, fromBase64Url(value), "base64");
      }
      return Reflect.apply(origFrom, this, args);
    },
    writable: true,
  });

  Reflect.set(B.prototype, patchMarker, true);
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
    const BC = (globalThis as GlobalWithOptionalBroadcastChannel)
      .BroadcastChannel;
    if (typeof BC === "undefined") return false;
    try {
      const test = new BC("__linky_test__");
      test.close();
      return true;
    } catch {
      return false;
    }
  };

  if (!ensureBroadcastChannel()) {
    type Listener = BroadcastMessageHandler;
    const channelsByName = new Map<string, Set<PolyBroadcastChannel>>();

    class PolyBroadcastChannel implements BroadcastChannelLike {
      readonly name: string;
      onmessage: Listener = null;

      constructor(name: string) {
        this.name = String(name);
        const set = channelsByName.get(this.name) ?? new Set();
        set.add(this);
        channelsByName.set(this.name, set);
      }

      postMessage(message: JsonValue) {
        const set = channelsByName.get(this.name);
        if (!set) return;
        for (const ch of set) {
          const handler = ch.onmessage;
          if (!handler) continue;
          try {
            handler(new MessageEvent("message", { data: message }));
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

      addEventListener(
        _type: string,
        _listener: EventListenerOrEventListenerObject | null,
        _options?: boolean | AddEventListenerOptions,
      ) {
        void _type;
        void _listener;
        void _options;
        // Not used by Evolu.
      }

      removeEventListener(
        _type: string,
        _listener: EventListenerOrEventListenerObject | null,
        _options?: boolean | EventListenerOptions,
      ) {
        void _type;
        void _listener;
        void _options;
        // Not used by Evolu.
      }

      dispatchEvent(_event: Event) {
        void _event;
        return false;
      }
    }

    (globalThis as GlobalWithOptionalBroadcastChannel).BroadcastChannel =
      PolyBroadcastChannel;
  }

  const nav = navigator as NavigatorWithOptionalLocks;
  const locks = nav.locks;

  if (!locks?.request) {
    const lockPolyfill: LockManagerLike = {
      request: async (_name: string, cb: () => Promise<JsonValue>) => cb(),
    };
    try {
      (navigator as NavigatorWithOptionalLocks).locks = lockPolyfill;
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
      typeof (globalThis as GlobalWithOptionalBroadcastChannel)
        .BroadcastChannel !== "undefined",
    hasLocks: Boolean(
      (globalThis.navigator as NavigatorWithOptionalLocks)?.locks,
    ),
    hasIndexedDB: typeof globalThis.indexedDB !== "undefined",
    hasStorage:
      typeof (globalThis.navigator as NavigatorWithOptionalStorage)?.storage !==
      "undefined",
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
