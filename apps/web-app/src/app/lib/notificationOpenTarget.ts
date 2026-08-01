import { normalizePubkeyHex } from "../hooks/messages/contactIdentity";
import {
  readNotificationOpenData,
  unwrapNotificationOpenValue,
} from "./notificationOpen";

interface NotificationOpenTarget {
  outerEventId: string;
  recipientPubkey: string;
  relayHints: string[];
  senderPubkey: string | null;
}

const NOTIFICATION_OPEN_HASH_PARAM = "notificationOpen";

const readObjectField = (value: unknown, field: string): unknown => {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, field);
};

export const readNotificationOpenRoute = (value: unknown): string | null => {
  const source = unwrapNotificationOpenValue(value);
  if (typeof source === "string") {
    const normalized = source.trim();
    return normalized || null;
  }

  const notification = unwrapNotificationOpenValue(
    readObjectField(source, "notification"),
  );
  const data = unwrapNotificationOpenValue(
    readObjectField(notification, "data") ?? readObjectField(source, "data"),
  );
  const normalized = String(
    readObjectField(source, "route") ?? readObjectField(data, "route") ?? "",
  ).trim();
  return normalized || null;
};

const readNotificationRelayHints = (value: unknown): string[] => {
  const source = readNotificationOpenData(value);
  if (!Array.isArray(source)) return [];

  const seen = new Set<string>();
  const relayHints: string[] = [];
  for (const entry of source) {
    const relay = String(entry ?? "").trim();
    if (
      !relay ||
      !(relay.startsWith("wss://") || relay.startsWith("ws://")) ||
      seen.has(relay)
    ) {
      continue;
    }
    seen.add(relay);
    relayHints.push(relay);
  }
  return relayHints;
};

/**
 * Reads ONLY the outer wrap id from a notification-open detail.
 *
 * Split out of `readNotificationOpenTarget` because that function hard-requires
 * `recipientPubkey` and returns `null` without it — which is exactly the Phase 8
 * defect (D3). The record-store-first resolution in `useScanNativeComposition`
 * has to run BEFORE the strict parse, so it needs the id on its own.
 *
 * Returns a trimmed non-empty string or `null`. It deliberately does NOT
 * validate the id as 64-hex: the value is used only as a lookup key against the
 * CURRENT owner's own records, never as a network parameter and never as a
 * branded id, so a garbage value simply finds nothing.
 */
export const readNotificationOpenOuterEventId = (
  value: unknown,
): string | null => {
  const source = unwrapNotificationOpenValue(value);
  if (typeof source !== "object" || source === null) return null;

  const outerEventId = String(
    readObjectField(source, "outerEventId") ?? "",
  ).trim();
  return outerEventId || null;
};

export const readNotificationOpenTarget = (
  value: unknown,
): NotificationOpenTarget | null => {
  const source = unwrapNotificationOpenValue(value);
  if (typeof source !== "object" || source === null) return null;

  // Delegated so there is exactly ONE place that knows where the id lives; the
  // strict parse and the local record-store lookup cannot drift apart.
  const outerEventId = readNotificationOpenOuterEventId(value);
  const recipientPubkey = normalizePubkeyHex(
    readObjectField(source, "recipientPubkey"),
  );
  const relayHints = readNotificationRelayHints(
    readObjectField(source, "relayHints"),
  );
  const senderPubkey = normalizePubkeyHex(
    readObjectField(source, "senderPubkey"),
  );

  // NOT weakened by plan 09-04. D3 is fixed by SUPPLYING `recipientPubkey`
  // (plan 09-03) and by adding a local, zero-network path AROUND this parser —
  // never by letting a detail without a recipient through it (T-09-22).
  if (!outerEventId || !recipientPubkey) return null;

  return { outerEventId, recipientPubkey, relayHints, senderPubkey };
};

export const consumeNotificationOpenDetailFromHash = (): string | null => {
  if (typeof window === "undefined") return null;

  const rawHash = String(window.location.hash ?? "");
  const queryIndex = rawHash.indexOf("?");
  if (queryIndex < 0) return null;

  const baseHash = rawHash.slice(0, queryIndex) || "#contacts";
  const params = new URLSearchParams(rawHash.slice(queryIndex + 1));
  const detail = params.get(NOTIFICATION_OPEN_HASH_PARAM);
  if (!detail) return null;

  params.delete(NOTIFICATION_OPEN_HASH_PARAM);
  const nextQuery = params.toString();
  const nextHash = nextQuery ? `${baseHash}?${nextQuery}` : baseHash;
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${nextHash}`,
  );

  return detail;
};
