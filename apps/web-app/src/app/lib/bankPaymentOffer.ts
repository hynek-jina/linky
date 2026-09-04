import type { LocalNostrMessage } from "../types/appTypes";
import { readField } from "../../utils/unknown";

export const LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC = 5 * 60;
export const LINKY_BANK_PAYMENT_OFFER_DEFAULT_RECIPIENT_COUNT = 2;
export const LINKY_BANK_PAYMENT_OFFER_MIN_RECIPIENT_COUNT = 1;
export const LINKY_BANK_PAYMENT_OFFER_MAX_RECIPIENT_COUNT = 10;
export const LINKY_BANK_PAYMENT_OFFER_DEFAULT_STAGGER_DELAY_SEC = 0;
export const LINKY_BANK_PAYMENT_OFFER_MIN_STAGGER_DELAY_SEC = 0;
export const LINKY_BANK_PAYMENT_OFFER_MAX_STAGGER_DELAY_SEC = 30;
export const LINKY_BANK_PAYMENT_OFFER_STAGGER_DELAY_STEP_SEC = 5;
const LINKY_BANK_PAYMENT_OFFER_MINIMIZED_STORAGE_KEY_PREFIX =
  "linky.bank_payment_offer_minimized.v1";
const LINKY_BANK_PAYMENT_OFFER_SPD_STORAGE_KEY_PREFIX =
  "linky.bank_payment_offer_spd.v1";
const LINKY_BANK_PAYMENT_OFFER_SPD_MAX_AGE_SEC = 60 * 60;
export const LINKY_BANK_PAYMENT_OFFER_DETAILS_LOCK_KEY_PREFIX =
  "linky.bank_payment_offer_details_lock.v1";
const LINKY_BANK_PAYMENT_OFFER_STAGGER_STORAGE_KEY_PREFIX =
  "linky.bank_payment_offer_stagger.v1";
export const LINKY_BANK_PAYMENT_OFFER_STAGGER_LOCK_KEY_PREFIX =
  "linky.bank_payment_offer_stagger_lock.v1";

export type LinkyBankPaymentOfferStatus =
  | "accepted"
  | "accepted_by_other"
  | "bank_details_sent"
  | "bank_paid"
  | "canceled"
  | "declined"
  | "offered"
  | "settled";

export interface LinkyBankPaymentOfferInfo {
  amountSat: number | null;
  amountText: string;
  bankPaidAtSec: number | null;
  expiresAtSec: number | null;
  extensionSec: number | null;
  initiatedAtSec: number | null;
  offerId: string;
  offererPublicKey: string | null;
  spdPayload: string | null;
  status: LinkyBankPaymentOfferStatus;
  statusUpdatedAtSec: number | null;
  text: string;
}

export const getLinkyBankPaymentOfferExpiresAtSec = (
  offerInfo: LinkyBankPaymentOfferInfo,
  createdAtSec: number,
): number | null => {
  if (isLinkyBankPaymentOfferTerminalStatus(offerInfo.status)) return null;
  if (offerInfo.expiresAtSec && offerInfo.expiresAtSec > 0) {
    return offerInfo.expiresAtSec;
  }

  const phaseStartedAtSecRaw =
    offerInfo.statusUpdatedAtSec && offerInfo.statusUpdatedAtSec > 0
      ? offerInfo.statusUpdatedAtSec
      : createdAtSec;
  if (!Number.isFinite(phaseStartedAtSecRaw) || phaseStartedAtSecRaw <= 0) {
    return null;
  }
  return (
    Math.trunc(phaseStartedAtSecRaw) + LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC
  );
};

export const isLinkyBankPaymentOfferExpired = (
  offerInfo: LinkyBankPaymentOfferInfo,
  createdAtSec: number,
  nowSec: number,
): boolean => {
  if (isLinkyBankPaymentOfferTerminalStatus(offerInfo.status)) return false;

  const expiresAtSec = getLinkyBankPaymentOfferExpiresAtSec(
    offerInfo,
    createdAtSec,
  );
  return expiresAtSec === null ? false : nowSec >= expiresAtSec;
};

