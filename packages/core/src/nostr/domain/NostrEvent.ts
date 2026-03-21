import { Schema } from "effect";
import { NostrPublicKeyHex } from "../../identity";
import {
  Hex64LowercaseString,
  Hex128LowercaseString,
  UnixTimeSeconds,
} from "../../utils/schemas";
import { NostrTag } from "./NostrTag";

export const SchorrSign = Hex128LowercaseString.pipe(
  Schema.brand("SchorrSign"),
);

export const NostrEventId = Hex64LowercaseString.pipe(
  Schema.brand("NostrEventId"),
);
export type NostrEventId = typeof NostrEventId.Type;

const Kind = Schema.Number.pipe(Schema.nonNegative(), Schema.int());

const NostrEventDraftFields = {
  kind: Kind,
  content: Schema.String,
  created_at: UnixTimeSeconds,
  tags: Schema.optionalWith(Schema.Array(NostrTag), { default: () => [] }),
};

export const NostrEventDraft = Schema.Struct(NostrEventDraftFields);
export type NostrEventDraft = typeof NostrEventDraft.Type;

export const NostrRumor = Schema.Struct({
  ...NostrEventDraftFields,
  pubkey: NostrPublicKeyHex,
  id: NostrEventId,
});
export type NostrRumor = typeof NostrRumor.Type;

export const NostrEvent = Schema.Struct({
  ...NostrEventDraftFields,
  pubkey: NostrPublicKeyHex,
  id: NostrEventId,
  sig: SchorrSign,
});
export type NostrEvent = typeof NostrEvent.Type;
