import { decode as cborDecode } from "cbor-x";
import type { JsonRecord, JsonValue } from "./types/json";

const isJsonRecord = (value: unknown): value is JsonRecord => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const asJsonArray = (value: JsonValue | null | undefined): JsonValue[] => {
  return Array.isArray(value) ? value : [];
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

const safeParseJson = (text: string): JsonValue | null => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const asString = (value: JsonValue | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const asNumber = (value: JsonValue | null | undefined): number | null => {
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

  let decoded: JsonValue | null = null;
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
  if (isJsonRecord(decodedCbor)) {
    const rec = decodedCbor;
    const mint = asString(rec.m);

    const entries = asJsonArray(rec.t);

    let total = 0;
    for (const entry of entries) {
      const entryRec = isJsonRecord(entry) ? entry : null;
      const proofs = asJsonArray(entryRec?.p);
      for (const proof of proofs) {
        const proofRec = isJsonRecord(proof) ? proof : null;
        const amt = asNumber(proofRec?.a);
        if (amt !== null) total += amt;
      }
    }

    return { amount: total, mint };
  }

  if (!isJsonRecord(decoded)) return null;

  const token = decoded;
  const entries = asJsonArray(token.token);

  const mints = new Set<string>();
  let total = 0;

  if (entries.length > 0) {
    for (const entry of entries) {
      if (!isJsonRecord(entry)) continue;
      const mint = asString(entry.mint);
      if (mint) mints.add(mint);
      const proofs = asJsonArray(entry.proofs);
      for (const proof of proofs) {
        if (!isJsonRecord(proof)) continue;
        const amt = asNumber(proof.amount);
        if (amt !== null) total += amt;
      }
    }
  } else {
    const mint = asString(token.mint);
    if (mint) mints.add(mint);
    const proofs = asJsonArray(token.proofs);
    for (const proof of proofs) {
      if (!isJsonRecord(proof)) continue;
      const amt = asNumber(proof.amount);
      if (amt !== null) total += amt;
    }
  }

  const mint = mints.size === 1 ? Array.from(mints)[0] : null;

  return {
    amount: total,
    mint,
  };
};
