import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import React from "react";
import type { CashuTokenId, ContactId } from "../../evolu";
import { evolu } from "../../evolu";
import {
  CASHU_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
  CONTACTS_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
  EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_EDIT_COUNT_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_EDIT_COUNT_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_INDEX_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_EDIT_COUNT_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_INDEX_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
  MESSAGES_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
  OWNER_ROTATION_COOLDOWN_MS,
  TRANSACTIONS_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
} from "../../utils/constants";
import { deriveEvoluOwnerMnemonicFromSlip39 } from "../../utils/slip39Nostr";
import type { CashuTokenRowLike, ContactRowLike } from "../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

type CounterMap = Record<string, number>;

interface OwnerSyncData {
  cashuOwner: Evolu.AppOwner;
  contactsOwner: Evolu.AppOwner;
  identityOwner: Evolu.AppOwner;
  messagesOwner: Evolu.AppOwner;
  metaOwner: Evolu.AppOwner;
  transactionsOwner: Evolu.AppOwner;
}

interface UseEvoluContactsOwnerRotationParams {
  appOwnerId: Evolu.OwnerId | null;
  getContactsForRotation: () => readonly ContactRowLike[];
  isSeedLogin: boolean;
  pushToast: (message: string) => void;
  slip39Seed: string | null;
  t: (key: string) => string;
  update: EvoluMutations["update"];
  upsert: EvoluMutations["upsert"];
}

interface UseEvoluContactsOwnerRotationResult {
  cashuOwnerId: Evolu.OwnerId | null;
  cashuOwnerEditsUntilRotation: number;
  cashuOwnerPointer: string;
  cashuSyncOwner: Evolu.SyncOwner | null;
  contactsBackupOwnerId: Evolu.OwnerId | null;
  contactsOwnerEditCount: number;
  contactsOwnerEditsUntilRotation: number;
  contactsOwnerId: Evolu.OwnerId | null;
  contactsSyncOwner: Evolu.SyncOwner | null;
  contactsOwnerIndex: number;
  contactsOwnerNewContactsCount: number;
  contactsOwnerPointer: string;
  identityOwnerId: Evolu.OwnerId | null;
  identitySyncOwner: Evolu.SyncOwner | null;
  metaOwnerId: Evolu.OwnerId | null;
  metaSyncOwner: Evolu.SyncOwner | null;
  messagesBackupOwnerId: Evolu.OwnerId | null;
  messagesOwnerId: Evolu.OwnerId | null;
  messagesOwnerIndex: number;
  messagesOwnerPointer: string;
  messagesOwnerEditsUntilRotation: number;
  messagesSyncOwner: Evolu.SyncOwner | null;
  recordMessagesOwnerWrite: (count?: number) => void;
  recordTransactionsOwnerWrite: (count?: number) => void;
  requestManualRotateContactsOwner: () => Promise<void>;
  requestManualRotateMessagesOwner: () => Promise<void>;
  requestManualRotateTransactionsOwner: () => Promise<void>;
  recordContactsOwnerWrite: (count?: number) => void;
  rotateContactsOwnerIsBusy: boolean;
  rotateMessagesOwnerIsBusy: boolean;
  rotateTransactionsOwnerIsBusy: boolean;
  transactionsBackupOwnerId: Evolu.OwnerId | null;
  transactionsOwnerEditsUntilRotation: number;
  transactionsOwnerId: Evolu.OwnerId | null;
  transactionsOwnerIndex: number;
  transactionsOwnerPointer: string;
  transactionsSyncOwner: Evolu.SyncOwner | null;
}

const createMetaPointerRowId = (scope: string): Evolu.Id =>
  Evolu.createIdFromString<"OwnerMeta">(`owner-pointer-${scope}`);

const formatMutationError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const readRowOwnerId = (row: unknown): string => {
  if (typeof row !== "object" || row === null) return "";
  if (!("ownerId" in row)) return "";
  const ownerId = row.ownerId;
  if (typeof ownerId !== "string") return "";
  return ownerId.trim();
};

const readRowPointerValue = (row: unknown): unknown => {
  if (typeof row !== "object" || row === null) return null;
  if (!("value" in row)) return null;
  return row.value;
};

const readCashuTokenId = (row: unknown): string => {
  if (typeof row !== "object" || row === null) return "";
  if (!("id" in row)) return "";
  const id = row.id;
  if (typeof id !== "string") return "";
  return id.trim();
};

const readCashuTokenValue = (row: unknown): string => {
  if (typeof row !== "object" || row === null) return "";
  const token = "token" in row ? row.token : null;
  if (typeof token !== "string") return "";
  return token.trim();
};

const readCashuOptionalText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const readCashuOptionalAmount = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const amount = Math.trunc(parsed);
  if (amount <= 0) return null;
  return amount;
};

const scoreCashuToken = (token: CashuTokenRowLike): number => {
  let score = 0;
  const state = String(token.state ?? "")
    .trim()
    .toLowerCase();
  if (state === "accepted") score += 4;
  else if (state === "pending") score += 2;
  else if (state === "error") score += 1;
  const amount = Number(token.amount ?? 0);
  if (Number.isFinite(amount) && amount > 0)
    score += Math.min(3, amount / 100_000);
  const createdAt = Number((token as { createdAt?: unknown }).createdAt);
  if (Number.isFinite(createdAt)) score += createdAt / 1_000_000_000;
  return score;
};

const parseContactsOwnerIndexFromPointer = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^contacts-(\d+)$/.exec(trimmed);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  return Math.trunc(parsed);
};

const parseCashuOwnerIndexFromPointer = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^cashu-(\d+)$/.exec(trimmed);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  return Math.trunc(parsed);
};

const parseMessagesOwnerIndexFromPointer = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^messages-(\d+)$/.exec(trimmed);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  return Math.trunc(parsed);
};

const parseTransactionsOwnerIndexFromPointer = (
  value: unknown,
): number | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^transactions-(\d+)$/.exec(trimmed);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  return Math.trunc(parsed);
};

const upsertOwnerMetaPointer = (
  upsert: EvoluMutations["upsert"],
  ownerId: Evolu.OwnerId,
  scope: "cashu" | "contacts" | "messages" | "transactions",
  value: string,
) =>
  upsert(
    "ownerMeta",
    {
      id: createMetaPointerRowId(scope),
      scope: scope as typeof Evolu.NonEmptyString100.Type,
      value: value as typeof Evolu.NonEmptyString1000.Type,
    },
    { ownerId },
  );

const parseCounterMap = (raw: string | null): CounterMap => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: CounterMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        out[key] = Math.trunc(value);
      }
    }
    return out;
  } catch {
    return {};
  }
};

const readCounterMap = (storageKey: string): CounterMap => {
  try {
    return parseCounterMap(localStorage.getItem(storageKey));
  } catch {
    return {};
  }
};

const writeCounterMap = (storageKey: string, map: CounterMap): void => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // ignore
  }
};

