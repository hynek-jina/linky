const NPUB_CASH_DOMAIN = "npub.cash";
const NOSTR_URI_PREFIX = "nostr:";

const normalizeNpubCase = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^npub1/i.test(trimmed) ? trimmed.toLowerCase() : trimmed;
};

export const normalizeNpubIdentifier = (value: unknown): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const withoutPrefix =
    raw.slice(0, NOSTR_URI_PREFIX.length).toLowerCase() === NOSTR_URI_PREFIX
      ? raw.slice(NOSTR_URI_PREFIX.length).trim()
      : raw;
  if (!withoutPrefix) return null;

  const atIndex = withoutPrefix.lastIndexOf("@");
  if (atIndex < 0) return normalizeNpubCase(withoutPrefix);
  if (atIndex === 0) return null;

  const localPart = withoutPrefix.slice(0, atIndex).trim();
  const domainPart = withoutPrefix
    .slice(atIndex + 1)
    .trim()
    .toLowerCase();
  if (domainPart !== NPUB_CASH_DOMAIN) return null;
  if (!localPart) return null;
  return normalizeNpubCase(localPart);
};
