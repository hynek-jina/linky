import type { UnsignedEvent } from "nostr-tools";

export const LINKY_BANK_PAYMENT_OFFER_KIND = 24135;
export const LINKY_BANK_PAYMENT_OFFER_VALUE = "bank_payment_offer";
export const LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC = 5 * 60;
export const LINKY_BANK_PAYMENT_OFFER_DEFAULT_RECIPIENT_COUNT = 2;
export const LINKY_BANK_PAYMENT_OFFER_MIN_RECIPIENT_COUNT = 1;
export const LINKY_BANK_PAYMENT_OFFER_MAX_RECIPIENT_COUNT = 10;
export const LINKY_BANK_PAYMENT_OFFER_RECIPIENT_STATUS_CURRENCY = "CZK";

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

const readObjectField = (value: unknown, field: string): unknown => {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, field);
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
