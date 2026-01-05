import { decode as cborDecode } from "cbor-x";

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

const base64UrlToBytes = (input: string): Uint8Array => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const base64 = normalized + padding;
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
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
  let decodedCbor: unknown = null;

  // Common formats:
  // - cashuA<base64url(json)> (v3)
  // - cashuB<base64url(cbor)> (v4-ish)
  // - raw JSON string
  if (raw.startsWith("cashu") && raw.length > 6) {
    const variant = raw[5] ?? "";
    const payload = raw.slice(6);
    if (variant === "B") {
      try {
        decodedCbor = cborDecode(base64UrlToBytes(payload));
      } catch {
        decodedCbor = null;
      }
    } else {
      try {
        decoded = safeParseJson(base64UrlToString(payload));
      } catch {
        decoded = null;
      }
    }
  } else if (raw.startsWith("{")) {
    decoded = safeParseJson(raw);
  }

  // CBOR token (cashuB...) format observed:
  // { m: <mintUrl>, u: <unit>, t: [ { p: [ { a: <amount>, ... }, ... ], ... }, ... ] }
  if (decodedCbor && typeof decodedCbor === "object") {
    const rec = decodedCbor as Record<string, unknown>;
    const mint = asString(rec.m);

    const t = rec.t;
    const entries: unknown[] = Array.isArray(t) ? t : [];

    let total = 0;
    for (const entry of entries) {
      const entryRec =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : null;
      const proofs = Array.isArray(entryRec?.p)
        ? (entryRec?.p as unknown[])
        : [];
      for (const proof of proofs) {
        const proofRec =
          proof && typeof proof === "object"
            ? (proof as Record<string, unknown>)
            : null;
        const amt = asNumber(proofRec?.a);
        if (amt !== null) total += amt;
      }
    }

    return { amount: total, mint };
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
