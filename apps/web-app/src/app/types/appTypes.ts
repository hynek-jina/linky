import type { CashuTokenId, ContactId } from "../../evolu";
import type {
  TelemetryAppRuntime,
  TelemetryDevicePlatform,
} from "../../platform/runtime";
import type { JsonValue } from "../../types/json";

export type PaymentTelemetryStatus = "declined" | "error" | "ok";

export type LocalPaymentEvent = {
  amount: number | null;
  contactId: string | null;
  createdAtSec: number;
  direction: "in" | "out";
  error: string | null;
  fee: number | null;
  id: string;
  method?: PaymentTelemetryMethod | null;
  mint: string | null;
  phase?: PaymentTelemetryPhase | null;
  status: PaymentTelemetryStatus;
  unit: string | null;
};

export type PaymentTelemetryMethod =
  | "cashu_chat"
  | "cashu_receive"
  | "cashu_restore"
  | "lightning_address"
  | "lightning_invoice"
  | "unknown";

export type PaymentTelemetryPhase =
  | "complete"
  | "invoice_fetch"
  | "melt"
  | "publish"
  | "receive"
  | "restore"
  | "swap"
  | "unknown";

export type LoggedPaymentEventParams = {
  amount?: number | null;
  contactId?: ContactId | string | null;
  details?: JsonValue | null;
  direction: "in" | "out";
  error?: string | null;
  fee?: number | null;
  method?: PaymentTelemetryMethod | null;
  mint?: string | null;
  note?: string | null;
  phase?: PaymentTelemetryPhase | null;
  status: PaymentTelemetryStatus;
  unit?: string | null;
};

export type LocalPaymentTelemetryEvent = {
  amountBucket: string | null;
  appHost?: string | null;
  appRuntime?: TelemetryAppRuntime | null;
  appVersion: string;
  attemptCount: number;
  createdAtSec: number;
  devicePlatform?: TelemetryDevicePlatform | null;
  direction: "in" | "out";
  errorCode: string | null;
  errorDetail: string | null;
  feeBucket: string | null;
  id: string;
  lastAttemptAtSec: number | null;
  method: PaymentTelemetryMethod;
  mint: string | null;
  nextAttemptAtSec: number;
  phase: PaymentTelemetryPhase;
  status: PaymentTelemetryStatus;
};

export type LocalNostrMessage = {
  clientId?: string;
  contactId: string;
  content: string;
  createdAtSec: number;
  direction: "in" | "out";
  editedAtSec?: number | null;
  editedFromId?: string | null;
  id: string;
  isEdited?: boolean;
  localOnly?: boolean;
  originalContent?: string | null;
  pubkey: string;
  replyToContent?: string | null;
  replyToId?: string | null;
  rootMessageId?: string | null;
  rumorId: string | null;
  status?: "sent" | "pending";
  wrapId: string;
};

export type LocalNostrReaction = {
  clientId?: string;
  createdAtSec: number;
  emoji: string;
  id: string;
  messageId: string;
  reactorPubkey: string;
  status?: "sent" | "pending";
  wrapId: string;
};

export type LocalPendingPayment = {
  amountSat: number;
  contactId: string;
  createdAtSec: number;
  id: string;
  messageId?: string;
};

export type OptionalText =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | { toString(): string }
  | null
  | undefined;
export type OptionalNumber =
  | number
  | string
  | bigint
  | boolean
  | { toString(): string }
  | null
  | undefined;
export type OptionalBooleanTextNumber =
  | boolean
  | string
  | number
  | null
  | undefined;
export type ContactIdLike = ContactId | string | null | undefined;

export type PaymentLogField = JsonValue;
export type PaymentLogData = Record<string, PaymentLogField>;

export type PublishWrappedResult = {
  anySuccess: boolean;
  error:
    | string
    | number
    | boolean
    | bigint
    | symbol
    | { toString(): string }
    | null
    | undefined;
};

export type ContactRowLike = {
  archivedAtSec?: OptionalNumber;
  groupName?: OptionalText;
  id?: ContactIdLike;
  isUnknownContact?: boolean;
  lnAddress?: OptionalText;
  name?: OptionalText;
  npub?: OptionalText;
  ownerId?: OptionalText;
};

