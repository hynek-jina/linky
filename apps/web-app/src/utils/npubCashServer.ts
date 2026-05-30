const DEFAULT_NPUB_CASH_SERVER_BASE_URL = "https://npub.cash";

const HOSTED_NPUB_CASH_SERVER_BASE_URLS: Readonly<Record<string, string>> = {
  "linky.fit": "https://npub.linky.fit",
  "npub.cash": DEFAULT_NPUB_CASH_SERVER_BASE_URL,
};

const getLightningAddressDomain = (
  lightningAddress: string | null | undefined,
): string | null => {
  const normalized = String(lightningAddress ?? "").trim();
  if (!normalized) return null;

  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex >= normalized.length - 1) return null;

  const domain = normalized
    .slice(atIndex + 1)
    .trim()
    .toLowerCase();
  return domain || null;
};

export const resolveNpubCashServerBaseUrl = (
  lightningAddress: string | null | undefined,
): string => {
  const domain = getLightningAddressDomain(lightningAddress);
  if (!domain) return DEFAULT_NPUB_CASH_SERVER_BASE_URL;

  return (
    HOSTED_NPUB_CASH_SERVER_BASE_URLS[domain] ??
    DEFAULT_NPUB_CASH_SERVER_BASE_URL
  );
};
