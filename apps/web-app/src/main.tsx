import { Buffer } from "buffer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import type {
  BroadcastChannelLike,
  BroadcastMessageHandler,
  GlobalWithOptionalBroadcastChannel,
  LockManagerLike,
  NavigatorWithOptionalLocks,
  NavigatorWithOptionalStorage,
} from "./types/browser";
import type { JsonValue } from "./types/json";
import { appendPushDebugLog } from "./utils/pushDebugLog";
import { markPwaNeedRefresh, recordPwaRegistered } from "./utils/pwaUpdate";

type BufferFromArgs =
  | [arrayLike: ArrayLike<number> | ArrayBufferView]
  | [
      arrayBuffer: ArrayBuffer | SharedArrayBuffer,
      byteOffset?: number,
      length?: number,
    ]
  | [value: string, encoding?: string];

interface ProcessLike {
  emitWarning?: (message: string, type?: string, code?: string) => void;
  env?: Record<string, string | undefined>;
}

const isBufferConstructor = (value: unknown): value is typeof Buffer => {
  return typeof value === "function" && "from" in value && "prototype" in value;
};

const getGlobalBuffer = (): typeof Buffer | null => {
  const candidate = Reflect.get(globalThis, "Buffer");
  return isBufferConstructor(candidate) ? candidate : null;
};

const getGlobalProcess = (): ProcessLike | null => {
  const candidate = Reflect.get(globalThis, "process");
  if (candidate && typeof candidate === "object") {
    return candidate as ProcessLike;
  }
  return null;
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

// Some browserified Node deps still expect a global `process`.
// Provide a tiny shim before any lazy-loaded app code runs.
if (!getGlobalProcess()) {
  const processShim: ProcessLike = {
    emitWarning: (message: string, type?: string, code?: string) => {
      if (
        typeof console !== "undefined" &&
        typeof console.warn === "function"
      ) {
        console.warn(message, type, code);
      }
    },
    env: {},
  };

  try {
    Object.defineProperty(globalThis, "process", {
      configurable: true,
      value: processShim,
      writable: true,
    });
  } catch {
    Reflect.set(globalThis, "process", processShim);
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
        return Reflect.apply(origFrom, this, [fromBase64Url(value), "base64"]);
      }
      return Reflect.apply(origFrom, this, args);
    },
    writable: true,
  });

  Reflect.set(B.prototype, patchMarker, true);
})();

const updateSW = registerSW({
  immediate: true,
  onOfflineReady() {
    console.log("[linky][pwa] offline ready");
    void appendPushDebugLog("client", "pwa offline ready");
  },
  onNeedRefresh() {
    console.log("[linky][pwa] update available");
    void appendPushDebugLog("client", "pwa update available");
    markPwaNeedRefresh(true);
  },
  onRegisteredSW(swUrl, registration) {
    console.log("[linky][pwa] sw registered", {
      swUrl,
      scope: registration?.scope,
      hasActive: Boolean(registration?.active),
      hasWaiting: Boolean(registration?.waiting),
      hasInstalling: Boolean(registration?.installing),
    });
    void appendPushDebugLog("client", "pwa sw registered", {
      hasActive: Boolean(registration?.active),
      hasInstalling: Boolean(registration?.installing),
      hasWaiting: Boolean(registration?.waiting),
      scope: registration?.scope ?? null,
      swUrl,
    });

    // vite-plugin-pwa does not auto-poll for SW updates when an
    // onRegisteredSW callback is supplied. Trigger manual update checks
    // on a 30s interval plus on focus/visibility/online so the prompt
    // banner surfaces shortly after a deploy without forcing a hard
    // refresh. Detected waiting workers also fire the onNeedRefresh
    // callback above which flips the banner state.
    if (!registration) return;
    const checkForUpdate = () => {
      if (
        typeof navigator !== "undefined" &&
        "onLine" in navigator &&
        navigator.onLine === false
      ) {
        return;
      }
      void registration.update().catch((error) => {
        console.log("[linky][pwa] sw update check failed", { error });
      });
    };
    setInterval(checkForUpdate, 30_000);
    if (typeof window !== "undefined") {
      window.addEventListener("focus", checkForUpdate);
      window.addEventListener("online", checkForUpdate);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkForUpdate();
      });
    }
    if (registration.waiting) {
      console.log("[linky][pwa] waiting worker present at registration");
      markPwaNeedRefresh(true);
    }
  },
  onRegisterError(error) {
    console.log("[linky][pwa] sw register error", { error });
    void appendPushDebugLog("client", "pwa sw register error", { error });
  },
});
recordPwaRegistered(updateSW);