export type ContactIdentityRowLike = {
  id?: ContactIdLike;
  npub?: OptionalText;
  ownerId?: OptionalText;
};

export type ContactNameRowLike = {
  archivedAtSec?: OptionalNumber;
  id?: ContactIdLike;
  isUnknownContact?: boolean;
  name?: OptionalText;
};

export type ContactPayRowLike = {
  id?: ContactIdLike;
  lnAddress?: OptionalText;
  name?: OptionalText;
};

export type ChatMessageRowLike = {
  clientId?: OptionalText;
  content?: OptionalText;
  editedAtSec?: OptionalNumber;
  editedFromId?: OptionalText;
  direction?: OptionalText;
  id?: OptionalText;
  isEdited?: OptionalText;
  localOnly?: OptionalText;
  originalContent?: OptionalText;
  pubkey?: OptionalText;
  replyToContent?: OptionalText;
  replyToId?: OptionalText;
  rootMessageId?: OptionalText;
  rumorId?: OptionalText;
  status?: OptionalText;
  wrapId?: OptionalText;
};

export type NostrMessageSummaryRow = {
  content?: OptionalText;
  direction?: OptionalText;
  id?: OptionalText;
  wrapId?: OptionalText;
};

export type RouteWithOptionalId = {
  id?: ContactIdLike;
  kind: string;
};

export type MintUrlInput =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | { toString(): string }
  | null
  | undefined;
export type MintSupportsMppValue = OptionalBooleanTextNumber;

export type CashuTokenRowLike = {
  amount?: OptionalNumber;
  error?: OptionalText;
  id?: CashuTokenId | string | null;
  isDeleted?: OptionalText;
  lastCheckedAtSec?: OptionalNumber;
  mint?: OptionalText;
  rawToken?: OptionalText;
  state?: OptionalText;
  token?: OptionalText;
  unit?: OptionalText;
};

export type LocalMintInfoRow = {
  feesJson?: OptionalText;
  firstSeenAtSec?: OptionalNumber;
  id: string;
  infoJson?: OptionalText;
  isDeleted?: OptionalText;
  lastCheckedAtSec?: OptionalNumber;
  lastSeenAtSec?: OptionalNumber;
  supportsMpp?: MintSupportsMppValue;
  url: string;
};

export type ContactsGuideKey =
  | "add_contact"
  | "topup"
  | "pay"
  | "message"
  | "backup_keys";

export type ContactsGuideStep = {
  bodyKey: string;
  ensure?: () => void;
  id: string;
  selector: string;
  titleKey: string;
};

export type ContactFormState = {
  group: string;
  lnAddress: string;
  name: string;
  npub: string;
};

export type CashuTokenMeta = {
  amount: number | null;
  mint: string | null;
  tokenText: string;
  unit: string | null;
};

export type TopbarButton = {
  icon: string;
  label: string;
  onClick: () => void;
};

export type NewLocalNostrMessage = Omit<LocalNostrMessage, "id" | "status"> & {
  status?: "sent" | "pending";
};

export type UpdateLocalNostrMessageFields = Pick<
  LocalNostrMessage,
  | "clientId"
  | "content"
  | "editedAtSec"
  | "editedFromId"
  | "isEdited"
  | "localOnly"
  | "originalContent"
  | "pubkey"
  | "replyToContent"
  | "replyToId"
  | "rootMessageId"
  | "rumorId"
  | "status"
  | "wrapId"
>;

export type UpdateLocalNostrMessage = (
  id: string,
  updates: Partial<UpdateLocalNostrMessageFields>,
) => void;

export type NewLocalNostrReaction = Omit<
  LocalNostrReaction,
  "id" | "status"
> & {
  status?: "sent" | "pending";
};

export type UpdateLocalNostrReactionFields = Pick<
  LocalNostrReaction,
  "clientId" | "emoji" | "messageId" | "reactorPubkey" | "status" | "wrapId"
>;

export type UpdateLocalNostrReaction = (
  id: string,
  updates: Partial<UpdateLocalNostrReactionFields>,
) => void;

export type ChatReactionChip = {
  count: number;
  emoji: string;
  reactedByMe: boolean;
};
