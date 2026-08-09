import { Schema } from "effect";
import { unwrapEvent, wrapEvent } from "nostr-tools/nip59";
import type { NostrSecretKey, Pubkey } from "../domain/primitives";
import { Rumor, SignedWrapEvent } from "./nostrEvent";

const decodeWrap = Schema.decodeUnknownSync(SignedWrapEvent);
const decodeRumor = Schema.decodeUnknownSync(Rumor);

export const wrapRumorFor = (
  rumor: Rumor,
  senderSecretKey: NostrSecretKey,
  recipient: Pubkey,
): SignedWrapEvent => decodeWrap(wrapEvent(rumor, senderSecretKey, recipient));

/** Throws on undecryptable or malformed wraps; callers decide the drop reason. */
export const unwrapToRumor = (
  wrap: SignedWrapEvent,
  recipientSecretKey: NostrSecretKey,
): Rumor => decodeRumor(unwrapEvent(wrap, recipientSecretKey));