const getMinimizedOfferStorageKey = (chatId: string, offerId: string): string =>
  `${LINKY_BANK_PAYMENT_OFFER_MINIMIZED_STORAGE_KEY_PREFIX}.${encodeURIComponent(chatId)}.${encodeURIComponent(offerId)}`;

export const isLinkyBankPaymentOfferMinimized = (
  chatId: string,
  offerId: string,
): boolean => {
  try {
    return (
      window.sessionStorage.getItem(
        getMinimizedOfferStorageKey(chatId, offerId),
      ) === "1"
    );
  } catch {
    return false;
  }
};

export const setLinkyBankPaymentOfferMinimized = (
  chatId: string,
  offerId: string,
  minimized: boolean,
): void => {
  try {
    const key = getMinimizedOfferStorageKey(chatId, offerId);
    if (minimized) {
      window.sessionStorage.setItem(key, "1");
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Session storage can be unavailable in privacy-restricted browsers.
  }
};

interface LinkyBankPaymentOfferSpdRecord {
  createdAtSec: number;
  ownerPubkey: string;
  sentCandidateKeys: string[];
  spdPayload: string;
}

const isLinkyBankPaymentOfferSpdRecord = (
  value: unknown,
): value is LinkyBankPaymentOfferSpdRecord => {
  const createdAtSec = readField(value, "createdAtSec");
  const ownerPubkey = readField(value, "ownerPubkey");
  const sentCandidateKeys = readField(value, "sentCandidateKeys");
  const spdPayload = readField(value, "spdPayload");
  return (
    typeof createdAtSec === "number" &&
    Number.isFinite(createdAtSec) &&
    createdAtSec > 0 &&
    typeof ownerPubkey === "string" &&
    Array.isArray(sentCandidateKeys) &&
    sentCandidateKeys.every((key) => typeof key === "string") &&
    typeof spdPayload === "string" &&
    spdPayload.trim() !== ""
  );
};

// One storage key per offer so concurrent tabs working on different offers
// never overwrite each other's records.
const getSpdRecordStorageKey = (offerId: string): string =>
  `${LINKY_BANK_PAYMENT_OFFER_SPD_STORAGE_KEY_PREFIX}.${encodeURIComponent(offerId)}`;

// A future createdAtSec (backward clock jump) also counts as expired so a
// record can never outlive the intended one-hour window.
const isExpiredSpdRecord = (
  record: LinkyBankPaymentOfferSpdRecord,
  nowSec: number,
): boolean =>
  record.createdAtSec > nowSec ||
  nowSec - record.createdAtSec >= LINKY_BANK_PAYMENT_OFFER_SPD_MAX_AGE_SEC;

const readSpdRecordByStorageKey = (
  storageKey: string,
): LinkyBankPaymentOfferSpdRecord | null => {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isLinkyBankPaymentOfferSpdRecord(parsed)) return parsed;
  } catch {
    // ignore corrupted storage content
  }
  return null;
};

const writeSpdRecord = (
  offerId: string,
  record: LinkyBankPaymentOfferSpdRecord,
): void => {
  try {
    window.localStorage.setItem(
      getSpdRecordStorageKey(offerId),
      JSON.stringify(record),
    );
  } catch {
    // Local storage can be unavailable in privacy-restricted browsers.
  }
};

