import { Schema } from "effect";
import { WrapDelivery } from "../domain/delivery";
import { ClientId, Pubkey, RumorId, UnixSeconds } from "../domain/primitives";

const LOWERCASE_HEX_64 = /^[0-9a-f]{64}$/;
const LOWERCASE_HEX_24 = /^[0-9a-f]{24}$/;

export const MessageText = Schema.NonEmptyTrimmedString.pipe(
  Schema.brand("MessageText"),
);
export type MessageText = typeof MessageText.Type;

export class PrivateImage extends Schema.Class<PrivateImage>("PrivateImage")({
  url: Schema.NonEmptyTrimmedString,
  fileType: Schema.NonEmptyTrimmedString,
  encryptionAlgorithm: Schema.Literal("aes-gcm"),
  key: Schema.String.pipe(Schema.pattern(LOWERCASE_HEX_64)),
  nonce: Schema.String.pipe(Schema.pattern(LOWERCASE_HEX_24)),
  encryptedSha256: Schema.String.pipe(Schema.pattern(LOWERCASE_HEX_64)),
  originalSha256: Schema.String.pipe(Schema.pattern(LOWERCASE_HEX_64)),
  encryptedSize: Schema.Int.pipe(Schema.positive()),
  width: Schema.Int.pipe(Schema.positive()),
  height: Schema.Int.pipe(Schema.positive()),
  storageEncoding: Schema.Literal("base64", "raw"),
}) {}

export class TextMessageDraft extends Schema.Class<TextMessageDraft>(
  "TextMessageDraft",
)({
  to: Pubkey,
  content: MessageText,
  replyTo: Schema.optional(RumorId),
  root: Schema.optional(RumorId),
  clientId: Schema.optional(ClientId),
}) {}

export class ImageMessageDraft extends Schema.Class<ImageMessageDraft>(
  "ImageMessageDraft",
)({
  to: Pubkey,
  image: PrivateImage,
  replyTo: Schema.optional(RumorId),
  root: Schema.optional(RumorId),
  clientId: Schema.optional(ClientId),
}) {}

export class EditMessageDraft extends Schema.Class<EditMessageDraft>(
  "EditMessageDraft",
)({
  to: Pubkey,
  editOf: RumorId,
  content: MessageText,
  clientId: Schema.optional(ClientId),
}) {}

export class ChatMessageReceipt extends Schema.Class<ChatMessageReceipt>(
  "ChatMessageReceipt",
)({
  messageId: RumorId,
  clientId: ClientId,
  sentAt: UnixSeconds,
  selfCopy: WrapDelivery,
  recipientCopy: WrapDelivery,
}) {}

export class MessageEditReceipt extends Schema.Class<MessageEditReceipt>(
  "MessageEditReceipt",
)({
  messageId: RumorId,
  editOf: RumorId,
  clientId: ClientId,
  sentAt: UnixSeconds,
  selfCopy: WrapDelivery,
  recipientCopy: WrapDelivery,
}) {}
