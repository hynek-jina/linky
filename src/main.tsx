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
