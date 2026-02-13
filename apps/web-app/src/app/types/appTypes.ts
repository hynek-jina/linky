import type { CredoTokenId } from "../../evolu";

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

export type LocalMintInfoRow = {
  feesJson?: unknown;
  firstSeenAtSec?: unknown;
  id: string;
  infoJson?: unknown;
  isDeleted?: unknown;
  lastCheckedAtSec?: unknown;
  lastSeenAtSec?: unknown;
  supportsMpp?: unknown;
  url: string;
};

export type CredoTokenRow = {
  amount?: unknown;
  contactId?: unknown;
  createdAtSec?: unknown;
  direction?: unknown;
  expiresAtSec?: unknown;
  id: CredoTokenId;
  isDeleted?: unknown;
  issuer?: unknown;
  promiseId?: unknown;
  rawToken?: unknown;
  recipient?: unknown;
  settledAmount?: unknown;
  settledAtSec?: unknown;
  unit?: unknown;
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
