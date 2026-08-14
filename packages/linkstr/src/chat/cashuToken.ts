import { getTokenMetadata } from "@cashu/cashu-ts";

export interface ParsedCashuToken {
  readonly amount: number;
  readonly mint: string | null;
  readonly unit: string | null;
}

/**
 * Metadata of a standard encoded cashu token (`cashuA`/`cashuB`), or null when
 * the text is not one. Non-standard shapes (legacy cashu.me JSON bundles,
 * tokens embedded in longer text) are an app-level concern, not part of the
 * wire classification.
 */
export const parseCashuToken = (rawToken: string): ParsedCashuToken | null => {
  const raw = rawToken.trim();
  if (!raw.startsWith("cashu")) return null;
  try {
    const metadata = getTokenMetadata(raw);
    const amount = metadata.amount.toNumber();
    if (amount <= 0) return null;
    return {
      amount,
      mint: metadata.mint.trim() || null,
      unit: metadata.unit.trim() || null,
    };
  } catch {
    return null;
  }
};

const CASHU_URI_PREFIX = /^(web\+)?cashu:(\/\/)?/i;

export const extractWholeCashuToken = (text: string): string | null => {
  const candidate = text.trim().replace(CASHU_URI_PREFIX, "").trim();
  return parseCashuToken(candidate) === null ? null : candidate;
};
