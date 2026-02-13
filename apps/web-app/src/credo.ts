import { schnorr } from "@noble/curves/secp256k1";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { sha256 } from "js-sha256";
import { nip19 } from "nostr-tools";

export const CREDO_WIRE_PREFIX = "credoA";

export type CredoPromisePayload = {
  type: "promise";
  version: 1;
  amount: number;
  created_at: number;
  expires_at: number;
  issuer: string;
  nonce: string;
  recipient: string;
  unit: string;
};

export type CredoPromiseMessage = {
  issuer_sig: string;
  promise: CredoPromisePayload;
  promise_id: string;
};

export type CredoSettlementPayload = {
  type: "settlement";
  version: 1;
  amount?: number;
  issuer: string;
  nonce?: string;
  promise_id: string;
  recipient: string;
  settled_at: number;
  unit?: string;
};

export type CredoSettlementMessage = {
  recipient_sig: string;
  settlement: CredoSettlementPayload;
  settlement_id: string;
};

export type CredoParsedMessage =
  | {
      kind: "promise";
      isValid: boolean;
      issuerSig: string;
      promise: CredoPromisePayload;
      promiseId: string;
      token: string;
    }
  | {
      kind: "settlement";
      isValid: boolean;
      recipientSig: string;
      settlement: CredoSettlementPayload;
      settlementId: string;
      token: string;
    };