const pruneExpiredSpdRecords = (nowSec: number): void => {
  try {
    const staleKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (
        !key?.startsWith(`${LINKY_BANK_PAYMENT_OFFER_SPD_STORAGE_KEY_PREFIX}.`)
      ) {
        continue;
      }
      const record = readSpdRecordByStorageKey(key);
      if (!record || isExpiredSpdRecord(record, nowSec)) staleKeys.push(key);
    }
    for (const key of staleKeys) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

export const rememberLinkyBankPaymentOfferSpdPayload = (args: {
  offerId: string;
  ownerPubkey: string;
  spdPayload: string;
}): void => {
  const offerId = args.offerId.trim();
  const spdPayload = args.spdPayload.trim();
  if (!offerId || !spdPayload) return;

  const nowSec = Math.floor(Date.now() / 1000);
  pruneExpiredSpdRecords(nowSec);
  writeSpdRecord(offerId, {
    createdAtSec: nowSec,
    ownerPubkey: args.ownerPubkey,
    sentCandidateKeys: [],
    spdPayload,
  });
};

export const readLinkyBankPaymentOfferSpdRecord = (args: {
  offerId: string;
  ownerPubkey: string;
}): LinkyBankPaymentOfferSpdRecord | null => {
  const record = readSpdRecordByStorageKey(
    getSpdRecordStorageKey(args.offerId),
  );
  if (!record) return null;
  // Delete rather than just hide an expired record so a later clock
  // correction cannot bring it back to life.
  if (isExpiredSpdRecord(record, Math.floor(Date.now() / 1000))) {
    forgetLinkyBankPaymentOfferSpdPayload(args.offerId);
    return null;
  }
  if (record.ownerPubkey !== args.ownerPubkey) return null;
  return record;
};

export const markLinkyBankPaymentOfferBankDetailsSent = (args: {
  candidateKey: string;
  offerId: string;
}): void => {
  const record = readSpdRecordByStorageKey(
    getSpdRecordStorageKey(args.offerId),
  );
  if (!record || record.sentCandidateKeys.includes(args.candidateKey)) return;
  writeSpdRecord(args.offerId, {
    ...record,
    sentCandidateKeys: [...record.sentCandidateKeys, args.candidateKey],
  });
};

export const forgetLinkyBankPaymentOfferSpdPayload = (
  offerId: string,
): void => {
  try {
    window.localStorage.removeItem(getSpdRecordStorageKey(offerId));
  } catch {
    // ignore
  }
};

interface LinkyBankPaymentOfferStaggerRecipient {
  contactId: string;
  contactPubHex: string;
  dueAtSec: number;
}

export interface LinkyBankPaymentOfferStaggerRecord {
  amountSat: number | null;
  amountText: string;
  createdAtSec: number;
  expiresAtSec: number;
  offerId: string;
  ownerPubkey: string;
  pending: LinkyBankPaymentOfferStaggerRecipient[];
}

const isLinkyBankPaymentOfferStaggerRecipient = (
  value: unknown,
): value is LinkyBankPaymentOfferStaggerRecipient => {
  const contactId = readField(value, "contactId");
  const contactPubHex = readField(value, "contactPubHex");
  const dueAtSec = readField(value, "dueAtSec");
  return (
    typeof contactId === "string" &&
    contactId.trim() !== "" &&
    typeof contactPubHex === "string" &&
    contactPubHex.trim() !== "" &&
    typeof dueAtSec === "number" &&
    Number.isFinite(dueAtSec) &&
    dueAtSec > 0
  );
};

const isLinkyBankPaymentOfferStaggerRecord = (
  value: unknown,
): value is LinkyBankPaymentOfferStaggerRecord => {
  const amountSat = readField(value, "amountSat");
  const amountText = readField(value, "amountText");
  const createdAtSec = readField(value, "createdAtSec");
  const expiresAtSec = readField(value, "expiresAtSec");
  const offerId = readField(value, "offerId");
  const ownerPubkey = readField(value, "ownerPubkey");
  const pending = readField(value, "pending");
  return (
    (amountSat === null ||
      (typeof amountSat === "number" &&
        Number.isFinite(amountSat) &&
        amountSat > 0)) &&
    typeof amountText === "string" &&
    amountText.trim() !== "" &&
    typeof createdAtSec === "number" &&
    Number.isFinite(createdAtSec) &&
    createdAtSec > 0 &&
    typeof expiresAtSec === "number" &&
    Number.isFinite(expiresAtSec) &&
    expiresAtSec > 0 &&
    typeof offerId === "string" &&
    offerId.trim() !== "" &&
    typeof ownerPubkey === "string" &&
    ownerPubkey.trim() !== "" &&
    Array.isArray(pending) &&
    pending.every(isLinkyBankPaymentOfferStaggerRecipient)
  );
};

const getStaggerRecordStorageKey = (offerId: string): string =>
  `${LINKY_BANK_PAYMENT_OFFER_STAGGER_STORAGE_KEY_PREFIX}.${encodeURIComponent(offerId)}`;

// A future createdAtSec (backward clock jump) counts as expired for the same
// reason as the SPD record: the queue must never outlive the offered phase.
const isExpiredStaggerRecord = (
  record: LinkyBankPaymentOfferStaggerRecord,
  nowSec: number,
): boolean => record.createdAtSec > nowSec || nowSec >= record.expiresAtSec;

const readStaggerRecordByStorageKey = (
  storageKey: string,
): LinkyBankPaymentOfferStaggerRecord | null => {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isLinkyBankPaymentOfferStaggerRecord(parsed)) return parsed;
  } catch {
    // ignore corrupted storage content
  }
  return null;
};

