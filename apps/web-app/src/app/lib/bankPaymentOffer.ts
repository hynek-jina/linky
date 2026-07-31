import type { UnsignedEvent } from "nostr-tools";

export const LINKY_BANK_PAYMENT_OFFER_KIND = 24135;
export const LINKY_BANK_PAYMENT_OFFER_VALUE = "bank_payment_offer";
export const LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC = 5 * 60;
export const LINKY_BANK_PAYMENT_OFFER_DEFAULT_RECIPIENT_COUNT = 2;
export const LINKY_BANK_PAYMENT_OFFER_MIN_RECIPIENT_COUNT = 1;
export const LINKY_BANK_PAYMENT_OFFER_MAX_RECIPIENT_COUNT = 10;
export const LINKY_BANK_PAYMENT_OFFER_RECIPIENT_STATUS_CURRENCY = "CZK";
const LINKY_BANK_PAYMENT_OFFER_MINIMIZED_STORAGE_KEY_PREFIX =
  "linky.bank_payment_offer_minimized.v1";
const LINKY_BANK_PAYMENT_OFFER_SPD_STORAGE_KEY_PREFIX =
  "linky.bank_payment_offer_spd.v1";
const LINKY_BANK_PAYMENT_OFFER_SPD_MAX_AGE_SEC = 60 * 60;
export const LINKY_BANK_PAYMENT_OFFER_DETAILS_LOCK_KEY_PREFIX =
  "linky.bank_payment_offer_details_lock.v1";

export type LinkyBankPaymentOfferStatus =
  | "accepted"
  | "bank_details_sent"
  | "bank_paid"
  | "canceled"
  | "declined"
  | "offered"
  | "settled";

export interface LinkyBankPaymentOfferInfo {
  amountSat: number | null;
  amountText: string;
  offerId: string;
  offererPublicKey: string | null;
  spdPayload: string | null;
  status: LinkyBankPaymentOfferStatus;
  statusUpdatedAtSec: number | null;
  text: string;
}

export const isLinkyBankPaymentOfferExpired = (
  offerInfo: LinkyBankPaymentOfferInfo,
  createdAtSec: number,
  nowSec: number,
): boolean => {
  if (isLinkyBankPaymentOfferTerminalStatus(offerInfo.status)) return false;

  const phaseStartedAtSecRaw =
    offerInfo.statusUpdatedAtSec && offerInfo.statusUpdatedAtSec > 0
      ? offerInfo.statusUpdatedAtSec
      : createdAtSec;
  const phaseStartedAtSec =
    Number.isFinite(phaseStartedAtSecRaw) && phaseStartedAtSecRaw > 0
      ? Math.trunc(phaseStartedAtSecRaw)
      : null;
  if (!phaseStartedAtSec) return false;

  return nowSec - phaseStartedAtSec >= LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC;
};

const getMinimizedOfferStorageKey = (chatId: string, offerId: string): string =>
  `${LINKY_BANK_PAYMENT_OFFER_MINIMIZED_STORAGE_KEY_PREFIX}.${encodeURIComponent(chatId)}.${encodeURIComponent(offerId)}`;

export const isLinkyBankPaymentOfferMinimized = (
  chatId: string,
  offerId: string,
): boolean => {
  try {
    return (
      window.sessionStorage.getItem(
        getMinimizedOfferStorageKey(chatId, offerId),
      ) === "1"
    );
  } catch {
    return false;
  }
};

export const setLinkyBankPaymentOfferMinimized = (
  chatId: string,
  offerId: string,
  minimized: boolean,
): void => {
  try {
    const key = getMinimizedOfferStorageKey(chatId, offerId);
    if (minimized) {
      window.sessionStorage.setItem(key, "1");
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Session storage can be unavailable in privacy-restricted browsers.
  }
};

const readObjectField = (value: unknown, field: string): unknown => {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, field);
};

