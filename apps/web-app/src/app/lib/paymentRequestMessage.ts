import { decodeNprofilePubkey } from "@linky/linkstr";
import { decode, encode } from "cbor-x";
import { isRecord } from "../../utils/unknown";
import { trimString } from "../../utils/validation";

type PaymentRequestTransport = {
  a: string;
  g?: string[][];
  t: string;
};

type PaymentRequestPayload = {
  a?: number;
  d?: string;
  i?: string;
  m?: string[];
  s?: boolean;
  t?: PaymentRequestTransport[];
  u?: string;
};

export interface CashuPaymentRequestMessageInfo {
  amount: number;
  description: string | null;
  encodedRequest: string;
  mintUrls: string[];
  requestId: string | null;
  transportNprofile: string | null;
  transportPostUrl: string | null;
  transportPubkeyHex: string | null;
  unit: string;
}

const CASHU_PAYMENT_REQUEST_PREFIX = "creqA";
const LINKY_PAYMENT_REQUEST_DECLINE_PREFIX = "linky:req-decline:v1";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isTransportTagArray = (value: unknown): value is string[][] =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      Array.isArray(entry) && entry.every((item) => typeof item === "string"),
  );

const isPaymentRequestTransport = (
  value: unknown,
): value is PaymentRequestTransport => {
  if (!isRecord(value)) return false;
  if (typeof value.t !== "string" || typeof value.a !== "string") return false;
  if (value.g === undefined) return true;
  return isTransportTagArray(value.g);
};

const isPaymentRequestPayload = (
  value: unknown,
): value is PaymentRequestPayload => {
  if (!isRecord(value)) return false;
  if (value.i !== undefined && typeof value.i !== "string") return false;
  if (value.a !== undefined && typeof value.a !== "number") return false;
  if (value.u !== undefined && typeof value.u !== "string") return false;
  if (value.s !== undefined && typeof value.s !== "boolean") return false;
  if (value.d !== undefined && typeof value.d !== "string") return false;
  if (value.m !== undefined && !isStringArray(value.m)) return false;
  if (
    value.t !== undefined &&
    (!Array.isArray(value.t) || !value.t.every(isPaymentRequestTransport))
  ) {
    return false;
  }
  return true;
};

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const base64UrlToBytes = (input: string): Uint8Array | null => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let idx = 0; idx < binary.length; idx += 1) {
      bytes[idx] = binary.charCodeAt(idx);
    }
    return bytes;
  } catch {
    return null;
  }
};

export const buildCashuPaymentRequestMessage = (args: {
  amount: number;
  description?: string | null;
  mintUrls: readonly string[];
  recipientNprofile: string;
  requestId?: string | null;
}): string => {
  const payload: PaymentRequestPayload = {
    a: args.amount,
    u: "sat",
    s: true,
    m: args.mintUrls.map((mintUrl) => trimString(mintUrl)).filter(Boolean),
    t: [
      {
        t: "nostr",
        a: args.recipientNprofile,
        g: [["n", "17"]],
      },
    ],
  };

  const requestId = trimString(args.requestId);
  if (requestId) payload.i = requestId;

  const description = trimString(args.description);
  if (description) payload.d = description;

  return `${CASHU_PAYMENT_REQUEST_PREFIX}${bytesToBase64Url(encode(payload))}`;
};

export const parseCashuPaymentRequestMessage = (
  value: string,
): CashuPaymentRequestMessageInfo | null => {
  const normalized = trimString(value);
  if (!normalized.startsWith(CASHU_PAYMENT_REQUEST_PREFIX)) return null;

  const bytes = base64UrlToBytes(
    normalized.slice(CASHU_PAYMENT_REQUEST_PREFIX.length),
  );
  if (!bytes) return null;

  let decoded: unknown;
  try {
    decoded = decode(bytes);
  } catch {
    return null;
  }

  if (!isPaymentRequestPayload(decoded)) return null;
  if (
    !Number.isFinite(decoded.a) ||
    decoded.a === undefined ||
    decoded.a <= 0
  ) {
    return null;
  }

  const unit = trimString(decoded.u).toLowerCase();
  if (unit !== "sat") return null;

  const transports = Array.isArray(decoded.t) ? decoded.t : [];
  const nostrTransport =
    transports.find((transport) => trimString(transport.t) === "nostr") ?? null;
  const transportTarget = nostrTransport ? trimString(nostrTransport.a) : "";
  const transportNprofile =
    transportTarget && decodeNprofilePubkey(transportTarget)
      ? transportTarget
      : null;
  const transportPubkeyHex = transportNprofile
    ? decodeNprofilePubkey(transportNprofile)
    : null;
  const postTransport =
    transports.find((transport) => trimString(transport.t) === "post") ?? null;
  const transportPostUrl = postTransport ? trimString(postTransport.a) : null;

  return {
    amount: Math.trunc(decoded.a),
    description: trimString(decoded.d) || null,
    encodedRequest: normalized,
    mintUrls: Array.isArray(decoded.m)
      ? decoded.m.map((mintUrl) => trimString(mintUrl)).filter(Boolean)
      : [],
    requestId: trimString(decoded.i) || null,
    transportNprofile,
    transportPostUrl,
    transportPubkeyHex,
    unit,
  };
};

export const buildLinkyPaymentRequestDeclineMessage = (
  requestRumorId: string,
) => `${LINKY_PAYMENT_REQUEST_DECLINE_PREFIX}:${trimString(requestRumorId)}`;

export const parseLinkyPaymentRequestDeclineMessage = (
  value: string,
): { requestRumorId: string | null } | null => {
  const normalized = trimString(value);
  if (!normalized.startsWith(`${LINKY_PAYMENT_REQUEST_DECLINE_PREFIX}:`)) {
    return null;
  }

  const requestRumorId = trimString(
    normalized.slice(LINKY_PAYMENT_REQUEST_DECLINE_PREFIX.length + 1),
  );

  return {
    requestRumorId: requestRumorId || null,
  };
};