export const forgetLinkyBankPaymentOfferStaggerQueue = (
  offerId: string,
): void => {
  try {
    window.localStorage.removeItem(getStaggerRecordStorageKey(offerId));
  } catch {
    // ignore
  }
};

export const rememberLinkyBankPaymentOfferStaggerQueue = (
  record: LinkyBankPaymentOfferStaggerRecord,
): void => {
  if (!record.offerId.trim() || record.pending.length === 0) return;
  try {
    window.localStorage.setItem(
      getStaggerRecordStorageKey(record.offerId),
      JSON.stringify(record),
    );
  } catch {
    // Local storage can be unavailable in privacy-restricted browsers.
  }
};

export const readLinkyBankPaymentOfferStaggerRecords = (
  ownerPubkey: string,
): LinkyBankPaymentOfferStaggerRecord[] => {
  const records: LinkyBankPaymentOfferStaggerRecord[] = [];
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const staleKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (
        !key?.startsWith(
          `${LINKY_BANK_PAYMENT_OFFER_STAGGER_STORAGE_KEY_PREFIX}.`,
        )
      ) {
        continue;
      }
      const record = readStaggerRecordByStorageKey(key);
      if (!record || isExpiredStaggerRecord(record, nowSec)) {
        staleKeys.push(key);
        continue;
      }
      if (record.ownerPubkey !== ownerPubkey) continue;
      records.push(record);
    }
    for (const key of staleKeys) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
  return records;
};

export const removeLinkyBankPaymentOfferStaggerRecipients = (
  offerId: string,
  contactIds: readonly string[],
): void => {
  const record = readStaggerRecordByStorageKey(
    getStaggerRecordStorageKey(offerId),
  );
  if (!record) return;

  const pending = record.pending.filter(
    (recipient) => !contactIds.includes(recipient.contactId),
  );
  if (pending.length === 0) {
    forgetLinkyBankPaymentOfferStaggerQueue(offerId);
    return;
  }
  rememberLinkyBankPaymentOfferStaggerQueue({ ...record, pending });
};

const isLinkyBankPaymentOfferStatus = (
  value: unknown,
): value is LinkyBankPaymentOfferStatus =>
  value === "accepted" ||
  value === "accepted_by_other" ||
  value === "bank_details_sent" ||
  value === "bank_paid" ||
  value === "canceled" ||
  value === "declined" ||
  value === "offered" ||
  value === "settled";

