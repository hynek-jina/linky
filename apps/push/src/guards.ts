import type { Event as NostrEvent } from "nostr-tools";

import type {
  NativePushSubscriptionData,
  NativeSubscribeRequestBody,
  NativeUnsubscribeRequestBody,
  OwnershipProofInput,
  ProofAction,
  SubscribeRequestBody,
  UnsubscribeRequestBody,
  WebPushSubscriptionData,
} from "./types";

export class RequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isRecord(
  value: unknown,
): value is Record<string | number | symbol, unknown> {
  return typeof value === "object" && value !== null;
}

export function isHexString(value: string, length: number): boolean {
  const pattern = new RegExp(`^[a-f0-9]{${length}}$`);
  return pattern.test(value);
}

function readString(
  value: unknown,
  fieldName: string,
  status = 400,
  code = "invalid_request",
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RequestError(
      status,
      code,
      `${fieldName} must be a non-empty string`,
    );
  }
  return value;
}

function readOptionalString(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RequestError(
      400,
      "invalid_request",
      "Optional string fields must be non-empty when provided",
    );
  }
  return value;
}

function readStringWithMaxLength(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  const normalized = readString(value, fieldName);
  if (normalized.length > maxLength) {
    throw new RequestError(
      400,
      "invalid_request",
      `${fieldName} exceeds max length ${maxLength}`,
    );
  }
  return normalized;
}

function readBoolean(
  value: unknown,
  fieldName: string,
  fallback = false,
): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new RequestError(
      400,
      "invalid_request",
      `${fieldName} must be a boolean`,
    );
  }
  return value;
}

function readNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RequestError(
      400,
      "invalid_request",
      `${fieldName} must be a number`,
    );
  }
  return value;
}

function readNullableNumber(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return readNumber(value, fieldName);
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new RequestError(
      400,
      "invalid_request",
      `${fieldName} must be an array`,
    );
  }

  const out: string[] = [];
  for (const item of value) {
    out.push(readString(item, fieldName));
  }
  return out;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }

  return out;
}

export function readProofAction(value: unknown): ProofAction {
  if (value === undefined) {
    return "subscribe";
  }
  if (value === "subscribe" || value === "unsubscribe") {
    return value;
  }
  throw new RequestError(
    400,
    "invalid_request",
    "action must be either subscribe or unsubscribe",
  );
}

export function readPubkey(value: unknown, fieldName = "pubkey"): string {
  const pubkey = readString(value, fieldName);
  if (!isHexString(pubkey, 64)) {
    throw new RequestError(
      400,
      "invalid_request",
      `${fieldName} must be a 64-character lowercase hex pubkey`,
    );
  }
  return pubkey;
}

function readTagList(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    throw new RequestError(
      400,
      "invalid_request",
      "event.tags must be an array",
    );
  }

  const out: string[][] = [];
  for (const tag of value) {
    if (!Array.isArray(tag)) {
      throw new RequestError(
        400,
        "invalid_request",
        "event.tags entries must be arrays",
      );
    }
    const normalizedTag: string[] = [];
    for (const part of tag) {
      normalizedTag.push(readString(part, "event.tags[]"));
    }
    out.push(normalizedTag);
  }
  return out;
}

export function readNostrEvent(value: unknown): NostrEvent {
  if (!isRecord(value)) {
    throw new RequestError(400, "invalid_request", "event must be an object");
  }

  const id = readString(value.id, "event.id");
  if (!isHexString(id, 64)) {
    throw new RequestError(
      400,
      "invalid_request",
      "event.id must be a 64-character lowercase hex string",
    );
  }

  const sig = readString(value.sig, "event.sig");
  if (!isHexString(sig, 128)) {
    throw new RequestError(
      400,
      "invalid_request",
      "event.sig must be a 128-character lowercase hex string",
    );
  }

  return {
    id,
    pubkey: readPubkey(value.pubkey, "event.pubkey"),
    created_at: readNumber(value.created_at, "event.created_at"),
    kind: readNumber(value.kind, "event.kind"),
    tags: readTagList(value.tags),
    content: readString(value.content, "event.content"),
    sig,
  };
}

export function readWebPushSubscription(
  value: unknown,
): WebPushSubscriptionData {
  if (!isRecord(value)) {
    throw new RequestError(
      400,
      "invalid_request",
      "subscription must be an object",
    );
  }

  const keysValue = value.keys;
  if (!isRecord(keysValue)) {
    throw new RequestError(
      400,
      "invalid_request",
      "subscription.keys must be an object",
    );
  }

  return {
    endpoint: readString(value.endpoint, "subscription.endpoint"),
    expirationTime: readNullableNumber(
      value.expirationTime,
      "subscription.expirationTime",
    ),
    keys: {
      p256dh: readString(keysValue.p256dh, "subscription.keys.p256dh"),
      auth: readString(keysValue.auth, "subscription.keys.auth"),
    },
  };
}