export interface LinkyBankPaymentOfferSpdRecord {
  createdAtSec: number;
  ownerPubkey: string;
  sentCandidateKeys: string[];
  spdPayload: string;
}

const isLinkyBankPaymentOfferSpdRecord = (
  value: unknown,
): value is LinkyBankPaymentOfferSpdRecord => {
  const createdAtSec = readObjectField(value, "createdAtSec");
  const ownerPubkey = readObjectField(value, "ownerPubkey");
  const sentCandidateKeys = readObjectField(value, "sentCandidateKeys");
  const spdPayload = readObjectField(value, "spdPayload");
  return (
    typeof createdAtSec === "number" &&
    Number.isFinite(createdAtSec) &&
    createdAtSec > 0 &&
    typeof ownerPubkey === "string" &&
    Array.isArray(sentCandidateKeys) &&
    sentCandidateKeys.every((key) => typeof key === "string") &&
    typeof spdPayload === "string" &&
    spdPayload.trim() !== ""
  );
};

// One storage key per offer so concurrent tabs working on different offers
// never overwrite each other's records.
const getSpdRecordStorageKey = (offerId: string): string =>
  `${LINKY_BANK_PAYMENT_OFFER_SPD_STORAGE_KEY_PREFIX}.${encodeURIComponent(offerId)}`;

// A future createdAtSec (backward clock jump) also counts as expired so a
// record can never outlive the intended one-hour window.
const isExpiredSpdRecord = (
  record: LinkyBankPaymentOfferSpdRecord,
  nowSec: number,
): boolean =>
  record.createdAtSec > nowSec ||
  nowSec - record.createdAtSec >= LINKY_BANK_PAYMENT_OFFER_SPD_MAX_AGE_SEC;

const readSpdRecordByStorageKey = (
  storageKey: string,
): LinkyBankPaymentOfferSpdRecord | null => {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isLinkyBankPaymentOfferSpdRecord(parsed)) return parsed;
  } catch {
    // ignore corrupted storage content
  }
  return null;
};

const writeSpdRecord = (
  offerId: string,
  record: LinkyBankPaymentOfferSpdRecord,
): void => {
  try {
    window.localStorage.setItem(
      getSpdRecordStorageKey(offerId),
      JSON.stringify(record),
    );
  } catch {
    // Local storage can be unavailable in privacy-restricted browsers.
  }
};