const getCounterValue = (storageKey: string, index: number): number => {
  const map = readCounterMap(storageKey);
  return Math.trunc(map[String(index)] ?? 0);
};

const setCounterValue = (
  storageKey: string,
  index: number,
  value: number,
): void => {
  const map = readCounterMap(storageKey);
  map[String(index)] = Math.max(0, Math.trunc(value));
  writeCounterMap(storageKey, map);
};

const hasCounterValue = (storageKey: string, index: number): boolean => {
  const map = readCounterMap(storageKey);
  return Object.prototype.hasOwnProperty.call(map, String(index));
};

const getStoredTimestampMs = (storageKey: string): number => {
  try {
    const raw = Number(localStorage.getItem(storageKey));
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return Math.trunc(raw);
  } catch {
    return 0;
  }
};

const setStoredTimestampMs = (storageKey: string, value: number): void => {
  try {
    localStorage.setItem(storageKey, String(Math.max(0, Math.trunc(value))));
  } catch {
    // ignore
  }
};

const getCooldownRemainingMs = (
  storageKey: string,
  nowMs: number,
  cooldownMs: number,
): number => {
  const lastMs = getStoredTimestampMs(storageKey);
  if (lastMs <= 0) return 0;
  const elapsed = Math.max(0, nowMs - lastMs);
  return Math.max(0, cooldownMs - elapsed);
};

const getStoredIndex = (storageKey: string): number => {
  try {
    const raw = Number(localStorage.getItem(storageKey));
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return Math.trunc(raw);
  } catch {
    return 0;
  }
};

const setStoredIndex = (storageKey: string, value: number): void => {
  try {
    localStorage.setItem(storageKey, String(Math.max(0, Math.trunc(value))));
  } catch {
    // ignore
  }
};

const toAppOwnerFromMnemonic = (mnemonic: string): Evolu.AppOwner | null => {
  const parsed = Evolu.Mnemonic.fromUnknown(mnemonic);
  if (!parsed.ok) return null;
  const secret = Evolu.mnemonicToOwnerSecret(parsed.value);
  return Evolu.createAppOwner(secret);
};

const deriveOwnerSyncDataFromSeed = async (
  slip39Seed: string,
  contactsOwnerIndex: number,
  messagesOwnerIndex: number,
  transactionsOwnerIndex: number,
): Promise<OwnerSyncData | null> => {
  const [
    metaMnemonic,
    identityMnemonic,
    contactsMnemonic,
    cashuMnemonic,
    messagesMnemonic,
    transactionsMnemonic,
  ] = await Promise.all([
    deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "meta", 0),
    deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "identity", 0),
    deriveEvoluOwnerMnemonicFromSlip39(
      slip39Seed,
      "contacts",
      contactsOwnerIndex,
    ),
    deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "cashu", contactsOwnerIndex),
    deriveEvoluOwnerMnemonicFromSlip39(
      slip39Seed,
      "messages",
      messagesOwnerIndex,
    ),
    deriveEvoluOwnerMnemonicFromSlip39(
      slip39Seed,
      "transactions",
      transactionsOwnerIndex,
    ),
  ]);

  if (
    !metaMnemonic ||
    !identityMnemonic ||
    !contactsMnemonic ||
    !cashuMnemonic ||
    !messagesMnemonic ||
    !transactionsMnemonic
  )
    return null;
  const metaOwner = toAppOwnerFromMnemonic(metaMnemonic);
  const identityOwner = toAppOwnerFromMnemonic(identityMnemonic);
  const contactsOwner = toAppOwnerFromMnemonic(contactsMnemonic);
  const cashuOwner = toAppOwnerFromMnemonic(cashuMnemonic);
  const messagesOwner = toAppOwnerFromMnemonic(messagesMnemonic);
  const transactionsOwner = toAppOwnerFromMnemonic(transactionsMnemonic);

  if (
    !metaOwner ||
    !identityOwner ||
    !contactsOwner ||
    !cashuOwner ||
    !messagesOwner ||
    !transactionsOwner
  )
    return null;

  return {
    cashuOwner,
    contactsOwner,
    identityOwner,
    messagesOwner,
    metaOwner,
    transactionsOwner,
  };
};

const deriveContactsAndCashuOwnersFromSeed = async (
  slip39Seed: string,
  contactsOwnerIndex: number,
): Promise<{
  cashuOwner: Evolu.AppOwner;
  contactsOwner: Evolu.AppOwner;
} | null> => {
  const [contactsMnemonic, cashuMnemonic] = await Promise.all([
    deriveEvoluOwnerMnemonicFromSlip39(
      slip39Seed,
      "contacts",
      contactsOwnerIndex,
    ),
    deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "cashu", contactsOwnerIndex),
  ]);

  if (!contactsMnemonic || !cashuMnemonic) return null;

  const contactsOwner = toAppOwnerFromMnemonic(contactsMnemonic);
  const cashuOwner = toAppOwnerFromMnemonic(cashuMnemonic);

  if (!contactsOwner || !cashuOwner) return null;

  return { cashuOwner, contactsOwner };
};