export const isLinkyBankPaymentOfferTerminalStatus = (
  status: LinkyBankPaymentOfferStatus,
): boolean =>
  status === "accepted_by_other" ||
  status === "canceled" ||
  status === "declined" ||
  status === "settled";

// Unlike `declined`, which only ends one recipient's thread, these statuses
// end the offer for every recipient.
export const isLinkyBankPaymentOfferWholeOfferTerminalStatus = (
  status: LinkyBankPaymentOfferStatus,
): boolean => status === "canceled" || status === "settled";

export const getLinkyBankPaymentOfferStatusRank = (
  status: LinkyBankPaymentOfferStatus,
): number => {
  switch (status) {
    case "offered":
      return 0;
    case "accepted":
      return 1;
    case "bank_details_sent":
      return 2;
    case "bank_paid":
      return 3;
    case "declined":
      return 4;
    case "accepted_by_other":
      return 5;
    case "canceled":
      return 6;
    case "settled":
      return 7;
  }
};

const getOfferText = (
  amountText: string,
  status: LinkyBankPaymentOfferStatus,
): string => {
  switch (status) {
    case "accepted":
      return "Nabídka byla přijata. Platební údaje se odesílají.";
    case "accepted_by_other":
      return "Někdo jiný přijal nabídku rychleji. Pro tebe tedy končí.";
    case "bank_details_sent":
      return `Platební údaje jsou připravené. Zaplať ${amountText} do 5 minut.`;
    case "bank_paid":
      return `Bankovní platba za ${amountText} byla označena jako zaplacená. Zkontroluj ji a odešli saty.`;
    case "canceled":
      return "Nabídka byla zrušena. Bankovní platbu už neposílej.";
    case "declined":
      return `Nabídka platby za ${amountText} byla odmítnuta`;
    case "offered":
      return `Zaplatíš za mě bankovní platbu ve výši ${amountText}?`;
    case "settled":
      return `Platba za ${amountText} byla dokončena`;
  }
};

export const getLinkyBankPaymentOfferMessageText = (
  amountText: string,
  status: LinkyBankPaymentOfferStatus,
  extensionSec?: number | null,
): string => {
  if (
    typeof extensionSec === "number" &&
    Number.isFinite(extensionSec) &&
    extensionSec > 0
  ) {
    return `Potřebuji víc času (+${Math.trunc(extensionSec)} s).`;
  }
  return getOfferText(amountText, status);
};

export const getLinkyBankPaymentOfferInfo = (
  content: string,
): LinkyBankPaymentOfferInfo | null => {
  try {
    const parsed: unknown = JSON.parse(content);
    const type = readField(parsed, "type");
    if (type !== "linky.bank_payment_offer") return null;

    const offerId = readField(parsed, "offerId");
    const amountText = readField(parsed, "amountText");
    const amountSat = readField(parsed, "amountSat");
    const bankPaidAtSec = readField(parsed, "bankPaidAtSec");
    const expiresAtSec = readField(parsed, "expiresAtSec");
    const extensionSec = readField(parsed, "extensionSec");
    const initiatedAtSec = readField(parsed, "initiatedAtSec");
    const status = readField(parsed, "status");
    const statusUpdatedAtSec = readField(parsed, "statusUpdatedAtSec");
    if (typeof offerId !== "string" || !offerId.trim()) return null;
    if (typeof amountText !== "string" || !amountText.trim()) return null;
    if (!isLinkyBankPaymentOfferStatus(status)) return null;

    const text = readField(parsed, "text");
    const offererPublicKey = readField(parsed, "offererPublicKey");
    const spdPayload = readField(parsed, "spdPayload");

    return {
      amountSat:
        typeof amountSat === "number" &&
        Number.isFinite(amountSat) &&
        amountSat > 0
          ? Math.round(amountSat)
          : null,
      amountText: amountText.trim(),
      bankPaidAtSec:
        typeof bankPaidAtSec === "number" &&
        Number.isFinite(bankPaidAtSec) &&
        bankPaidAtSec > 0
          ? Math.trunc(bankPaidAtSec)
          : null,
      expiresAtSec:
        typeof expiresAtSec === "number" &&
        Number.isFinite(expiresAtSec) &&
        expiresAtSec > 0
          ? Math.trunc(expiresAtSec)
          : null,
      extensionSec:
        typeof extensionSec === "number" &&
        Number.isFinite(extensionSec) &&
        extensionSec > 0
          ? Math.trunc(extensionSec)
          : null,
      initiatedAtSec:
        typeof initiatedAtSec === "number" &&
        Number.isFinite(initiatedAtSec) &&
        initiatedAtSec > 0
          ? Math.trunc(initiatedAtSec)
          : null,
      offerId: offerId.trim(),
      offererPublicKey:
        typeof offererPublicKey === "string" && offererPublicKey.trim()
          ? offererPublicKey.trim()
          : null,
      spdPayload:
        typeof spdPayload === "string" && spdPayload.trim()
          ? spdPayload.trim()
          : null,
      status,
      statusUpdatedAtSec:
        typeof statusUpdatedAtSec === "number" &&
        Number.isFinite(statusUpdatedAtSec) &&
        statusUpdatedAtSec > 0
          ? Math.trunc(statusUpdatedAtSec)
          : null,
      text:
        typeof text === "string" && text.trim()
          ? text.trim()
          : getOfferText(amountText.trim(), status),
    };
  } catch {
    // ignore invalid offer content
  }

  return null;
};

