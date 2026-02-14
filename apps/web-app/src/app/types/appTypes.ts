import type { CashuTokenId, ContactId, CredoTokenId } from "../../evolu";
import type { JsonValue } from "../../types/json";

export type LocalPaymentEvent = {
  amount: number | null;
  contactId: string | null;
  createdAtSec: number;
  direction: "in" | "out";
  error: string | null;
  fee: number | null;
  id: string;
  mint: string | null;
  status: "ok" | "error";
  unit: string | null;
};

export type LocalNostrMessage = {
  clientId?: string;
  contactId: string;
  content: string;
  createdAtSec: number;
  direction: "in" | "out";
  id: string;
  localOnly?: boolean;
  pubkey: string;
  rumorId: string | null;
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
  groupName?: OptionalText;
  id?: ContactIdLike;
  lnAddress?: OptionalText;
  name?: OptionalText;
  npub?: OptionalText;
};

export type ContactIdentityRowLike = {
  id?: ContactIdLike;
  npub?: OptionalText;
};

export type ContactNameRowLike = {
  id?: ContactIdLike;
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
  direction?: OptionalText;
  id?: OptionalText;
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

export type CredoTokenRow = {
  amount?: OptionalNumber;
  contactId?: OptionalText;
  createdAtSec?: OptionalNumber;
  direction?: OptionalText;
  expiresAtSec?: OptionalNumber;
  id: CredoTokenId;
  isDeleted?: OptionalText;
  issuer?: OptionalText;
  promiseId?: OptionalText;
  rawToken?: OptionalText;
  recipient?: OptionalText;
  settledAmount?: OptionalNumber;
  settledAtSec?: OptionalNumber;
  unit?: OptionalText;
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