export const useEvoluContactsOwnerRotation = ({
  appOwnerId,
  getContactsForRotation,
  isSeedLogin,
  pushToast,
  slip39Seed,
  t,
  update,
  upsert,
}: UseEvoluContactsOwnerRotationParams): UseEvoluContactsOwnerRotationResult => {
  const [contactsOwnerIndex, setContactsOwnerIndex] = React.useState<number>(
    () => getStoredIndex(EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY),
  );
  const [messagesOwnerIndex, setMessagesOwnerIndex] = React.useState<number>(
    () => getStoredIndex(EVOLU_MESSAGES_OWNER_INDEX_STORAGE_KEY),
  );
  const [transactionsOwnerIndex, setTransactionsOwnerIndex] =
    React.useState<number>(() =>
      getStoredIndex(EVOLU_TRANSACTIONS_OWNER_INDEX_STORAGE_KEY),
    );
  const [ownerSyncData, setOwnerSyncData] =
    React.useState<OwnerSyncData | null>(null);
  const [contactsBackupOwnerId, setContactsBackupOwnerId] =
    React.useState<Evolu.OwnerId | null>(null);
  const [messagesBackupOwnerId, setMessagesBackupOwnerId] =
    React.useState<Evolu.OwnerId | null>(null);
  const [transactionsBackupOwnerId, setTransactionsBackupOwnerId] =
    React.useState<Evolu.OwnerId | null>(null);
  const [rotateContactsOwnerIsBusy, setRotateContactsOwnerIsBusy] =
    React.useState(false);
  const [rotateMessagesOwnerIsBusy, setRotateMessagesOwnerIsBusy] =
    React.useState(false);
  const [rotateTransactionsOwnerIsBusy, setRotateTransactionsOwnerIsBusy] =
    React.useState(false);
  const [contactsOwnerEditCount, setContactsOwnerEditCount] = React.useState(
    () =>
      getCounterValue(
        EVOLU_CONTACTS_OWNER_EDIT_COUNT_STORAGE_KEY,
        getStoredIndex(EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY),
      ),
  );
  const [messagesOwnerEditCount, setMessagesOwnerEditCount] = React.useState(
    () =>
      getCounterValue(
        EVOLU_MESSAGES_OWNER_EDIT_COUNT_STORAGE_KEY,
        getStoredIndex(EVOLU_MESSAGES_OWNER_INDEX_STORAGE_KEY),
      ),
  );
  const [transactionsOwnerEditCount, setTransactionsOwnerEditCount] =
    React.useState(() =>
      getCounterValue(
        EVOLU_TRANSACTIONS_OWNER_EDIT_COUNT_STORAGE_KEY,
        getStoredIndex(EVOLU_TRANSACTIONS_OWNER_INDEX_STORAGE_KEY),
      ),
    );

  const ownerMetaQuery = React.useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("ownerMeta")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue),
      ),
    [],
  );
  const ownerMetaRows = useQuery(ownerMetaQuery);

  const allContactsQuery = React.useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("contact")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue),
      ),
    [],
  );
  const allContactsRows = useQuery(allContactsQuery);

  const allCashuTokensQuery = React.useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("cashuToken")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue),
      ),
    [],
  );
  const allCashuTokensRows = useQuery(allCashuTokensQuery);

  const allNostrMessagesQuery = React.useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("nostrMessage")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue),
      ),
    [],
  );
  const allNostrMessagesRows = useQuery(allNostrMessagesQuery);

  const allNostrReactionsQuery = React.useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("nostrReaction")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue),
      ),
    [],
  );
  const allNostrReactionsRows = useQuery(allNostrReactionsQuery);

  const allTransactionsQuery = React.useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("transaction")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue),
      ),
    [],
  );
  const allTransactionsRows = useQuery(allTransactionsQuery);

  React.useEffect(() => {
    setContactsOwnerEditCount(
      getCounterValue(
        EVOLU_CONTACTS_OWNER_EDIT_COUNT_STORAGE_KEY,
        contactsOwnerIndex,
      ),
    );
  }, [contactsOwnerIndex]);

  React.useEffect(() => {
    setMessagesOwnerEditCount(
      getCounterValue(
        EVOLU_MESSAGES_OWNER_EDIT_COUNT_STORAGE_KEY,
        messagesOwnerIndex,
      ),
    );
  }, [messagesOwnerIndex]);

  React.useEffect(() => {
    setTransactionsOwnerEditCount(
      getCounterValue(
        EVOLU_TRANSACTIONS_OWNER_EDIT_COUNT_STORAGE_KEY,
        transactionsOwnerIndex,
      ),
    );
  }, [transactionsOwnerIndex]);

  const recordContactsOwnerWrite = React.useCallback(
    (count = 1) => {
      const delta = Math.max(1, Math.trunc(count));
      setContactsOwnerEditCount((prev) => {
        const next = Math.max(0, prev + delta);
        setCounterValue(
          EVOLU_CONTACTS_OWNER_EDIT_COUNT_STORAGE_KEY,
          contactsOwnerIndex,
          next,
        );
        return next;
      });
    },
    [contactsOwnerIndex],
  );

  const recordMessagesOwnerWrite = React.useCallback(
    (count = 1) => {
      const delta = Math.max(1, Math.trunc(count));
      setMessagesOwnerEditCount((prev) => {
        const next = Math.max(0, prev + delta);
        setCounterValue(
          EVOLU_MESSAGES_OWNER_EDIT_COUNT_STORAGE_KEY,
          messagesOwnerIndex,
          next,
        );
        return next;
      });
    },
    [messagesOwnerIndex],
  );

  const recordTransactionsOwnerWrite = React.useCallback(
    (count = 1) => {
      const delta = Math.max(1, Math.trunc(count));
      setTransactionsOwnerEditCount((prev) => {
        const next = Math.max(0, prev + delta);
        setCounterValue(
          EVOLU_TRANSACTIONS_OWNER_EDIT_COUNT_STORAGE_KEY,
          transactionsOwnerIndex,
          next,
        );
        return next;
      });
    },
    [transactionsOwnerIndex],
  );
  const contactsOwnerBaselineCount = React.useMemo(
    () =>
      getCounterValue(
        EVOLU_CONTACTS_OWNER_BASELINE_COUNT_STORAGE_KEY,
        contactsOwnerIndex,
      ),
    [contactsOwnerIndex],
  );
  const cashuOwnerBaselineCount = React.useMemo(
    () =>
      getCounterValue(
        EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY,
        contactsOwnerIndex,
      ),
    [contactsOwnerIndex],
  );
  const messagesOwnerBaselineCount = React.useMemo(
    () =>
      getCounterValue(
        EVOLU_MESSAGES_OWNER_BASELINE_COUNT_STORAGE_KEY,
        messagesOwnerIndex,
      ),
    [messagesOwnerIndex],
  );
  const transactionsOwnerBaselineCount = React.useMemo(
    () =>
      getCounterValue(
        EVOLU_TRANSACTIONS_OWNER_BASELINE_COUNT_STORAGE_KEY,
        transactionsOwnerIndex,
      ),
    [transactionsOwnerIndex],
  );

  const contactsActiveOwnerId = isSeedLogin
    ? String(ownerSyncData?.contactsOwner.id ?? "").trim()
    : String(appOwnerId ?? "").trim();
  const cashuActiveOwnerId = isSeedLogin
    ? String(ownerSyncData?.cashuOwner.id ?? "").trim()
    : String(appOwnerId ?? "").trim();
  const messagesActiveOwnerId = isSeedLogin
    ? String(ownerSyncData?.messagesOwner.id ?? "").trim()
    : String(appOwnerId ?? "").trim();
  const transactionsActiveOwnerId = isSeedLogin
    ? String(ownerSyncData?.transactionsOwner.id ?? "").trim()
    : String(appOwnerId ?? "").trim();

  const contactsOwnerWriteCount = React.useMemo(() => {
    if (!contactsActiveOwnerId) return 0;
    let count = 0;
    for (const row of allContactsRows) {
      if (readRowOwnerId(row) === contactsActiveOwnerId) count += 1;
    }
    return count;
  }, [allContactsRows, contactsActiveOwnerId]);

  const cashuOwnerWriteCount = React.useMemo(() => {
    if (!cashuActiveOwnerId) return 0;
    let count = 0;
    for (const row of allCashuTokensRows) {
      if (readRowOwnerId(row) === cashuActiveOwnerId) count += 1;
    }
    return count;
  }, [allCashuTokensRows, cashuActiveOwnerId]);

  const messagesOwnerWriteCount = React.useMemo(() => {
    if (!messagesActiveOwnerId) return 0;
    let count = 0;
    for (const row of allNostrMessagesRows) {
      if (readRowOwnerId(row) === messagesActiveOwnerId) count += 1;
    }
    for (const row of allNostrReactionsRows) {
      if (readRowOwnerId(row) === messagesActiveOwnerId) count += 1;
    }
    return count;
  }, [allNostrMessagesRows, allNostrReactionsRows, messagesActiveOwnerId]);

  const transactionsOwnerWriteCount = React.useMemo(() => {
    if (!transactionsActiveOwnerId) return 0;
    let count = 0;
    for (const row of allTransactionsRows) {
      if (readRowOwnerId(row) === transactionsActiveOwnerId) count += 1;
    }
    return count;
  }, [allTransactionsRows, transactionsActiveOwnerId]);

  const contactsOwnerWriteDelta = Math.max(
    0,
    contactsOwnerWriteCount -
      contactsOwnerBaselineCount +
      contactsOwnerEditCount,
  );
  const cashuOwnerWriteDelta = Math.max(
    0,
    cashuOwnerWriteCount - cashuOwnerBaselineCount,
  );
  const messagesOwnerWriteDelta = Math.max(
    0,
    messagesOwnerWriteCount -
      messagesOwnerBaselineCount +
      messagesOwnerEditCount,
  );
  const transactionsOwnerWriteDelta = Math.max(
    0,
    transactionsOwnerWriteCount -
      transactionsOwnerBaselineCount +
      transactionsOwnerEditCount,
  );

  React.useEffect(() => {
    if (!isSeedLogin) return;

    if (
      !hasCounterValue(
        EVOLU_CONTACTS_OWNER_BASELINE_COUNT_STORAGE_KEY,
        contactsOwnerIndex,
      )
    ) {
      setCounterValue(
        EVOLU_CONTACTS_OWNER_BASELINE_COUNT_STORAGE_KEY,
        contactsOwnerIndex,
        contactsOwnerWriteCount,
      );
    }

    if (
      !hasCounterValue(
        EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY,
        contactsOwnerIndex,
      )
    ) {
      setCounterValue(
        EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY,
        contactsOwnerIndex,
        cashuOwnerWriteCount,
      );
    }

    if (
      !hasCounterValue(
        EVOLU_MESSAGES_OWNER_BASELINE_COUNT_STORAGE_KEY,
        messagesOwnerIndex,
      )
    ) {
      setCounterValue(
        EVOLU_MESSAGES_OWNER_BASELINE_COUNT_STORAGE_KEY,
        messagesOwnerIndex,
        messagesOwnerWriteCount,
      );
    }

    if (
      !hasCounterValue(
        EVOLU_TRANSACTIONS_OWNER_BASELINE_COUNT_STORAGE_KEY,
        transactionsOwnerIndex,
      )
    ) {
      setCounterValue(
        EVOLU_TRANSACTIONS_OWNER_BASELINE_COUNT_STORAGE_KEY,
        transactionsOwnerIndex,
        transactionsOwnerWriteCount,
      );
    }
  }, [
    cashuOwnerWriteCount,
    contactsOwnerIndex,
    contactsOwnerWriteCount,
    isSeedLogin,
    messagesOwnerIndex,
    messagesOwnerWriteCount,
    transactionsOwnerIndex,
    transactionsOwnerWriteCount,
  ]);

  React.useEffect(() => {
    if (!isSeedLogin) {
      setOwnerSyncData(null);
      setContactsBackupOwnerId(null);
      setMessagesBackupOwnerId(null);
      setTransactionsBackupOwnerId(null);
      return;
    }

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!normalizedSeed) {
      setOwnerSyncData(null);
      setContactsBackupOwnerId(null);
      setMessagesBackupOwnerId(null);
      setTransactionsBackupOwnerId(null);
      return;
    }

    let cancelled = false;
    void Promise.all([
      deriveOwnerSyncDataFromSeed(
        normalizedSeed,
        contactsOwnerIndex,
        messagesOwnerIndex,
        transactionsOwnerIndex,
      ),
      contactsOwnerIndex > 0
        ? deriveOwnerSyncDataFromSeed(
            normalizedSeed,
            contactsOwnerIndex - 1,
            messagesOwnerIndex,
            transactionsOwnerIndex,
          )
        : Promise.resolve(null),
      messagesOwnerIndex > 0
        ? deriveOwnerSyncDataFromSeed(
            normalizedSeed,
            contactsOwnerIndex,
            messagesOwnerIndex - 1,
            transactionsOwnerIndex,
          )
        : Promise.resolve(null),
      transactionsOwnerIndex > 0
        ? deriveOwnerSyncDataFromSeed(
            normalizedSeed,
            contactsOwnerIndex,
            messagesOwnerIndex,
            transactionsOwnerIndex - 1,
          )
        : Promise.resolve(null),
    ]).then(([derived, contactsBackup, messagesBackup, transactionsBackup]) => {
      if (cancelled) return;
      setOwnerSyncData(derived);
      setContactsBackupOwnerId(contactsBackup?.contactsOwner.id ?? null);
      setMessagesBackupOwnerId(messagesBackup?.messagesOwner.id ?? null);
      setTransactionsBackupOwnerId(
        transactionsBackup?.transactionsOwner.id ?? null,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [
    contactsOwnerIndex,
    isSeedLogin,
    messagesOwnerIndex,
    slip39Seed,
    transactionsOwnerIndex,
  ]);

  React.useEffect(() => {
    if (!ownerSyncData) return;

    const metaOwnerId = String(ownerSyncData.metaOwner.id).trim();
    if (!metaOwnerId) return;

    let resolvedContactsIndex: number | null = null;
    let resolvedCashuIndex: number | null = null;
    let resolvedMessagesIndex: number | null = null;
    let resolvedTransactionsIndex: number | null = null;
    for (const row of ownerMetaRows) {
      if (readRowOwnerId(row) !== metaOwnerId) continue;
      const scope =
        typeof row === "object" && row !== null && "scope" in row
          ? row.scope
          : null;
      const scopeText = typeof scope === "string" ? scope.trim() : "";
      if (scopeText === "contacts") {
        const parsed = parseContactsOwnerIndexFromPointer(
          readRowPointerValue(row),
        );
        if (parsed !== null) resolvedContactsIndex = parsed;
      }
      if (scopeText === "cashu") {
        const parsed = parseCashuOwnerIndexFromPointer(
          readRowPointerValue(row),
        );
        if (parsed !== null) resolvedCashuIndex = parsed;
      }
      if (scopeText === "messages") {
        const parsed = parseMessagesOwnerIndexFromPointer(
          readRowPointerValue(row),
        );
        if (parsed !== null) resolvedMessagesIndex = parsed;
      }
      if (scopeText === "transactions") {
        const parsed = parseTransactionsOwnerIndexFromPointer(
          readRowPointerValue(row),
        );
        if (parsed !== null) resolvedTransactionsIndex = parsed;
      }
    }

    const resolvedSharedCashuContactsIndex =
      resolvedContactsIndex ?? resolvedCashuIndex;

    if (
      resolvedSharedCashuContactsIndex !== null &&
      resolvedSharedCashuContactsIndex !== contactsOwnerIndex
    ) {
      setStoredIndex(
        EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY,
        resolvedSharedCashuContactsIndex,
      );
      setContactsOwnerIndex(resolvedSharedCashuContactsIndex);
    }

    if (
      resolvedMessagesIndex !== null &&
      resolvedMessagesIndex !== messagesOwnerIndex
    ) {
      setStoredIndex(
        EVOLU_MESSAGES_OWNER_INDEX_STORAGE_KEY,
        resolvedMessagesIndex,
      );
      setMessagesOwnerIndex(resolvedMessagesIndex);
    }

    if (
      resolvedTransactionsIndex !== null &&
      resolvedTransactionsIndex !== transactionsOwnerIndex
    ) {
      setStoredIndex(
        EVOLU_TRANSACTIONS_OWNER_INDEX_STORAGE_KEY,
        resolvedTransactionsIndex,
      );
      setTransactionsOwnerIndex(resolvedTransactionsIndex);
    }
  }, [
    contactsOwnerIndex,
    messagesOwnerIndex,
    ownerMetaRows,
    ownerSyncData,
    transactionsOwnerIndex,
  ]);

  const rotateContactsAndCashuOwner = React.useCallback(async () => {
    if (rotateContactsOwnerIsBusy) return;

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!isSeedLogin || !normalizedSeed) {
      return;
    }

    const nowMs = Date.now();
    const contactsCooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_CONTACTS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    const cashuCooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    const cooldownRemainingMs = Math.max(
      contactsCooldownRemainingMs,
      cashuCooldownRemainingMs,
    );
    if (cooldownRemainingMs > 0) {
      return;
    }

    setRotateContactsOwnerIsBusy(true);
    try {
      const currentDerived = await deriveOwnerSyncDataFromSeed(
        normalizedSeed,
        contactsOwnerIndex,
        messagesOwnerIndex,
        transactionsOwnerIndex,
      );
      if (!currentDerived) {
        pushToast(t("restoreFailed"));
        return;
      }

      const nextIndex = contactsOwnerIndex + 1;
      const derived = await deriveOwnerSyncDataFromSeed(
        normalizedSeed,
        nextIndex,
        messagesOwnerIndex,
        transactionsOwnerIndex,
      );
      if (!derived) {
        pushToast(t("restoreFailed"));
        return;
      }

      const source = getContactsForRotation();
      const byIdentity = new Map<string, ContactRowLike>();

      const scoreContact = (contact: ContactRowLike): number => {
        let score = 0;
        if (String(contact.name ?? "").trim()) score += 1;
        if (String(contact.npub ?? "").trim()) score += 2;
        if (String(contact.lnAddress ?? "").trim()) score += 2;
        if (String(contact.groupName ?? "").trim()) score += 1;
        const createdAt = Number(
          (contact as { createdAt?: unknown }).createdAt,
        );
        if (Number.isFinite(createdAt)) score += createdAt / 1_000_000_000;
        return score;
      };

      for (const contact of source) {
        const id = String(contact.id ?? "").trim();
        if (!id) continue;

        const name = String(contact.name ?? "").trim();
        const npub = String(contact.npub ?? "")
          .trim()
          .toLowerCase();
        const lnAddress = String(contact.lnAddress ?? "")
          .trim()
          .toLowerCase();
        const groupName = String(contact.groupName ?? "").trim();

        if (!name && !npub && !lnAddress && !groupName) continue;

        const identityKey = npub
          ? `npub:${npub}`
          : lnAddress
            ? `ln:${lnAddress}`
            : `id:${id}`;

        const existing = byIdentity.get(identityKey);
        if (!existing) {
          byIdentity.set(identityKey, contact);
          continue;
        }

        if (scoreContact(contact) > scoreContact(existing)) {
          byIdentity.set(identityKey, contact);
        }
      }

      let copiedCount = 0;
      for (const contact of byIdentity.values()) {
        const id = contact.id as ContactId | null | undefined;
        if (!id) continue;

        const payload = {
          id,
          name: String(contact.name ?? "").trim()
            ? (String(
                contact.name ?? "",
              ).trim() as typeof Evolu.NonEmptyString1000.Type)
            : null,
          npub: String(contact.npub ?? "").trim()
            ? (String(
                contact.npub ?? "",
              ).trim() as typeof Evolu.NonEmptyString1000.Type)
            : null,
          lnAddress: String(contact.lnAddress ?? "").trim()
            ? (String(
                contact.lnAddress ?? "",
              ).trim() as typeof Evolu.NonEmptyString1000.Type)
            : null,
          groupName: String(contact.groupName ?? "").trim()
            ? (String(
                contact.groupName ?? "",
              ).trim() as typeof Evolu.NonEmptyString1000.Type)
            : null,
        };

        const result = upsert("contact", payload, {
          ownerId: derived.contactsOwner.id,
        });
        if (result.ok) copiedCount += 1;
      }

      const currentCashuOwnerId = String(
        currentDerived.cashuOwner.id ?? "",
      ).trim();
      const byCashuToken = new Map<string, CashuTokenRowLike>();
      if (currentCashuOwnerId) {
        for (const row of allCashuTokensRows) {
          if (readRowOwnerId(row) !== currentCashuOwnerId) continue;
          const tokenText = readCashuTokenValue(row);
          if (!tokenText) continue;
          const normalizedKey = tokenText;

          const candidate: CashuTokenRowLike = {
            id: readCashuTokenId(row),
            token: tokenText,
            rawToken:
              typeof row === "object" && row !== null && "rawToken" in row
                ? readCashuOptionalText(row.rawToken)
                : null,
            mint:
              typeof row === "object" && row !== null && "mint" in row
                ? readCashuOptionalText(row.mint)
                : null,
            unit:
              typeof row === "object" && row !== null && "unit" in row
                ? readCashuOptionalText(row.unit)
                : null,
            amount:
              typeof row === "object" && row !== null && "amount" in row
                ? readCashuOptionalAmount(row.amount)
                : null,
            state:
              typeof row === "object" && row !== null && "state" in row
                ? readCashuOptionalText(row.state)
                : null,
            error:
              typeof row === "object" && row !== null && "error" in row
                ? readCashuOptionalText(row.error)
                : null,
          };

          const existing = byCashuToken.get(normalizedKey);
          if (
            !existing ||
            scoreCashuToken(candidate) > scoreCashuToken(existing)
          ) {
            byCashuToken.set(normalizedKey, candidate);
          }
        }
      }

      let copiedCashuCount = 0;
      for (const token of byCashuToken.values()) {
        const stateText = String(token.state ?? "")
          .trim()
          .toLowerCase();
        if (stateText && stateText !== "accepted" && stateText !== "pending") {
          continue;
        }

        const tokenId = String(token.id ?? "").trim();
        const tokenText = String(token.token ?? "").trim();
        if (!tokenId || !tokenText) continue;

        const payload: {
          id: CashuTokenId;
          token: typeof Evolu.NonEmptyString.Type;
          amount?: typeof Evolu.PositiveInt.Type;
          error?: typeof Evolu.NonEmptyString1000.Type;
          mint?: typeof Evolu.NonEmptyString1000.Type;
          rawToken?: typeof Evolu.NonEmptyString.Type;
          state?: typeof Evolu.NonEmptyString100.Type;
          unit?: typeof Evolu.NonEmptyString100.Type;
        } = {
          id: tokenId as CashuTokenId,
          token: tokenText as typeof Evolu.NonEmptyString.Type,
        };

        const rawToken = String(token.rawToken ?? "").trim();
        if (rawToken) {
          payload.rawToken = rawToken as typeof Evolu.NonEmptyString.Type;
        }

        const mint = String(token.mint ?? "").trim();
        if (mint) {
          payload.mint = mint as typeof Evolu.NonEmptyString1000.Type;
        }

        const unit = String(token.unit ?? "").trim();
        if (unit) {
          payload.unit = unit as typeof Evolu.NonEmptyString100.Type;
        }

        if (typeof token.amount === "number" && token.amount > 0) {
          payload.amount = Math.trunc(
            token.amount,
          ) as typeof Evolu.PositiveInt.Type;
        }

        const state = String(token.state ?? "").trim();
        if (state) {
          payload.state = state as typeof Evolu.NonEmptyString100.Type;
        }

        const error = String(token.error ?? "").trim();
        if (error) {
          payload.error = error as typeof Evolu.NonEmptyString1000.Type;
        }

        const result = upsert("cashuToken", payload, {
          ownerId: derived.cashuOwner.id,
        });
        if (result.ok) copiedCashuCount += 1;
      }

      const contactsPointerResult = upsertOwnerMetaPointer(
        upsert,
        derived.metaOwner.id,
        "contacts",
        `contacts-${nextIndex}`,
      );

      const cashuPointerResult = upsertOwnerMetaPointer(
        upsert,
        derived.metaOwner.id,
        "cashu",
        `cashu-${nextIndex}`,
      );

      if (!contactsPointerResult.ok) {
        pushToast(
          `${t("errorPrefix")}: ${formatMutationError(contactsPointerResult.error)}`,
        );
        return;
      }

      if (!cashuPointerResult.ok) {
        pushToast(
          `${t("errorPrefix")}: ${formatMutationError(cashuPointerResult.error)}`,
        );
        return;
      }

      setStoredIndex(EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY, nextIndex);
      setCounterValue(
        EVOLU_CONTACTS_OWNER_BASELINE_COUNT_STORAGE_KEY,
        nextIndex,
        copiedCount,
      );
      setCounterValue(
        EVOLU_CONTACTS_OWNER_EDIT_COUNT_STORAGE_KEY,
        nextIndex,
        0,
      );
      setContactsOwnerEditCount(0);
      setCounterValue(
        EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY,
        nextIndex,
        copiedCashuCount,
      );
      setStoredTimestampMs(
        EVOLU_CONTACTS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
        nowMs,
      );
      setStoredTimestampMs(
        EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
        nowMs,
      );

      if (nextIndex >= 2) {
        const pruneIndex = nextIndex - 2;
        const pruneOwners = await deriveContactsAndCashuOwnersFromSeed(
          normalizedSeed,
          pruneIndex,
        );

        if (pruneOwners) {
          const pruneOwnerId = String(pruneOwners.contactsOwner.id).trim();
          if (pruneOwnerId) {
            for (const row of allContactsRows) {
              if (readRowOwnerId(row) !== pruneOwnerId) continue;
              const id =
                typeof row === "object" && row !== null && "id" in row
                  ? row.id
                  : null;
              if (typeof id !== "string" || !id.trim()) continue;

              update(
                "contact",
                {
                  id: id as ContactId,
                  isDeleted: Evolu.sqliteTrue,
                },
                { ownerId: pruneOwners.contactsOwner.id },
              );
            }
          }

          const pruneCashuOwnerId = String(pruneOwners.cashuOwner.id).trim();
          if (pruneCashuOwnerId) {
            for (const row of allCashuTokensRows) {
              if (readRowOwnerId(row) !== pruneCashuOwnerId) continue;
              const id = readCashuTokenId(row);
              if (!id) continue;

              update(
                "cashuToken",
                {
                  id: id as CashuTokenId,
                  isDeleted: Evolu.sqliteTrue,
                },
                { ownerId: pruneOwners.cashuOwner.id },
              );
            }
          }
        }
      }

      setOwnerSyncData(derived);
      setContactsOwnerIndex(nextIndex);
      pushToast(
        `${t("evoluContactsOwnerRotated")} (${copiedCount}/${copiedCashuCount})`,
      );
    } finally {
      setRotateContactsOwnerIsBusy(false);
    }
  }, [
    allCashuTokensRows,
    contactsOwnerIndex,
    getContactsForRotation,
    isSeedLogin,
    allContactsRows,
    pushToast,
    rotateContactsOwnerIsBusy,
    messagesOwnerIndex,
    slip39Seed,
    t,
    transactionsOwnerIndex,
    update,
    upsert,
  ]);

  const requestManualRotateContactsOwner = React.useCallback(async () => {
    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!isSeedLogin || !normalizedSeed) {
      pushToast(t("seedMissing"));
      return;
    }

    const nowMs = Date.now();
    const contactsCooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_CONTACTS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    const cashuCooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    const cooldownRemainingMs = Math.max(
      contactsCooldownRemainingMs,
      cashuCooldownRemainingMs,
    );

    if (cooldownRemainingMs > 0) {
      pushToast(
        t("evoluRotateCooldown").replace(
          "{seconds}",
          String(Math.ceil(cooldownRemainingMs / 1000)),
        ),
      );
      return;
    }

    await rotateContactsAndCashuOwner();
  }, [isSeedLogin, pushToast, rotateContactsAndCashuOwner, slip39Seed, t]);

  const rotateMessagesOwner = React.useCallback(async () => {
    if (rotateMessagesOwnerIsBusy) return;

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!isSeedLogin || !normalizedSeed) {
      return;
    }

    const nowMs = Date.now();
    const cooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_MESSAGES_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    if (cooldownRemainingMs > 0) {
      return;
    }

    setRotateMessagesOwnerIsBusy(true);
    try {
      const nextIndex = messagesOwnerIndex + 1;
      const derived = await deriveOwnerSyncDataFromSeed(
        normalizedSeed,
        contactsOwnerIndex,
        nextIndex,
        transactionsOwnerIndex,
      );
      if (!derived) {
        pushToast(t("restoreFailed"));
        return;
      }

      const pointerResult = upsertOwnerMetaPointer(
        upsert,
        derived.metaOwner.id,
        "messages",
        `messages-${nextIndex}`,
      );

      if (!pointerResult.ok) {
        pushToast(
          `${t("errorPrefix")}: ${formatMutationError(pointerResult.error)}`,
        );
        return;
      }

      setStoredIndex(EVOLU_MESSAGES_OWNER_INDEX_STORAGE_KEY, nextIndex);
      const nextOwnerMessageRows = allNostrMessagesRows.reduce(
        (count, row) =>
          readRowOwnerId(row) === String(derived.messagesOwner.id).trim()
            ? count + 1
            : count,
        0,
      );
      const nextOwnerReactionRows = allNostrReactionsRows.reduce(
        (count, row) =>
          readRowOwnerId(row) === String(derived.messagesOwner.id).trim()
            ? count + 1
            : count,
        0,
      );
      setCounterValue(
        EVOLU_MESSAGES_OWNER_BASELINE_COUNT_STORAGE_KEY,
        nextIndex,
        nextOwnerMessageRows + nextOwnerReactionRows,
      );
      setCounterValue(
        EVOLU_MESSAGES_OWNER_EDIT_COUNT_STORAGE_KEY,
        nextIndex,
        0,
      );
      setMessagesOwnerEditCount(0);
      setStoredTimestampMs(
        EVOLU_MESSAGES_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
        nowMs,
      );

      if (nextIndex >= 2) {
        const pruneIndex = nextIndex - 2;
        const pruneOwners = await deriveOwnerSyncDataFromSeed(
          normalizedSeed,
          contactsOwnerIndex,
          pruneIndex,
          transactionsOwnerIndex,
        );

        if (pruneOwners) {
          const pruneMessagesOwnerId = String(
            pruneOwners.messagesOwner.id,
          ).trim();
          if (pruneMessagesOwnerId) {
            for (const row of allNostrMessagesRows) {
              if (readRowOwnerId(row) !== pruneMessagesOwnerId) continue;
              const id =
                typeof row === "object" && row !== null && "id" in row
                  ? row.id
                  : null;
              if (typeof id !== "string" || !id.trim()) continue;

              update(
                "nostrMessage",
                {
                  id: id as Evolu.Id,
                  isDeleted: Evolu.sqliteTrue,
                },
                { ownerId: pruneOwners.messagesOwner.id },
              );
            }

            for (const row of allNostrReactionsRows) {
              if (readRowOwnerId(row) !== pruneMessagesOwnerId) continue;
              const id =
                typeof row === "object" && row !== null && "id" in row
                  ? row.id
                  : null;
              if (typeof id !== "string" || !id.trim()) continue;

              update(
                "nostrReaction",
                {
                  id: id as Evolu.Id,
                  isDeleted: Evolu.sqliteTrue,
                },
                { ownerId: pruneOwners.messagesOwner.id },
              );
            }
          }
        }
      }

      setOwnerSyncData(derived);
      setMessagesOwnerIndex(nextIndex);
      pushToast(`${t("evoluMessagesOwnerRotated")} (0)`);
    } finally {
      setRotateMessagesOwnerIsBusy(false);
    }
  }, [
    allNostrMessagesRows,
    allNostrReactionsRows,
    contactsOwnerIndex,
    isSeedLogin,
    messagesOwnerIndex,
    pushToast,
    rotateMessagesOwnerIsBusy,
    slip39Seed,
    t,
    transactionsOwnerIndex,
    update,
    upsert,
  ]);

  const requestManualRotateMessagesOwner = React.useCallback(async () => {
    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!isSeedLogin || !normalizedSeed) {
      pushToast(t("seedMissing"));
      return;
    }

    const nowMs = Date.now();
    const cooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_MESSAGES_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    if (cooldownRemainingMs > 0) {
      pushToast(
        t("evoluRotateCooldown").replace(
          "{seconds}",
          String(Math.ceil(cooldownRemainingMs / 1000)),
        ),
      );
      return;
    }

    await rotateMessagesOwner();
  }, [isSeedLogin, pushToast, rotateMessagesOwner, slip39Seed, t]);

  const rotateTransactionsOwner = React.useCallback(async () => {
    if (rotateTransactionsOwnerIsBusy) return;

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!isSeedLogin || !normalizedSeed) {
      return;
    }

    const nowMs = Date.now();
    const cooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_TRANSACTIONS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    if (cooldownRemainingMs > 0) {
      return;
    }

    setRotateTransactionsOwnerIsBusy(true);
    try {
      const nextIndex = transactionsOwnerIndex + 1;
      const derived = await deriveOwnerSyncDataFromSeed(
        normalizedSeed,
        contactsOwnerIndex,
        messagesOwnerIndex,
        nextIndex,
      );
      if (!derived) {
        pushToast(t("restoreFailed"));
        return;
      }

      const pointerResult = upsertOwnerMetaPointer(
        upsert,
        derived.metaOwner.id,
        "transactions",
        `transactions-${nextIndex}`,
      );

      if (!pointerResult.ok) {
        pushToast(
          `${t("errorPrefix")}: ${formatMutationError(pointerResult.error)}`,
        );
        return;
      }

      setStoredIndex(EVOLU_TRANSACTIONS_OWNER_INDEX_STORAGE_KEY, nextIndex);
      const nextOwnerTransactionRows = allTransactionsRows.reduce(
        (count, row) =>
          readRowOwnerId(row) === String(derived.transactionsOwner.id).trim()
            ? count + 1
            : count,
        0,
      );
      setCounterValue(
        EVOLU_TRANSACTIONS_OWNER_BASELINE_COUNT_STORAGE_KEY,
        nextIndex,
        nextOwnerTransactionRows,
      );
      setCounterValue(
        EVOLU_TRANSACTIONS_OWNER_EDIT_COUNT_STORAGE_KEY,
        nextIndex,
        0,
      );
      setTransactionsOwnerEditCount(0);
      setStoredTimestampMs(
        EVOLU_TRANSACTIONS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
        nowMs,
      );

      if (nextIndex >= 2) {
        const pruneIndex = nextIndex - 2;
        const pruneOwners = await deriveOwnerSyncDataFromSeed(
          normalizedSeed,
          contactsOwnerIndex,
          messagesOwnerIndex,
          pruneIndex,
        );

        if (pruneOwners) {
          const pruneTransactionsOwnerId = String(
            pruneOwners.transactionsOwner.id,
          ).trim();
          if (pruneTransactionsOwnerId) {
            for (const row of allTransactionsRows) {
              if (readRowOwnerId(row) !== pruneTransactionsOwnerId) continue;
              const id =
                typeof row === "object" && row !== null && "id" in row
                  ? row.id
                  : null;
              if (typeof id !== "string" || !id.trim()) continue;

              update(
                "transaction",
                {
                  id: id as Evolu.Id,
                  isDeleted: Evolu.sqliteTrue,
                },
                { ownerId: pruneOwners.transactionsOwner.id },
              );
            }
          }
        }
      }

      setOwnerSyncData(derived);
      setTransactionsOwnerIndex(nextIndex);
      pushToast(`${t("evoluTransactionsOwnerRotated")} (0)`);
    } finally {
      setRotateTransactionsOwnerIsBusy(false);
    }
  }, [
    allTransactionsRows,
    contactsOwnerIndex,
    isSeedLogin,
    messagesOwnerIndex,
    pushToast,
    rotateTransactionsOwnerIsBusy,
    slip39Seed,
    t,
    transactionsOwnerIndex,
    update,
    upsert,
  ]);

  const requestManualRotateTransactionsOwner = React.useCallback(async () => {
    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!isSeedLogin || !normalizedSeed) {
      pushToast(t("seedMissing"));
      return;
    }

    const nowMs = Date.now();
    const cooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_TRANSACTIONS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    if (cooldownRemainingMs > 0) {
      pushToast(
        t("evoluRotateCooldown").replace(
          "{seconds}",
          String(Math.ceil(cooldownRemainingMs / 1000)),
        ),
      );
      return;
    }

    await rotateTransactionsOwner();
  }, [isSeedLogin, pushToast, rotateTransactionsOwner, slip39Seed, t]);

  React.useEffect(() => {
    if (!isSeedLogin) return;
    if (rotateContactsOwnerIsBusy) return;

    const shouldRotateContacts =
      contactsOwnerWriteDelta >= CONTACTS_OWNER_ROTATION_TRIGGER_WRITE_COUNT;
    const shouldRotateCashu =
      cashuOwnerWriteDelta >= CASHU_OWNER_ROTATION_TRIGGER_WRITE_COUNT;
    if (!shouldRotateContacts && !shouldRotateCashu) return;

    const nowMs = Date.now();
    const contactsCooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_CONTACTS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    const cashuCooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );

    if (shouldRotateContacts && contactsCooldownRemainingMs > 0) return;
    if (shouldRotateCashu && cashuCooldownRemainingMs > 0) return;

    void rotateContactsAndCashuOwner();
  }, [
    cashuOwnerWriteDelta,
    contactsOwnerWriteDelta,
    isSeedLogin,
    rotateContactsAndCashuOwner,
    rotateContactsOwnerIsBusy,
  ]);

  React.useEffect(() => {
    if (!isSeedLogin) return;
    if (rotateMessagesOwnerIsBusy) return;
    if (messagesOwnerWriteDelta < MESSAGES_OWNER_ROTATION_TRIGGER_WRITE_COUNT)
      return;

    const nowMs = Date.now();
    const cooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_MESSAGES_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    if (cooldownRemainingMs > 0) return;

    void rotateMessagesOwner();
  }, [
    isSeedLogin,
    messagesOwnerWriteDelta,
    rotateMessagesOwner,
    rotateMessagesOwnerIsBusy,
  ]);

  React.useEffect(() => {
    if (!isSeedLogin) return;
    if (rotateTransactionsOwnerIsBusy) return;
    if (
      transactionsOwnerWriteDelta <
      TRANSACTIONS_OWNER_ROTATION_TRIGGER_WRITE_COUNT
    ) {
      return;
    }

    const nowMs = Date.now();
    const cooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_TRANSACTIONS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    if (cooldownRemainingMs > 0) return;

    void rotateTransactionsOwner();
  }, [
    isSeedLogin,
    rotateTransactionsOwner,
    rotateTransactionsOwnerIsBusy,
    transactionsOwnerWriteDelta,
  ]);

  const contactsOwnerNewContactsCount = Math.max(
    0,
    getContactsForRotation().length - contactsOwnerBaselineCount,
  );
  const contactsOwnerEditsUntilRotation = Math.max(
    0,
    CONTACTS_OWNER_ROTATION_TRIGGER_WRITE_COUNT - contactsOwnerWriteDelta,
  );
  const cashuOwnerEditsUntilRotation = Math.max(
    0,
    CASHU_OWNER_ROTATION_TRIGGER_WRITE_COUNT - cashuOwnerWriteDelta,
  );
  const messagesOwnerEditsUntilRotation = Math.max(
    0,
    MESSAGES_OWNER_ROTATION_TRIGGER_WRITE_COUNT - messagesOwnerWriteDelta,
  );
  const transactionsOwnerEditsUntilRotation = Math.max(
    0,
    TRANSACTIONS_OWNER_ROTATION_TRIGGER_WRITE_COUNT -
      transactionsOwnerWriteDelta,
  );

  return {
    cashuOwnerId: isSeedLogin
      ? (ownerSyncData?.cashuOwner.id ?? null)
      : appOwnerId,
    cashuOwnerEditsUntilRotation,
    cashuOwnerPointer: `cashu-${contactsOwnerIndex}`,
    cashuSyncOwner: isSeedLogin ? (ownerSyncData?.cashuOwner ?? null) : null,
    contactsBackupOwnerId: isSeedLogin ? contactsBackupOwnerId : null,
    contactsOwnerEditCount,
    contactsOwnerEditsUntilRotation,
    contactsSyncOwner: isSeedLogin
      ? (ownerSyncData?.contactsOwner ?? null)
      : null,
    contactsOwnerId: isSeedLogin
      ? (ownerSyncData?.contactsOwner.id ?? null)
      : appOwnerId,
    contactsOwnerIndex,
    contactsOwnerNewContactsCount,
    contactsOwnerPointer: `contacts-${contactsOwnerIndex}`,
    identityOwnerId: isSeedLogin
      ? (ownerSyncData?.identityOwner.id ?? null)
      : appOwnerId,
    identitySyncOwner: isSeedLogin
      ? (ownerSyncData?.identityOwner ?? null)
      : null,
    metaOwnerId: isSeedLogin ? (ownerSyncData?.metaOwner.id ?? null) : null,
    metaSyncOwner: isSeedLogin ? (ownerSyncData?.metaOwner ?? null) : null,
    messagesBackupOwnerId: isSeedLogin ? messagesBackupOwnerId : null,
    messagesOwnerId: isSeedLogin
      ? (ownerSyncData?.messagesOwner.id ?? null)
      : appOwnerId,
    messagesOwnerIndex,
    messagesOwnerPointer: `messages-${messagesOwnerIndex}`,
    messagesOwnerEditsUntilRotation,
    messagesSyncOwner: isSeedLogin
      ? (ownerSyncData?.messagesOwner ?? null)
      : null,
    recordMessagesOwnerWrite,
    recordTransactionsOwnerWrite,
    recordContactsOwnerWrite,
    requestManualRotateContactsOwner,
    requestManualRotateMessagesOwner,
    requestManualRotateTransactionsOwner,
    rotateContactsOwnerIsBusy,
    rotateMessagesOwnerIsBusy,
    rotateTransactionsOwnerIsBusy,
    transactionsBackupOwnerId: isSeedLogin ? transactionsBackupOwnerId : null,
    transactionsOwnerEditsUntilRotation,
    transactionsOwnerId: isSeedLogin
      ? (ownerSyncData?.transactionsOwner.id ?? null)
      : appOwnerId,
    transactionsOwnerIndex,
    transactionsOwnerPointer: `transactions-${transactionsOwnerIndex}`,
    transactionsSyncOwner: isSeedLogin
      ? (ownerSyncData?.transactionsOwner ?? null)
      : null,
  };
};
