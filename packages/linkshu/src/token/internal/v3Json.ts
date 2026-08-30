import { Schema } from "effect";
import { parseMintUrl, type MintUrl } from "../../domain/primitives";
import { DecodedToken } from "../domain";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const safeJsonParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// atob/btoa are globals on every target runtime (browser, node ≥ 16, bun),
// but they speak Latin1; the TextDecoder/TextEncoder round-trip keeps utf-8
// payload content (memos) intact.
const base64UrlToUtf8 = (input: string): string | null => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

const utf8ToBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const decodeDecodedToken = Schema.decodeUnknownOption(DecodedToken);

/** Validates raw token fields (mint pre-normalized) through the domain schema. */
export const decodeTokenFields = (fields: {
  mint: MintUrl;
  unit: string;
  memo: string | null;
  proofs: unknown;
}): DecodedToken | null => {
  const decoded = decodeDecodedToken(fields);
  return decoded._tag === "Some" ? decoded.value : null;
};

/**
 * `cashuA` base64url payload → `DecodedToken`. Hand-parsed rather than routed
 * through cashu-ts, which converts v2 keyset ids to their short form and then
 * refuses to decode them without the mint's keyset list — even though the v3
 * JSON carries the full id.
 */
export const decodeV3Payload = (payload: string): DecodedToken | null => {
  const json = base64UrlToUtf8(payload);
  if (json === null) return null;
  const parsed = safeJsonParse(json);
  if (!isRecord(parsed) || !Array.isArray(parsed.token)) return null;
  if (parsed.token.length !== 1) return null;
  const entry = parsed.token[0];
  if (!isRecord(entry)) return null;
  const mint = typeof entry.mint === "string" ? parseMintUrl(entry.mint) : null;
  if (mint === null) return null;
  return decodeTokenFields({
    mint,
    unit: asTrimmedString(parsed.unit) ?? "sat",
    memo: typeof parsed.memo === "string" ? parsed.memo : null,
    proofs: entry.proofs,
  });
};

const isLegacyProofRecord = (value: unknown): value is JsonRecord =>
  isRecord(value) &&
  asTrimmedString(value.secret) !== null &&
  asTrimmedString(value.C) !== null &&
  asTrimmedString(value.id) !== null &&
  typeof value.amount === "number" &&
  Number.isFinite(value.amount);

/** cashu.me exports nest proofs arbitrarily (`proofs: [[…]]`); all-or-nothing. */
const flattenLegacyProofs = (value: unknown): JsonRecord[] | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const proofs: JsonRecord[] = [];
  const collect = (element: unknown): boolean => {
    if (isLegacyProofRecord(element)) {
      proofs.push(element);
      return true;
    }
    if (!Array.isArray(element)) return false;
    return element.every(collect);
  };
  return value.every(collect) ? proofs : null;
};

/**
 * cashu.me legacy plain-JSON proof bundle → v3 token text, byte-identical to
 * the web app's historical normalization: token-text-derived row ids must stay
 * stable across the app's migration onto this codec, so the original proof
 * records are re-serialized as-is (extra fields like `dleq` included). v3
 * rather than canonical v4 also keeps full v2 keyset ids decodable.
 */
export const legacyBundleToV3TokenText = (raw: string): string | null => {
  if (!raw.startsWith("{")) return null;
  const parsed = safeJsonParse(raw);
  if (!isRecord(parsed)) return null;
  const mint = asTrimmedString(parsed.mint);
  const unit = asTrimmedString(parsed.unit);
  const proofs = flattenLegacyProofs(parsed.proofs);
  if (!mint || !proofs?.length) return null;
  const payload = utf8ToBase64Url(
    JSON.stringify({ token: [{ mint, proofs }], ...(unit ? { unit } : {}) }),
  );
  return `cashuA${payload}`;
};
