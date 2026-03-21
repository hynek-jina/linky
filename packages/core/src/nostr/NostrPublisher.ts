import { Context, Effect, Layer, Schema } from "effect";
import { IdentityProvider } from "../identity";
import type { ProfileMetadata } from "../utils/ProfileMetadata";
import { UnixTimeSeconds, type WebsocketUrl } from "../utils/schemas";
import type {
  ChatMessageDraft,
  ChatReactMessageDraft,
  ChatRemoveReactMessageDraft,
} from "./domain";
import {
  ErrorFinalizingNostrEvent,
  ErrorSendingNostrEvent,
  ErrorWrappingNostrEvent,
} from "./domain";
import { NostrPool } from "./NostrPool";
import type {
  GiftWrappedPublishReceipt,
  PublishedNostrEvent,
} from "./PublishReceipt";
import {
  makeCancelChatMessageReactionEventDraft,
  makeChatMessageEventDraft,
  makeChatMessageReactionEventDraft,
} from "./utils/nostrChatEventDrafts";
import {
  makeProfileMetadataEventDraft,
  makeRelayListEventDraft,
} from "./utils/nostrSystemEventDrafts";
import { publishGiftWrappedToRecipients } from "./utils/publishGiftWrappedToRecipients";
import { publishNostrEvent } from "./utils/publishNostrEvent";

export interface NostrPublisherOperations {
  publishChatMessage: (
    message: ChatMessageDraft,
    relays: WebsocketUrl[],
  ) => Effect.Effect<
    GiftWrappedPublishReceipt,
    ErrorSendingNostrEvent | ErrorWrappingNostrEvent
  >;
  publishChatMessageReaction: (
    reaction: ChatReactMessageDraft,
    relays: WebsocketUrl[],
  ) => Effect.Effect<
    GiftWrappedPublishReceipt,
    ErrorSendingNostrEvent | ErrorWrappingNostrEvent
  >;
  cancelChatMessageReaction: (
    reactionCancellation: ChatRemoveReactMessageDraft,
    relays: WebsocketUrl[],
  ) => Effect.Effect<
    GiftWrappedPublishReceipt,
    ErrorSendingNostrEvent | ErrorWrappingNostrEvent
  >;
  publishProfileMetadata: (
    profileMetadata: ProfileMetadata,
    relays: WebsocketUrl[],
  ) => Effect.Effect<
    PublishedNostrEvent,
    ErrorSendingNostrEvent | ErrorFinalizingNostrEvent,
    never
  >;
  publishRelayList: (
    relayList: WebsocketUrl[],
    relays: WebsocketUrl[],
  ) => Effect.Effect<
    PublishedNostrEvent,
    ErrorSendingNostrEvent | ErrorFinalizingNostrEvent,
    never
  >;
}

const currentUnixTimeSeconds = (): UnixTimeSeconds =>
  Schema.decodeUnknownSync(UnixTimeSeconds)(Math.floor(Date.now() / 1000));

export class NostrPublisher extends Context.Tag("NostrPublisher")<
  NostrPublisher,
  NostrPublisherOperations
>() {
  static Live = Layer.effect(
    NostrPublisher,
    Effect.gen(function* () {
      const pool = yield* NostrPool;
      const identity = yield* IdentityProvider;

      return {
        publishChatMessage: (message, relays) =>
          publishGiftWrappedToRecipients({
            event: makeChatMessageEventDraft(message),
            pool,
            recipients: message.recipients,
            relays,
            selfPublicKey: identity.nostrPublicKey,
            signingKey: identity.nostrSigningKey,
          }),
        publishChatMessageReaction: (reaction, relays) =>
          publishGiftWrappedToRecipients({
            event: makeChatMessageReactionEventDraft(reaction),
            pool,
            recipients: reaction.recipients,
            relays,
            selfPublicKey: identity.nostrPublicKey,
            signingKey: identity.nostrSigningKey,
          }),
        cancelChatMessageReaction: (reactionCancellation, relays) =>
          publishGiftWrappedToRecipients({
            event:
              makeCancelChatMessageReactionEventDraft(reactionCancellation),
            pool,
            recipients: reactionCancellation.recipients,
            relays,
            selfPublicKey: identity.nostrPublicKey,
            signingKey: identity.nostrSigningKey,
          }),
        publishProfileMetadata: (profileMetadata, relays) =>
          publishNostrEvent({
            event: makeProfileMetadataEventDraft(
              profileMetadata,
              currentUnixTimeSeconds(),
            ),
            pool,
            relays,
            signingKey: identity.nostrSigningKey,
          }),
        publishRelayList: (relayList, relays) =>
          publishNostrEvent({
            event: makeRelayListEventDraft(relayList, currentUnixTimeSeconds()),
            pool,
            relays,
            signingKey: identity.nostrSigningKey,
          }),
      };
    }),
  );
}