export function readNativePushSubscription(
  value: unknown,
): NativePushSubscriptionData {
  if (!isRecord(value)) {
    throw new RequestError(400, "invalid_request", "device must be an object");
  }

  const platform = readString(value.platform, "device.platform");
  if (platform !== "android") {
    throw new RequestError(
      400,
      "invalid_request",
      "device.platform must be android",
    );
  }

  return {
    platform,
    token: readStringWithMaxLength(value.token, "device.token", 4096),
  };
}

export function readOwnershipProofs(value: unknown): OwnershipProofInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new RequestError(
      400,
      "invalid_request",
      "proofs must be a non-empty array",
    );
  }

  const out: OwnershipProofInput[] = [];
  for (const proofValue of value) {
    if (!isRecord(proofValue)) {
      throw new RequestError(
        400,
        "invalid_request",
        "Each proof must be an object",
      );
    }
    out.push({
      pubkey: readPubkey(proofValue.pubkey, "proof.pubkey"),
      event: readNostrEvent(proofValue.event),
    });
  }
  return out;
}

export function readSubscribeRequest(value: unknown): SubscribeRequestBody {
  if (!isRecord(value)) {
    throw new RequestError(400, "invalid_request", "Body must be an object");
  }

  const recipientPubkeys = uniqueStrings(
    readStringArray(value.recipientPubkeys, "recipientPubkeys").map((pubkey) =>
      readPubkey(pubkey, "recipientPubkeys[]"),
    ),
  );

  if (recipientPubkeys.length === 0) {
    throw new RequestError(
      400,
      "invalid_request",
      "recipientPubkeys must contain at least one pubkey",
    );
  }

  return {
    cleanupLegacySubscriptions: readBoolean(
      value.cleanupLegacySubscriptions,
      "cleanupLegacySubscriptions",
      false,
    ),
    installationId: readOptionalString(value.installationId),
    subscription: readWebPushSubscription(value.subscription),
    recipientPubkeys,
    proofs: readOwnershipProofs(value.proofs),
  };
}

export function readNativeSubscribeRequest(
  value: unknown,
): NativeSubscribeRequestBody {
  if (!isRecord(value)) {
    throw new RequestError(400, "invalid_request", "Body must be an object");
  }

  const recipientPubkeys = uniqueStrings(
    readStringArray(value.recipientPubkeys, "recipientPubkeys").map((pubkey) =>
      readPubkey(pubkey, "recipientPubkeys[]"),
    ),
  );

  if (recipientPubkeys.length === 0) {
    throw new RequestError(
      400,
      "invalid_request",
      "recipientPubkeys must contain at least one pubkey",
    );
  }

  return {
    cleanupLegacySubscriptions: readBoolean(
      value.cleanupLegacySubscriptions,
      "cleanupLegacySubscriptions",
      false,
    ),
    installationId: readOptionalString(value.installationId),
    device: readNativePushSubscription(value.device),
    recipientPubkeys,
    proofs: readOwnershipProofs(value.proofs),
  };
}

function readEndpointOrSubscriptionEndpoint(
  value: Record<string | number | symbol, unknown>,
): string {
  const endpoint = readOptionalString(value.endpoint);
  const subscriptionValue = value.subscription;

  if (subscriptionValue === undefined) {
    if (endpoint === null) {
      throw new RequestError(
        400,
        "invalid_request",
        "endpoint or subscription.endpoint is required",
      );
    }
    return endpoint;
  }

  const subscription = readWebPushSubscription(subscriptionValue);
  if (endpoint !== null && endpoint !== subscription.endpoint) {
    throw new RequestError(
      400,
      "invalid_request",
      "endpoint must match subscription.endpoint when both are provided",
    );
  }
  return subscription.endpoint;
}

export function readUnsubscribeRequest(value: unknown): UnsubscribeRequestBody {
  if (!isRecord(value)) {
    throw new RequestError(400, "invalid_request", "Body must be an object");
  }

  const endpoint = readEndpointOrSubscriptionEndpoint(value);
  const recipientPubkeys = uniqueStrings(
    readStringArray(value.recipientPubkeys, "recipientPubkeys").map((pubkey) =>
      readPubkey(pubkey, "recipientPubkeys[]"),
    ),
  );
  if (recipientPubkeys.length === 0) {
    throw new RequestError(
      400,
      "invalid_request",
      "recipientPubkeys must contain at least one pubkey",
    );
  }

  return {
    endpoint,
    recipientPubkeys,
    proofs: readOwnershipProofs(value.proofs),
  };
}

export function readNativeUnsubscribeRequest(
  value: unknown,
): NativeUnsubscribeRequestBody {
  if (!isRecord(value)) {
    throw new RequestError(400, "invalid_request", "Body must be an object");
  }

  const recipientPubkeys = uniqueStrings(
    readStringArray(value.recipientPubkeys, "recipientPubkeys").map((pubkey) =>
      readPubkey(pubkey, "recipientPubkeys[]"),
    ),
  );
  if (recipientPubkeys.length === 0) {
    throw new RequestError(
      400,
      "invalid_request",
      "recipientPubkeys must contain at least one pubkey",
    );
  }

  return {
    token: readStringWithMaxLength(value.token, "token", 4096),
    recipientPubkeys,
    proofs: readOwnershipProofs(value.proofs),
  };
}
