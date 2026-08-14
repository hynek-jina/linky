import type { UnsignedEvent } from "nostr-tools";
import {
  getLinkyBankPaymentOfferMessageText,
  LINKY_BANK_PAYMENT_OFFER_KIND,
  LINKY_BANK_PAYMENT_OFFER_VALUE,
  type LinkyBankPaymentOfferStatus,
} from "../app/lib/bankPaymentOffer";

export const createLinkyBankPaymentOfferEvent = (args: {
  amountText: string;
  amountSat?: number | null;
  bankPaidAtSec?: number | null;
  clientId: string;
  createdAt: number;
  expiresAtSec?: number | null;
  extensionSec?: number | null;
  initiatedAtSec?: number | null;
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
  const contentPayload: Record<string, unknown> = {
    amountText: args.amountText,
    offerId,
    offererPublicKey,
    status,
    statusUpdatedAtSec: args.createdAt,
    text: getLinkyBankPaymentOfferMessageText(
      args.amountText,
      status,
      args.extensionSec,
    ),
    type: "linky.bank_payment_offer",
    version: 1,
  };
  const initiatedAtSec =
    typeof args.initiatedAtSec === "number" &&
    Number.isFinite(args.initiatedAtSec) &&
    args.initiatedAtSec > 0
      ? Math.trunc(args.initiatedAtSec)
      : status === "offered"
        ? Math.trunc(args.createdAt)
        : null;
  if (initiatedAtSec !== null) contentPayload.initiatedAtSec = initiatedAtSec;

  const bankPaidAtSec =
    typeof args.bankPaidAtSec === "number" &&
    Number.isFinite(args.bankPaidAtSec) &&
    args.bankPaidAtSec > 0
      ? Math.trunc(args.bankPaidAtSec)
      : status === "bank_paid"
        ? Math.trunc(args.createdAt)
        : null;
  if (bankPaidAtSec !== null) contentPayload.bankPaidAtSec = bankPaidAtSec;

  if (
    typeof args.expiresAtSec === "number" &&
    Number.isFinite(args.expiresAtSec) &&
    args.expiresAtSec > 0
  ) {
    contentPayload.expiresAtSec = Math.trunc(args.expiresAtSec);
  }
  if (
    typeof args.extensionSec === "number" &&
    Number.isFinite(args.extensionSec) &&
    args.extensionSec > 0
  ) {
    contentPayload.extensionSec = Math.trunc(args.extensionSec);
  }
  if (
    typeof args.amountSat === "number" &&
    Number.isFinite(args.amountSat) &&
    args.amountSat > 0
  ) {
    contentPayload.amountSat = Math.round(args.amountSat);
  }
  const spdPayload = String(args.spdPayload ?? "").trim();
  if (spdPayload) contentPayload.spdPayload = spdPayload;

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
    content: JSON.stringify(contentPayload),
  };
};
