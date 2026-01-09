let cashuLibPromise: Promise<typeof import("@cashu/cashu-ts")> | null = null;

export const getCashuLib = () => {
  if (!cashuLibPromise) {
    cashuLibPromise = import("@cashu/cashu-ts");
  }
  return cashuLibPromise;
};
