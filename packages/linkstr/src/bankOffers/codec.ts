import { Either, Option, Schema } from "effect";
import { ClientId, Pubkey, RumorId, UnixSeconds } from "../domain/primitives";
import type { DropReason } from "../inbox/events";
import { Rumor, rumorWithHash, tagValues } from "../internal/nostrEvent";
import type { NostrTags } from "../internal/nostrEvent";
import { BankOfferId, BankOfferStatus } from "./domain";
import type { BankOfferDraft } from "./domain";
import {
  BankOfferSnapshotReceived,
  OwnBankOfferSnapshotConfirmed,
} from "./events";
import type { BankOfferInboxEvent } from "./events";

export const BANK_OFFER_KIND = 24135;
export const BANK_OFFER_VALUE = "bank_payment_offer";

const isBankOfferId = Schema.is(BankOfferId);
const isBankOfferStatus = Schema.is(BankOfferStatus);
const isClientId = Schema.is(ClientId);
const isNonEmptyTrimmedString = Schema.is(Schema.NonEmptyTrimmedString);
const isPositiveInt = Schema.is(Schema.Int.pipe(Schema.positive()));
const isPubkey = Schema.is(Pubkey);
const isRumorId = Schema.is(RumorId);
const isUnixSeconds = Schema.is(UnixSeconds);
const decodeJsonRecord = Schema.decodeUnknownOption(
  Schema.parseJson(
    Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  ),
);

export const encodeBankOfferRumor = (
  draft: BankOfferDraft,
  author: Pubkey,
  sentAt: UnixSeconds,
  clientId: ClientId,
): Rumor => {
  const initiatedAtSec =
    draft.initiatedAtSec ?? (draft.status === "offered" ? sentAt : undefined);
  const bankPaidAtSec =
    draft.bankPaidAtSec ?? (draft.status === "bank_paid" ? sentAt : undefined);
  const content = JSON.stringify({
    amountText: draft.amountText,
    offerId: draft.offerId,
    offererPublicKey: draft.offerer,
    status: draft.status,
    statusUpdatedAtSec: sentAt,
    text: draft.text,
    type: "linky.bank_payment_offer",
    version: 1,
    ...(initiatedAtSec === undefined ? {} : { initiatedAtSec }),
    ...(bankPaidAtSec === undefined ? {} : { bankPaidAtSec }),
    ...(draft.expiresAtSec === undefined
      ? {}
      : { expiresAtSec: draft.expiresAtSec }),
    ...(draft.extensionSec === undefined
      ? {}
      : { extensionSec: draft.extensionSec }),
    ...(draft.amountSat === undefined ? {} : { amountSat: draft.amountSat }),
    ...(draft.spdPayload === undefined ? {} : { spdPayload: draft.spdPayload }),
  });

  return rumorWithHash({
    pubkey: author,
    created_at: sentAt,
    kind: BANK_OFFER_KIND,
    tags: [
      ["p", draft.to],
      ["p", author],
      ["client", clientId],
      ["offer", draft.offerId],
      ["offerer", draft.offerer],
      ["linky", BANK_OFFER_VALUE],
      ["status", draft.status],
    ],
    content,
  });
};

const firstTrimmedTagValue = (tags: NostrTags, name: string): string | null => {
  for (const tag of tags) {
    if (tag[0] !== name) continue;
    const value = tag[1]?.trim();
    if (value) return value;
  }
  return null;
};

const trimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isNonEmptyTrimmedString(trimmed) ? trimmed : null;
};

const positiveInt = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const integer = Math.trunc(value);
  return isPositiveInt(integer) ? integer : null;
};

const unixSeconds = (value: unknown): UnixSeconds | null => {
  const integer = positiveInt(value);
  return integer !== null && isUnixSeconds(integer) ? integer : null;
};

const clientIdOf = (tags: NostrTags): ClientId | null => {
  const value = firstTrimmedTagValue(tags, "client");
  return value !== null && isClientId(value) ? value : null;
};

const decodeContent = (content: string) =>
  Option.flatMap(decodeJsonRecord(content), (record) => {
    const offerIdText = trimmedString(record.offerId);
    const amountText = trimmedString(record.amountText);
    const offererText = trimmedString(record.offererPublicKey);
    if (
      record.type !== "linky.bank_payment_offer" ||
      offerIdText === null ||
      !isBankOfferId(offerIdText) ||
      amountText === null ||
      !isBankOfferStatus(record.status)
    ) {
      return Option.none();
    }
    return Option.some({
      record,
      offerId: offerIdText,
      amountText,
      status: record.status,
      offererText,
    });
  });

export const decodeBankOfferRumor = (
  rumor: Rumor,
  me: Pubkey,
): Either.Either<BankOfferInboxEvent, DropReason> => {
  const snapshotId = rumor.id;
  if (
    rumor.kind !== BANK_OFFER_KIND ||
    !rumor.tags.some(
      (tag) => tag[0] === "linky" && tag[1] === BANK_OFFER_VALUE,
    ) ||
    !tagValues(rumor.tags, "p").includes(me) ||
    !isRumorId(snapshotId)
  ) {
    return Either.left("invalid-bank-offer");
  }

  return Option.match(decodeContent(rumor.content), {
    onNone: () => Either.left<DropReason>("invalid-bank-offer"),
    onSome: ({ amountText, offerId, offererText, record, status }) => {
      const offerer =
        offererText ?? firstTrimmedTagValue(rumor.tags, "offerer");
      if (offerer === null || !isPubkey(offerer)) {
        return Either.left<DropReason>("invalid-bank-offer");
      }
      const snapshot = {
        snapshotId,
        offerId,
        offerer,
        status,
        amountText,
        text: trimmedString(record.text),
        amountSat: positiveInt(record.amountSat),
        initiatedAtSec: unixSeconds(record.initiatedAtSec),
        bankPaidAtSec: unixSeconds(record.bankPaidAtSec),
        expiresAtSec: unixSeconds(record.expiresAtSec),
        extensionSec: positiveInt(record.extensionSec),
        spdPayload: trimmedString(record.spdPayload),
        statusUpdatedAtSec: unixSeconds(record.statusUpdatedAtSec),
        clientId: clientIdOf(rumor.tags),
        sentAt: rumor.created_at,
      };
      if (rumor.pubkey !== me) {
        return Either.right(
          new BankOfferSnapshotReceived({ from: rumor.pubkey, ...snapshot }),
        );
      }
      const to =
        tagValues(rumor.tags, "p")
          .filter((value) => value !== rumor.pubkey)
          .find(isPubkey) ?? null;
      if (to === null) return Either.left<DropReason>("invalid-bank-offer");
      return Either.right(
        new OwnBankOfferSnapshotConfirmed({ to, ...snapshot }),
      );
    },
  });
};