const encodeBase64Url = (input: Uint8Array): string => {
  const binary = Array.from(input, (b) => String.fromCharCode(b)).join("");
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const decodeBase64Url = (input: string): Uint8Array | null => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  try {
    const binary = atob(`${normalized}${pad}`);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
};

const canonicalize = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries = keys.map(
      (k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`,
    );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(String(value));
};

const sha256Hex = (input: string): string => sha256(input);

const decodeNpubToHex = (npub: string): string | null => {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== "npub") return null;
    return decoded.data as string;
  } catch {
    return null;
  }
};

export const extractCredoTokenFromText = (text: string): string | null => {
  const raw = String(text ?? "");
  if (!raw) return null;
  const match = raw.match(/credoA[0-9A-Za-z_-]+/);
  return match ? match[0] : null;
};

export const decodeCredoMessage = (
  token: string,
): CredoPromiseMessage | CredoSettlementMessage | null => {
  const raw = String(token ?? "").trim();
  if (!raw.startsWith(CREDO_WIRE_PREFIX)) return null;
  const payload = raw.slice(CREDO_WIRE_PREFIX.length);
  if (!payload) return null;
  const bytes = decodeBase64Url(payload);
  if (!bytes) return null;
  try {
    const jsonText = new TextDecoder().decode(bytes);
    const obj = JSON.parse(jsonText) as Record<string, unknown> | null;
    if (!obj || typeof obj !== "object") return null;
    if (obj.promise && typeof obj.promise === "object")
      return obj as CredoPromiseMessage;
    if (obj.settlement && typeof obj.settlement === "object")
      return obj as CredoSettlementMessage;
    return null;
  } catch {
    return null;
  }
};

export const parseCredoMessage = (
  text: string,
  nowSec = Math.floor(Date.now() / 1000),
): CredoParsedMessage | null => {
  const token = extractCredoTokenFromText(text);
  if (!token) return null;
  const decoded = decodeCredoMessage(token);
  if (!decoded) return null;

  if ("promise" in decoded) {
    const promise = decoded.promise as CredoPromisePayload;
    const promiseId = String(decoded.promise_id ?? "").trim();
    const issuerSig = String(decoded.issuer_sig ?? "").trim();
    if (!promiseId || !issuerSig) return null;

    const payloadCanonical = canonicalize(promise);
    const computedId = sha256Hex(payloadCanonical);
    if (computedId !== promiseId)
      return {
        kind: "promise",
        token,
        promise,
        promiseId,
        issuerSig,
        isValid: false,
      };

    const issuerHex = decodeNpubToHex(String(promise.issuer ?? ""));
    const isSignatureValid = issuerHex
      ? schnorr.verify(issuerSig, hexToBytes(promiseId), issuerHex)
      : false;

    const expiresAt = Number(promise.expires_at ?? 0) || 0;
    const isValid = isSignatureValid && nowSec < expiresAt;
    return { kind: "promise", token, promise, promiseId, issuerSig, isValid };
  }

  const settlement = (decoded as CredoSettlementMessage)
    .settlement as CredoSettlementPayload;
  const settlementId = String(
    (decoded as CredoSettlementMessage).settlement_id ?? "",
  ).trim();
  const recipientSig = String(
    (decoded as CredoSettlementMessage).recipient_sig ?? "",
  ).trim();
  if (!settlementId || !recipientSig) return null;

  const payloadCanonical = canonicalize(settlement);
  const computedId = sha256Hex(payloadCanonical);
  if (computedId !== settlementId)
    return {
      kind: "settlement",
      token,
      settlement,
      settlementId,
      recipientSig,
      isValid: false,
    };

  const recipientHex = decodeNpubToHex(String(settlement.recipient ?? ""));
  const isSignatureValid = recipientHex
    ? schnorr.verify(recipientSig, hexToBytes(settlementId), recipientHex)
    : false;
  return {
    kind: "settlement",
    token,
    settlement,
    settlementId,
    recipientSig,
    isValid: isSignatureValid,
  };
};

export const createCredoPromiseToken = (args: {
  issuerNpub: string;
  issuerNsec: Uint8Array;
  recipientNpub: string;
  amount: number;
  unit?: string;
  expiresAtSec: number;
  createdAtSec?: number;
}): { token: string; promiseId: string; message: CredoPromiseMessage } => {
  const createdAt =
    typeof args.createdAtSec === "number" && args.createdAtSec > 0
      ? Math.floor(args.createdAtSec)
      : Math.floor(Date.now() / 1000);
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  const nonce = bytesToHex(nonceBytes);

  const promise: CredoPromisePayload = {
    type: "promise",
    version: 1,
    issuer: args.issuerNpub,
    recipient: args.recipientNpub,
    amount: Math.max(1, Math.floor(args.amount)),
    unit: args.unit ?? "sat",
    nonce,
    expires_at: Math.floor(args.expiresAtSec),
    created_at: createdAt,
  };

  const promiseId = sha256Hex(canonicalize(promise));
  const issuerSig = bytesToHex(
    schnorr.sign(hexToBytes(promiseId), args.issuerNsec),
  );
  const message: CredoPromiseMessage = {
    promise,
    promise_id: promiseId,
    issuer_sig: issuerSig,
  };

  const encoded = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(message)),
  );
  return { token: `${CREDO_WIRE_PREFIX}${encoded}`, promiseId, message };
};

export const createCredoSettlementToken = (args: {
  recipientNsec: Uint8Array;
  promiseId: string;
  issuerNpub: string;
  recipientNpub: string;
  amount?: number;
  unit?: string;
  settledAtSec?: number;
}): {
  token: string;
  settlementId: string;
  message: CredoSettlementMessage;
} => {
  const settledAt =
    typeof args.settledAtSec === "number" && args.settledAtSec > 0
      ? Math.floor(args.settledAtSec)
      : Math.floor(Date.now() / 1000);
  const settlement: CredoSettlementPayload = {
    type: "settlement",
    version: 1,
    promise_id: args.promiseId,
    recipient: args.recipientNpub,
    issuer: args.issuerNpub,
    settled_at: settledAt,
  };

  if (typeof args.amount === "number" && args.amount > 0) {
    settlement.amount = Math.floor(args.amount);
    settlement.unit = args.unit ?? "sat";
    const nonceBytes = new Uint8Array(32);
    crypto.getRandomValues(nonceBytes);
    settlement.nonce = bytesToHex(nonceBytes);
  }

  const settlementId = sha256Hex(canonicalize(settlement));
  const recipientSig = bytesToHex(
    schnorr.sign(hexToBytes(settlementId), args.recipientNsec),
  );
  const message: CredoSettlementMessage = {
    settlement,
    settlement_id: settlementId,
    recipient_sig: recipientSig,
  };

  const encoded = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(message)),
  );
  return { token: `${CREDO_WIRE_PREFIX}${encoded}`, settlementId, message };
};
