let cashuLibPromise: Promise<typeof import("@cashu/cashu-ts")> | null = null;

declare global {
  interface Window {
    __CASHU_MODULE__?: typeof import("@cashu/cashu-ts");
  }
}

export const getCashuLib = () => {
  if (!cashuLibPromise) {
    cashuLibPromise = import("@cashu/cashu-ts")
      .then((mod) => {
        // Cache module on window for synchronous access by decodeCashuTokenSync
        try {
          window.__CASHU_MODULE__ = mod;
        } catch {
          // Ignore if window is not available
        }
        return mod;
      })
      .catch((e) => {
        // If Vite fails to serve the dynamically imported chunk once (e.g.
        // transient network/dev-server hiccup), allow retry on next call.
        cashuLibPromise = null;
        throw e;
      });
  }
  return cashuLibPromise;
};
