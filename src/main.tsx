import { Buffer } from "buffer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { evolu, EvoluProvider } from "./evolu.ts";
import "./index.css";

// Some dependencies (e.g. Cashu libs) expect Node's global Buffer.
// Provide a safe browser polyfill.
if (!("Buffer" in globalThis)) {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

// Dev-only cleanup: if a Service Worker was registered earlier (e.g. from a
// previous PROD preview), it can keep serving stale cached assets on localhost
// and cause a blank screen until a hard refresh.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void (async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      if ("caches" in globalThis) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // ignore
    }
  })();
}

if (import.meta.env.PROD) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EvoluProvider value={evolu}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </EvoluProvider>
  </StrictMode>
);
