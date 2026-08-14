import { Schema } from "effect";
import { ClientId, Pubkey, RumorId, UnixSeconds } from "../domain/primitives";
import { BankOfferId, BankOfferStatus } from "./domain";

export class BankOfferSnapshotReceived extends Schema.TaggedClass<BankOfferSnapshotReceived>()(
  "BankOfferSnapshotReceived",
  {
    snapshotId: RumorId,
    from: Pubkey,
    offerId: BankOfferId,
    offerer: Pubkey,
    status: BankOfferStatus,
    amountText: Schema.String,
    text: Schema.NullOr(Schema.String),
    amountSat: Schema.NullOr(Schema.Int),
    initiatedAtSec: Schema.NullOr(UnixSeconds),
    bankPaidAtSec: Schema.NullOr(UnixSeconds),
    expiresAtSec: Schema.NullOr(UnixSeconds),
    extensionSec: Schema.NullOr(Schema.Int),
    spdPayload: Schema.NullOr(Schema.String),
    statusUpdatedAtSec: Schema.NullOr(UnixSeconds),
    clientId: Schema.NullOr(ClientId),
    sentAt: UnixSeconds,
  },
) {}

export const BankOfferInboxEvent = Schema.Union(BankOfferSnapshotReceived);
export type BankOfferInboxEvent = typeof BankOfferInboxEvent.Type;