const pruneExpiredSpdRecords = (nowSec: number): void => {
  try {
    const staleKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (
        !key?.startsWith(`${LINKY_BANK_PAYMENT_OFFER_SPD_STORAGE_KEY_PREFIX}.`)
      ) {
        continue;
      }
      const record = readSpdRecordByStorageKey(key);
      if (!record || isExpiredSpdRecord(record, nowSec)) staleKeys.push(key);
    }
    for (const key of staleKeys) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

export const rememberLinkyBankPaymentOfferSpdPayload = (args: {
  offerId: string;
  ownerPubkey: string;
  spdPayload: string;
}): void => {
  const offerId = args.offerId.trim();
  const spdPayload = args.spdPayload.trim();
  if (!offerId || !spdPayload) return;

  const nowSec = Math.floor(Date.now() / 1000);
  pruneExpiredSpdRecords(nowSec);
  writeSpdRecord(offerId, {
    createdAtSec: nowSec,
    ownerPubkey: args.ownerPubkey,
    sentCandidateKeys: [],
    spdPayload,
  });
};

export const readLinkyBankPaymentOfferSpdRecord = (args: {
  offerId: string;
  ownerPubkey: string;
}): LinkyBankPaymentOfferSpdRecord | null => {
  const record = readSpdRecordByStorageKey(
    getSpdRecordStorageKey(args.offerId),
  );
  if (!record) return null;
  // Delete rather than just hide an expired record so a later clock
  // correction cannot bring it back to life.
  if (isExpiredSpdRecord(record, Math.floor(Date.now() / 1000))) {
    forgetLinkyBankPaymentOfferSpdPayload(args.offerId);
    return null;
  }
  if (record.ownerPubkey !== args.ownerPubkey) return null;
  return record;
};

export const markLinkyBankPaymentOfferBankDetailsSent = (args: {
  candidateKey: string;
  offerId: string;
}): void => {
  const record = readSpdRecordByStorageKey(
    getSpdRecordStorageKey(args.offerId),
  );
  if (!record || record.sentCandidateKeys.includes(args.candidateKey)) return;
  writeSpdRecord(args.offerId, {
    ...record,
    sentCandidateKeys: [...record.sentCandidateKeys, args.candidateKey],
  });
};

export const forgetLinkyBankPaymentOfferSpdPayload = (
  offerId: string,
): void => {
  try {
    window.localStorage.removeItem(getSpdRecordStorageKey(offerId));
  } catch {
    // ignore
  }
};

const isLinkyBankPaymentOfferStatus = (
  value: unknown,
): value is LinkyBankPaymentOfferStatus =>
  value === "accepted" ||
  value === "bank_details_sent" ||
  value === "bank_paid" ||
  value === "canceled" ||
  value === "declined" ||
  value === "offered" ||
  value === "settled";

export const isLinkyBankPaymentOfferTerminalStatus = (
  status: LinkyBankPaymentOfferStatus,
): boolean =>
  status === "canceled" || status === "declined" || status === "settled";

// Unlike `declined`, which only ends one recipient's thread, these statuses
// end the offer for every recipient.
export const isLinkyBankPaymentOfferWholeOfferTerminalStatus = (
  status: LinkyBankPaymentOfferStatus,
): boolean => status === "canceled" || status === "settled";

export const getLinkyBankPaymentOfferStatusRank = (
  status: LinkyBankPaymentOfferStatus,
): number => {
  switch (status) {
    case "offered":
      return 0;
    case "accepted":
      return 1;
    case "bank_details_sent":
      return 2;
    case "bank_paid":
      return 3;
    case "declined":
      return 4;
    case "canceled":
      return 5;
    case "settled":
      return 6;
  }
};

const getOfferText = (
  amountText: string,
  status: LinkyBankPaymentOfferStatus,
): string => {
  switch (status) {
    case "accepted":
      return "Nabídka byla přijata. Platební údaje se odesílají.";
    case "bank_details_sent":
      return `Platební údaje jsou připravené. Zaplať ${amountText} do 5 minut.`;
    case "bank_paid":
      return `Bankovní platba za ${amountText} byla označena jako zaplacená. Zkontroluj ji a odešli saty.`;
    case "canceled":
      return "Nabídka byla zrušena. Bankovní platbu už neposílej.";
    case "declined":
      return `Nabídka platby za ${amountText} byla odmítnuta`;
    case "offered":
      return `Zaplatíš za mě bankovní platbu ve výši ${amountText}?`;
    case "settled":
      return `Platba za ${amountText} byla dokončena`;
  }
};

export const shouldPushLinkyBankPaymentOfferStatus = (
  status: LinkyBankPaymentOfferStatus,
): boolean =>
  status === "accepted" ||
  status === "bank_details_sent" ||
  status === "bank_paid" ||
  status === "declined" ||
  status === "offered";

export const createLinkyBankPaymentOfferEvent = (args: {
  amountText: string;
  amountSat?: number | null;
  clientId: string;
  createdAt: number;
  offererPublicKey?: string;
  offerId?: string;
  recipientPublicKey: string;
  senderPublicKey: string;
  spdPayload?: string | null;
  status?: LinkyBankPaymentOfferStatus;
}): UnsignedEvent => {
  const status = args.status ?? "offered";
  const offerId = String(args.offerId ?? args.clientId).trim();
  const offererPublicKey =
    String(args.offererPublicKey ?? "").trim() || args.senderPublicKey;
  const text = getOfferText(args.amountText, status);
  const contentPayload: Record<string, unknown> = {
    amountText: args.amountText,
    offerId,
    offererPublicKey,
    status,
    statusUpdatedAtSec: args.createdAt,
    text,
    type: "linky.bank_payment_offer",
    version: 1,
  };
  if (
    typeof args.amountSat === "number" &&
    Number.isFinite(args.amountSat) &&
    args.amountSat > 0
  ) {
    contentPayload.amountSat = Math.round(args.amountSat);
  }
  const spdPayload = String(args.spdPayload ?? "").trim();
  if (spdPayload) {
    contentPayload.spdPayload = spdPayload;
  }
  const content = JSON.stringify(contentPayload);

  return {
    created_at: args.createdAt,
    kind: LINKY_BANK_PAYMENT_OFFER_KIND,
    pubkey: args.senderPublicKey,
    tags: [
      ["p", args.recipientPublicKey],
      ["p", args.senderPublicKey],
      ["client", args.clientId],
      ["offer", offerId],
      ["offerer", offererPublicKey],
      ["linky", LINKY_BANK_PAYMENT_OFFER_VALUE],
      ["status", status],
    ],
    content,
  };
};

export const isLinkyBankPaymentOfferEvent = (event: {
  kind: number;
  tags?: unknown;
}): boolean => {
  const tags = Array.isArray(event.tags) ? event.tags : [];

  return (
    event.kind === LINKY_BANK_PAYMENT_OFFER_KIND &&
    tags.some(
      (tag) =>
        Array.isArray(tag) &&
        tag[0] === "linky" &&
        tag[1] === LINKY_BANK_PAYMENT_OFFER_VALUE,
    )
  );
};

export const getLinkyBankPaymentOfferInfo = (
  content: string,
): LinkyBankPaymentOfferInfo | null => {
  try {
    const parsed: unknown = JSON.parse(content);
    const type = readObjectField(parsed, "type");
    if (type !== "linky.bank_payment_offer") return null;

    const offerId = readObjectField(parsed, "offerId");
    const amountText = readObjectField(parsed, "amountText");
    const amountSat = readObjectField(parsed, "amountSat");
    const status = readObjectField(parsed, "status");
    const statusUpdatedAtSec = readObjectField(parsed, "statusUpdatedAtSec");
    if (typeof offerId !== "string" || !offerId.trim()) return null;
    if (typeof amountText !== "string" || !amountText.trim()) return null;
    if (!isLinkyBankPaymentOfferStatus(status)) return null;

    const text = readObjectField(parsed, "text");
    const offererPublicKey = readObjectField(parsed, "offererPublicKey");
    const spdPayload = readObjectField(parsed, "spdPayload");

    return {
      amountSat:
        typeof amountSat === "number" &&
        Number.isFinite(amountSat) &&
        amountSat > 0
          ? Math.round(amountSat)
          : null,
      amountText: amountText.trim(),
      offerId: offerId.trim(),
      offererPublicKey:
        typeof offererPublicKey === "string" && offererPublicKey.trim()
          ? offererPublicKey.trim()
          : null,
      spdPayload:
        typeof spdPayload === "string" && spdPayload.trim()
          ? spdPayload.trim()
          : null,
      status,
      statusUpdatedAtSec:
        typeof statusUpdatedAtSec === "number" &&
        Number.isFinite(statusUpdatedAtSec) &&
        statusUpdatedAtSec > 0
          ? Math.trunc(statusUpdatedAtSec)
          : null,
      text:
        typeof text === "string" && text.trim()
          ? text.trim()
          : getOfferText(amountText.trim(), status),
    };
  } catch {
    // ignore invalid offer content
  }

  return null;
};

export const getLinkyBankPaymentOfferText = (
  content: string,
): string | null => {
  return getLinkyBankPaymentOfferInfo(content)?.text ?? null;
};
