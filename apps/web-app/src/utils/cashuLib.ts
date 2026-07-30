let cashuLibPromise: Promise<typeof import("@cashu/cashu-ts")> | null = null;

export const getCashuLib = () => {
  if (!cashuLibPromise) {
    cashuLibPromise = import("@cashu/cashu-ts").catch((e) => {
      // If Vite fails to serve the dynamically imported chunk once (e.g.
      // transient network/dev-server hiccup), allow retry on next call.
      cashuLibPromise = null;
      throw e;
    });
  }
  return cashuLibPromise;
};
