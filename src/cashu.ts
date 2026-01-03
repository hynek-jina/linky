type CashuProof = {
  amount?: number;
};

type CashuTokenEntry = {
  mint?: string;
  proofs?: CashuProof[];
};

type CashuTokenV3 = {
  token?: CashuTokenEntry[];
  mint?: string;
  proofs?: CashuProof[];
};

const base64UrlToString = (input: string): string => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const base64 = normalized + padding;
  // atob expects Latin1; Cashu token JSON is ASCII-safe.
  return atob(base64);
};

const safeParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return value;
};

export type ParsedCashuToken = {
  amount: number;
  mint: string | null;
};

export const parseCashuToken = (rawToken: string): ParsedCashuToken | null => {
  const raw = rawToken.trim();
  if (!raw) return null;

  let decoded: unknown = null;

  // Common formats:
  // - cashuA<base64url(json)> (v3)
  // - raw JSON string
  if (raw.startsWith("cashu") && raw.length > 6) {
    const payload = raw.slice(6);
    try {
      decoded = safeParseJson(base64UrlToString(payload));
    } catch {
      decoded = null;
    }
  } else if (raw.startsWith("{")) {
    decoded = safeParseJson(raw);
  }

  if (!decoded || typeof decoded !== "object") return null;

  const token = decoded as CashuTokenV3;

  const entries: CashuTokenEntry[] = Array.isArray(token.token)
    ? token.token
    : [];

  const mints = new Set<string>();
  let total = 0;

  if (entries.length > 0) {
    for (const entry of entries) {
      const mint = asString((entry as CashuTokenEntry).mint);
      if (mint) mints.add(mint);
      const proofs = Array.isArray(entry.proofs) ? entry.proofs : [];
      for (const proof of proofs) {
        const amt = asNumber((proof as CashuProof).amount);
        if (amt !== null) total += amt;
      }
    }
  } else {
    const mint = asString((token as CashuTokenV3).mint);
    if (mint) mints.add(mint);
    const proofs = Array.isArray(token.proofs) ? token.proofs : [];
    for (const proof of proofs) {
      const amt = asNumber((proof as CashuProof).amount);
      if (amt !== null) total += amt;
    }
  }

  const mint = mints.size === 1 ? Array.from(mints)[0] : null;

  return {
    amount: total,
    mint,
  };
};