if ("serviceWorker" in navigator) {
  console.log("[linky][pwa] controller", {
    hasController: Boolean(navigator.serviceWorker.controller),
  });
  void appendPushDebugLog("client", "pwa controller snapshot", {
    hasController: Boolean(navigator.serviceWorker.controller),
  });

  navigator.serviceWorker.addEventListener("message", (event) => {
    console.log("[linky][pwa] sw message", event.data);
    void appendPushDebugLog("client", "pwa sw message", {
      data: event.data,
    });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    console.log("[linky][pwa] controller change", {
      hasController: Boolean(navigator.serviceWorker.controller),
    });
    void appendPushDebugLog("client", "pwa controller change", {
      hasController: Boolean(navigator.serviceWorker.controller),
    });
  });

  void navigator.serviceWorker.ready
    .then(async (reg) => {
      console.log("[linky][pwa] sw ready", {
        scope: reg.scope,
        hasActive: Boolean(reg.active),
      });
      await appendPushDebugLog("client", "pwa sw ready", {
        hasActive: Boolean(reg.active),
        scope: reg.scope,
      });

      if ("caches" in globalThis) {
        const keys = await caches.keys();
        const relevant = keys.filter(
          (k) => k.includes("workbox") || k.includes("linky"),
        );
        console.log("[linky][pwa] cache keys", { keys: relevant });
        await appendPushDebugLog("client", "pwa cache keys", {
          keys: relevant,
        });
      }
    })
    .catch((error) => {
      console.log("[linky][pwa] sw ready error", { error });
      void appendPushDebugLog("client", "pwa sw ready error", { error });
    });
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const getErrorName = (value: unknown): string | null => {
  if (value instanceof DOMException) {
    return value.name;
  }
  if (value instanceof Error) {
    return value.name;
  }
  if (!isRecord(value)) {
    return null;
  }
  const name = value.name;
  return typeof name === "string" ? name : null;
};

const getErrorMessage = (value: unknown): string | null => {
  if (value instanceof DOMException) {
    return value.message;
  }
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  if (!isRecord(value)) {
    return null;
  }
  const message = value.message;
  return typeof message === "string" ? message : null;
};

const isClipboardReadPermissionError = (value: unknown): boolean => {
  const name = getErrorName(value);
  const message = getErrorMessage(value)?.toLowerCase() ?? "";

  if (name !== "NotAllowedError") {
    return false;
  }

  return message.includes("readtext") && message.includes("permission denied");
};

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
  let stage = "init";
  // Surface a stuck-loading state with the last completed boot stage so we
  // can tell whether bootstrap froze in dynamic imports, polyfills, or the
  // first render. Mostly catches iOS Safari private-mode quirks where a
  // dependency hangs without throwing.
  const stuckTimer = window.setTimeout(() => {
    renderBootError(new Error(`Boot stuck after 15s at stage: ${stage}`));
  }, 15_000);
  try {
    console.log("[linky][boot] start");
    stage = "polyfills";
    applyEvoluWebCompatPolyfills();
    console.log("[linky][boot] polyfills done");

    stage = "import-app";
    const [{ default: App }, { ErrorBoundary }] = await Promise.all([
      import("./App.tsx"),
      import("./ErrorBoundary.tsx"),
    ]);
    console.log("[linky][boot] app modules loaded");

    stage = "import-evolu";
    const { evolu, EvoluProvider } = await import("./evolu.ts");
    console.log("[linky][boot] evolu loaded");

    stage = "render";
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <EvoluProvider value={evolu}>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </EvoluProvider>
      </StrictMode>,
    );
    console.log("[linky][boot] rendered");
    window.clearTimeout(stuckTimer);
  } catch (error) {
    window.clearTimeout(stuckTimer);
    console.error(`Boot failed at stage ${stage}:`, error);
    const wrapped =
      error instanceof Error
        ? Object.assign(error, {
            message: `[stage: ${stage}] ${error.message}`,
          })
        : new Error(`[stage: ${stage}] ${String(error)}`);
    renderBootError(wrapped);
  }
};

window.addEventListener("unhandledrejection", (event) => {
  if (isClipboardReadPermissionError(event.reason)) {
    event.preventDefault();
    return;
  }
  renderBootError(event.reason);
});

window.addEventListener("error", (event) => {
  const error = event.error ?? event.message;
  if (isClipboardReadPermissionError(error)) {
    event.preventDefault();
    return;
  }
  renderBootError(error);
});

void bootstrap();
