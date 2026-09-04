// Local dev has no npub.cash-compatible server; hosted lightning-address
// flows (info/claim/mint sync) are skipped entirely when disabled.
export const isNpubCashDisabled = (): boolean =>
  import.meta.env.VITE_NPUB_CASH_DISABLED === "true";

// Every identity has a `<npub>@linky.fit` address on Linky's own
// npub.cash-compatible server, so hosted info/claim/mint-sync calls go here
// no matter which `lud16` the profile currently publishes.
export const NPUB_CASH_SERVER_BASE_URL = "https://npub.linky.fit";