export const getLinkyBankPaymentOfferText = (
  content: string,
): string | null => {
  return getLinkyBankPaymentOfferInfo(content)?.text ?? null;
};

interface BankPaymentOfferContactEntry {
  info: LinkyBankPaymentOfferInfo;
  message: LocalNostrMessage;
}

interface ActiveBankPaymentOfferContacts {
  contactIds: ReadonlySet<string>;
  nextExpiryAtSec: number | null;
}

const getBankPaymentOfferEntryTime = (
  entry: BankPaymentOfferContactEntry,
): number =>
  entry.info.statusUpdatedAtSec || Number(entry.message.createdAtSec ?? 0) || 0;

const isNewerBankPaymentOfferEntry = (
  candidate: BankPaymentOfferContactEntry,
  current: BankPaymentOfferContactEntry,
): boolean => {
  const rankDelta =
    getLinkyBankPaymentOfferStatusRank(candidate.info.status) -
    getLinkyBankPaymentOfferStatusRank(current.info.status);
  return (
    rankDelta > 0 ||
    (rankDelta === 0 &&
      getBankPaymentOfferEntryTime(candidate) >
        getBankPaymentOfferEntryTime(current))
  );
};

export const getActiveBankPaymentOfferContacts = (
  messages: readonly LocalNostrMessage[],
  nowSec: number,
): ActiveBankPaymentOfferContacts => {
  const groups = new Map<string, Map<string, BankPaymentOfferContactEntry>>();

  for (const message of messages) {
    const info = getLinkyBankPaymentOfferInfo(String(message.content ?? ""));
    const contactId = String(message.contactId ?? "").trim();
    if (!info || !contactId) continue;

    const entriesByContact =
      groups.get(info.offerId) ??
      new Map<string, BankPaymentOfferContactEntry>();
    const entry = { info, message };
    const current = entriesByContact.get(contactId);
    if (!current || isNewerBankPaymentOfferEntry(entry, current)) {
      entriesByContact.set(contactId, entry);
    }
    groups.set(info.offerId, entriesByContact);
  }

  const contactIds = new Set<string>();
  let nextExpiryAtSec: number | null = null;

  for (const entriesByContact of groups.values()) {
    const entries = [...entriesByContact.values()];
    if (
      entries.some(({ info }) =>
        isLinkyBankPaymentOfferWholeOfferTerminalStatus(info.status),
      )
    ) {
      continue;
    }

    for (const { info, message } of entries) {
      if (isLinkyBankPaymentOfferTerminalStatus(info.status)) continue;

      const expiresAtSec = getLinkyBankPaymentOfferExpiresAtSec(
        info,
        Number(message.createdAtSec ?? 0),
      );
      if (expiresAtSec !== null) {
        if (nowSec >= expiresAtSec) continue;
        nextExpiryAtSec =
          nextExpiryAtSec === null
            ? expiresAtSec
            : Math.min(nextExpiryAtSec, expiresAtSec);
      }

      contactIds.add(String(message.contactId ?? "").trim());
    }
  }

  return { contactIds, nextExpiryAtSec };
};

