import { bech32 } from "@scure/base";

const BOLT11_PREFIX_RE = /^(lnbc|lntb|lnbcrt)/i;
const BOLT11_WORD_LIMIT = 5_000;
const BOLT11_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BOLT11_TIMESTAMP_WORDS = 7;
const BOLT11_SIGNATURE_WORDS = 104;
const DEFAULT_EXPIRY_SECONDS = 3_600;

const DESCRIPTION_TAG = BOLT11_CHARSET.indexOf("d");
const EXPIRY_TAG = BOLT11_CHARSET.indexOf("x");

export interface LightningInvoicePreview {
  amountSat: number | null;
  description: string | null;
  expiresAtSec: number | null;
  invoice: string;
}

const parseBolt11AmountSat = (invoice: string): number | null => {
  const separatorIndex = invoice.lastIndexOf("1");
  if (separatorIndex <= 0) return null;

  const hrp = invoice.slice(0, separatorIndex).toLowerCase();
  const amountPart = hrp.replace(BOLT11_PREFIX_RE, "");
  if (!amountPart) return null;

  const unitSuffix = amountPart.slice(-1);
  const hasUnit = /[munp]/.test(unitSuffix);
  const digits = hasUnit ? amountPart.slice(0, -1) : amountPart;
  if (!/^\d+$/.test(digits)) return null;

  const value = Number(digits);
  if (!Number.isFinite(value) || value <= 0) return null;

  const satAmount = (() => {
    if (!hasUnit) return value * 100_000_000;
    if (unitSuffix === "m") return value * 100_000;
    if (unitSuffix === "u") return value * 100;
    if (unitSuffix === "n") return value / 10;
    if (unitSuffix === "p") return value / 10_000;
    return null;
  })();

  if (!Number.isFinite(satAmount) || satAmount === null || satAmount <= 0) {
    return null;
  }

  return Math.ceil(satAmount);
};

const parseWordNumber = (words: readonly number[]): number | null => {
  let value = 0;
  for (const word of words) {
    if (!Number.isInteger(word) || word < 0 || word > 31) return null;
    value = value * 32 + word;
    if (!Number.isSafeInteger(value)) return null;
  }
  return value;
};

export const getLightningInvoicePreview = (
  rawInvoice: string,
): LightningInvoicePreview | null => {
  const invoice = String(rawInvoice ?? "").trim();
  if (!BOLT11_PREFIX_RE.test(invoice)) return null;

  const preview: LightningInvoicePreview = {
    invoice,
    amountSat: parseBolt11AmountSat(invoice),
    description: null,
    expiresAtSec: null,
  };

  try {
    const decoded = bech32.decodeUnsafe(
      invoice.toLowerCase(),
      BOLT11_WORD_LIMIT,
    );
    if (!decoded) return preview;

    const { words } = decoded;
    if (words.length < BOLT11_TIMESTAMP_WORDS) return preview;

    const timestampWords = words.slice(0, BOLT11_TIMESTAMP_WORDS);
    const timestampSec = parseWordNumber(timestampWords);
    const payloadWords =
      words.length > BOLT11_SIGNATURE_WORDS
        ? words.slice(BOLT11_TIMESTAMP_WORDS, -BOLT11_SIGNATURE_WORDS)
        : [];

    let explicitExpirySec: number | null = null;
    let offset = 0;
    while (offset + 3 <= payloadWords.length) {
      const tag = payloadWords[offset];
      const dataLength = parseWordNumber(
        payloadWords.slice(offset + 1, offset + 3),
      );
      if (dataLength === null) break;

      const start = offset + 3;
      const end = start + dataLength;
      if (end > payloadWords.length) break;

      const data = payloadWords.slice(start, end);
      if (tag === DESCRIPTION_TAG && preview.description === null) {
        const descriptionBytes = bech32.fromWords(data);
        const decoded = new TextDecoder().decode(descriptionBytes).trim();
        if (decoded) preview.description = decoded;
      }

      if (tag === EXPIRY_TAG && explicitExpirySec === null) {
        const parsedExpiry = parseWordNumber(data);
        if (parsedExpiry !== null && parsedExpiry > 0) {
          explicitExpirySec = parsedExpiry;
        }
      }

      offset = end;
    }

    if (timestampSec !== null && timestampSec > 0) {
      preview.expiresAtSec =
        timestampSec + (explicitExpirySec ?? DEFAULT_EXPIRY_SECONDS);
    }
  } catch {
    return preview;
  }

  return preview;
};
