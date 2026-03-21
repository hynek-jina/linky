import { Data } from "effect";
import type { NostrPublicKeyHex } from "../../identity";
import type { NostrEventDraft } from "./NostrEvent";

export class ErrorFinalizingNostrEvent extends Data.TaggedError(
  "ErrorFinalizingNostrEvent",
)<{
  cause: unknown;
  message: string;
  originalEvent: NostrEventDraft;
}> {}

export class ErrorSendingNostrEvent extends Data.TaggedError(
  "ErrorSendingNostrEvent",
)<{ cause: unknown; message: string }> {}

export class ErrorWrappingNostrEvent extends Data.TaggedError(
  "ErrorWrappingNostrEvent",
)<{
  cause: unknown;
  message: string;
  originalEvent: NostrEventDraft;
  toPublicKey?: NostrPublicKeyHex;
}> {}