const getLinkyBankPaymentOfferBankPaidAtSec = (
  info: LinkyBankPaymentOfferInfo,
): number | null =>
  info.bankPaidAtSec ??
  (info.status === "bank_paid" ? info.statusUpdatedAtSec : null);

export const getLinkyBankPaymentOfferResponseDurationSec = (
  info: LinkyBankPaymentOfferInfo,
  createdAtSec: number,
): number | null => {
  const initiatedAtSec = info.initiatedAtSec ?? Math.trunc(createdAtSec);
  const bankPaidAtSec = getLinkyBankPaymentOfferBankPaidAtSec(info);
  if (
    !Number.isFinite(initiatedAtSec) ||
    initiatedAtSec <= 0 ||
    bankPaidAtSec === null ||
    bankPaidAtSec < initiatedAtSec
  ) {
    return null;
  }
  return bankPaidAtSec - initiatedAtSec;
};

interface BankPaymentOfferResponseMessage {
  contactId?: unknown;
  content?: unknown;
  createdAtSec?: unknown;
  direction?: unknown;
}

export const getLastBankPaymentOfferResponseSecByContactId = (
  messages: readonly BankPaymentOfferResponseMessage[],
): ReadonlyMap<string, number> => {
  const latestByContactId = new Map<
    string,
    { bankPaidAtSec: number; durationSec: number }
  >();

  for (const message of messages) {
    if (message.direction !== "out") continue;
    const contactId = String(message.contactId ?? "").trim();
    const content = String(message.content ?? "");
    const createdAtSec = Number(message.createdAtSec ?? 0);
    if (!contactId || !content || !Number.isFinite(createdAtSec)) continue;

    const info = getLinkyBankPaymentOfferInfo(content);
    if (!info) continue;
    const bankPaidAtSec = getLinkyBankPaymentOfferBankPaidAtSec(info);
    const durationSec = getLinkyBankPaymentOfferResponseDurationSec(
      info,
      createdAtSec,
    );
    if (bankPaidAtSec === null || durationSec === null) continue;

    const latest = latestByContactId.get(contactId);
    if (!latest || bankPaidAtSec > latest.bankPaidAtSec) {
      latestByContactId.set(contactId, { bankPaidAtSec, durationSec });
    }
  }

  return new Map(
    Array.from(latestByContactId, ([contactId, value]) => [
      contactId,
      value.durationSec,
    ]),
  );
};

export const mergeBankPaymentOffersIntoLastMessageByContactId = (
  lastMessageByContactId: ReadonlyMap<string, LocalNostrMessage>,
  bankPaymentOfferMessages: readonly LocalNostrMessage[],
): Map<string, LocalNostrMessage> => {
  const merged = new Map(lastMessageByContactId);

  for (const message of bankPaymentOfferMessages) {
    const contactId = String(message.contactId ?? "").trim();
    if (!contactId) continue;

    const current = merged.get(contactId);
    const currentCreatedAtSec = Number(current?.createdAtSec ?? 0) || 0;
    const messageCreatedAtSec = Number(message.createdAtSec ?? 0) || 0;
    if (!current || messageCreatedAtSec >= currentCreatedAtSec) {
      merged.set(contactId, message);
    }
  }

  return merged;
};
