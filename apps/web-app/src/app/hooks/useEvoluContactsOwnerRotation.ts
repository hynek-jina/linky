import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import React from "react";
import type { EvoluHistoryMutationEntry } from "../../evolu";
import { evolu, loadEvoluHistoryMutationEntries } from "../../evolu";
import {
  CASHU_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
  CONTACTS_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
  EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_CASHU_OWNER_INDEX_STORAGE_KEY,
  EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_INDEX_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_INDEX_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
  MAX_CONTACTS_PER_OWNER,
  MESSAGES_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
  OWNER_ROTATION_COOLDOWN_MS,
  TRANSACTIONS_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
} from "../../utils/constants";
import { deriveEvoluOwnerMnemonicFromSlip39 } from "../../utils/slip39Nostr";
import { countOwnerHistoryWrites } from "../lib/ownerRotationHistory";
import {
  decodeRotationSnapshot,
  encodeRotationSnapshot,
  type RotationSnapshot,
} from "../lib/rotationSnapshot";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

type CounterMap = Record<string, number>;

interface RotationSnapshotsByScope {
  cashu: RotationSnapshot | null;
  contacts: RotationSnapshot | null;
  messages: RotationSnapshot | null;
  transactions: RotationSnapshot | null;
}

interface OwnerSyncData {
  cashuOwner: Evolu.AppOwner;
  contactsOwner: Evolu.AppOwner;
  identityOwner: Evolu.AppOwner;
  messagesOwner: Evolu.AppOwner;
  metaOwner: Evolu.AppOwner;
  transactionsOwner: Evolu.AppOwner;
}

interface FixedOwnerSyncData {
  identityOwner: Evolu.AppOwner;
  legacyIdentitiesOwner: Evolu.AppOwner;
  legacyMessagesIdentityOwner: Evolu.AppOwner;
  metaOwner: Evolu.AppOwner;
}

interface UseEvoluContactsOwnerRotationParams {
  appOwnerId: Evolu.OwnerId | null;
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
  cashuOwnerIndex: number;
  cashuOwnerPointer: string;
  cashuSyncOwner: Evolu.SyncOwner | null;
  cashuVisibleOwnerIds: Evolu.OwnerId[];
  contactsBackupOwnerId: Evolu.OwnerId | null;
  contactsOwnerEditCount: number;
  contactsOwnerEditsUntilRotation: number;
  contactsOwnerId: Evolu.OwnerId | null;
  contactsSyncOwner: Evolu.SyncOwner | null;
  contactsOwnerIndex: number;
  contactsOwnerNewContactsCount: number;
  contactsOwnerPointer: string;
  contactsVisibleOwnerIds: Evolu.OwnerId[];
  identityOwnerId: Evolu.OwnerId | null;
  identitySyncOwner: Evolu.SyncOwner | null;
  legacyIdentitiesOwnerId: Evolu.OwnerId | null;
  legacyIdentitiesSyncOwner: Evolu.SyncOwner | null;
  legacyMessagesIdentityOwnerId: Evolu.OwnerId | null;
  legacyMessagesIdentitySyncOwner: Evolu.SyncOwner | null;
  metaOwnerId: Evolu.OwnerId | null;
  metaSyncOwner: Evolu.SyncOwner | null;
  messagesBackupOwnerId: Evolu.OwnerId | null;
  messagesOwnerId: Evolu.OwnerId | null;
  messagesOwnerIndex: number;
  messagesOwnerPointer: string;
  messagesOwnerEditsUntilRotation: number;
  messagesSyncOwner: Evolu.SyncOwner | null;
  messagesVisibleOwnerIds: Evolu.OwnerId[];
  recordMessagesOwnerWrite: (count?: number) => void;
  recordTransactionsOwnerWrite: (count?: number) => void;
  requestManualRotateCashuOwner: () => Promise<void>;
  requestManualRotateContactsOwner: () => Promise<void>;
  requestManualRotateMessagesOwner: () => Promise<void>;
  requestManualRotateTransactionsOwner: () => Promise<void>;
  recordContactsOwnerWrite: (count?: number) => void;
  rotateCashuOwnerIsBusy: boolean;
  rotateContactsOwnerIsBusy: boolean;
  rotateMessagesOwnerIsBusy: boolean;
  rotateTransactionsOwnerIsBusy: boolean;
  transactionsBackupOwnerId: Evolu.OwnerId | null;
  transactionsOwnerEditsUntilRotation: number;
  transactionsOwnerId: Evolu.OwnerId | null;
  transactionsOwnerIndex: number;
  transactionsOwnerPointer: string;
  transactionsSyncOwner: Evolu.SyncOwner | null;
  transactionsVisibleOwnerIds: Evolu.OwnerId[];
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

const readRotationSnapshotsByScope = (
  ownerMetaRows: readonly Record<string, unknown>[],
  metaOwnerId: string,
): RotationSnapshotsByScope => {
  const snapshots: RotationSnapshotsByScope = {
    cashu: null,
    contacts: null,
    messages: null,
    transactions: null,
  };

  if (!metaOwnerId) return snapshots;

  for (const row of ownerMetaRows) {
    if (readRowOwnerId(row) !== metaOwnerId) continue;
    const scope =
      typeof row === "object" && row !== null && "scope" in row
        ? row.scope
        : null;
    const scopeText = typeof scope === "string" ? scope.trim() : "";

    if (
      scopeText !== "cashu" &&
      scopeText !== "contacts" &&
      scopeText !== "messages" &&
      scopeText !== "transactions"
    ) {
      continue;
    }

    const decoded = decodeRotationSnapshot(readRowPointerValue(row), scopeText);
    if (!decoded) continue;
    snapshots[scopeText] = decoded;
  }

  return snapshots;
};

const readSnapshotForCurrentIndex = (
  snapshot: RotationSnapshot | null,
  currentIndex: number,
): RotationSnapshot | null => {
  if (!snapshot) return null;
  return snapshot.index === currentIndex ? snapshot : null;
};

const needsStructuredSnapshotUpgrade = (
  snapshot: RotationSnapshot | null,
  currentIndex: number,
): boolean => {
  if (!snapshot) return true;
  if (snapshot.index !== currentIndex) return false;
  return snapshot.baseline === null || snapshot.rotatedAtMs === null;
};

const upsertOwnerMetaSnapshot = (
  upsert: EvoluMutations["upsert"],
  ownerId: Evolu.OwnerId,
  scope: "cashu" | "contacts" | "messages" | "transactions",
  snapshot: RotationSnapshot,
) =>
  upsert(
    "ownerMeta",
    {
      id: createMetaPointerRowId(scope),
      scope: scope as typeof Evolu.NonEmptyString100.Type,
      value: encodeRotationSnapshot(
        snapshot,
      ) as typeof Evolu.NonEmptyString1000.Type,
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

const getStoredOptionalIndex = (storageKey: string): number | null => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.trunc(parsed);
  } catch {
    return null;
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

const deriveFixedOwnerSyncDataFromSeed = async (
  slip39Seed: string,
): Promise<FixedOwnerSyncData | null> => {
  const [
    metaMnemonic,
    identityMnemonic,
    legacyIdentitiesMnemonic,
    legacyMessagesIdentityMnemonic,
  ] = await Promise.all([
    deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "meta", 0),
    deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "identity", 0),
    // Historical `identities-0` used path family 5, which is now the
    // transactions-0 path family.
    deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "transactions", 0),
    // Before PR #165, the identity role accidentally fell through here.
    deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "messages", 0),
  ]);

  if (
    !metaMnemonic ||
    !identityMnemonic ||
    !legacyIdentitiesMnemonic ||
    !legacyMessagesIdentityMnemonic
  )
    return null;

  const metaOwner = toAppOwnerFromMnemonic(metaMnemonic);
  const identityOwner = toAppOwnerFromMnemonic(identityMnemonic);
  const legacyIdentitiesOwner = toAppOwnerFromMnemonic(
    legacyIdentitiesMnemonic,
  );
  const legacyMessagesIdentityOwner = toAppOwnerFromMnemonic(
    legacyMessagesIdentityMnemonic,
  );

  if (
    !metaOwner ||
    !identityOwner ||
    !legacyIdentitiesOwner ||
    !legacyMessagesIdentityOwner
  )
    return null;

  return {
    identityOwner,
    legacyIdentitiesOwner,
    legacyMessagesIdentityOwner,
    metaOwner,
  };
};

const deriveOwnerSyncDataFromSeed = async (
  slip39Seed: string,
  contactsOwnerIndex: number,
  cashuOwnerIndex: number,
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
    deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "cashu", cashuOwnerIndex),
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

const deriveContactsOwnerIdsFromSeed = async (
  slip39Seed: string,
  contactsOwnerIndex: number,
): Promise<Evolu.OwnerId[]> => {
  const mnemonics = await Promise.all(
    Array.from({ length: contactsOwnerIndex + 1 }, (_value, index) =>
      deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "contacts", index),
    ),
  );

  const ownerIds: Evolu.OwnerId[] = [];

  for (const mnemonic of mnemonics) {
    if (!mnemonic) continue;
    const owner = toAppOwnerFromMnemonic(mnemonic);
    if (!owner) continue;
    ownerIds.push(owner.id);
  }

  return ownerIds;
};

const deriveCashuOwnerIdsFromSeed = async (
  slip39Seed: string,
  cashuOwnerIndex: number,
): Promise<Evolu.OwnerId[]> => {
  const mnemonics = await Promise.all(
    Array.from({ length: cashuOwnerIndex + 1 }, (_value, index) =>
      deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "cashu", index),
    ),
  );

  const ownerIds: Evolu.OwnerId[] = [];

  for (const mnemonic of mnemonics) {
    if (!mnemonic) continue;
    const owner = toAppOwnerFromMnemonic(mnemonic);
    if (!owner) continue;
    ownerIds.push(owner.id);
  }

  return ownerIds;
};

const deriveMessagesOwnerIdsFromSeed = async (
  slip39Seed: string,
  messagesOwnerIndex: number,
): Promise<Evolu.OwnerId[]> => {
  const mnemonics = await Promise.all(
    Array.from({ length: messagesOwnerIndex + 1 }, (_value, index) =>
      deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "messages", index),
    ),
  );

  const ownerIds: Evolu.OwnerId[] = [];

  for (const mnemonic of mnemonics) {
    if (!mnemonic) continue;
    const owner = toAppOwnerFromMnemonic(mnemonic);
    if (!owner) continue;
    ownerIds.push(owner.id);
  }

  return ownerIds;
};

const deriveTransactionsOwnerIdsFromSeed = async (
  slip39Seed: string,
  transactionsOwnerIndex: number,
): Promise<Evolu.OwnerId[]> => {
  const mnemonics = await Promise.all(
    Array.from({ length: transactionsOwnerIndex + 1 }, (_value, index) =>
      deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "transactions", index),
    ),
  );

  const ownerIds: Evolu.OwnerId[] = [];

  for (const mnemonic of mnemonics) {
    if (!mnemonic) continue;
    const owner = toAppOwnerFromMnemonic(mnemonic);
    if (!owner) continue;
    ownerIds.push(owner.id);
  }

  return ownerIds;
};

export const useEvoluContactsOwnerRotation = ({
  appOwnerId,
  isSeedLogin,
  pushToast,
  slip39Seed,
  t,
  update,
  upsert,
}: UseEvoluContactsOwnerRotationParams): UseEvoluContactsOwnerRotationResult => {
  const initialContactsOwnerIndex = React.useMemo(
    () => getStoredIndex(EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY),
    [],
  );
  const [contactsOwnerIndex, setContactsOwnerIndex] = React.useState<number>(
    () => initialContactsOwnerIndex,
  );
  const [cashuOwnerIndex, setCashuOwnerIndex] = React.useState<number>(
    () =>
      getStoredOptionalIndex(EVOLU_CASHU_OWNER_INDEX_STORAGE_KEY) ??
      initialContactsOwnerIndex,
  );
  const [messagesOwnerIndex, setMessagesOwnerIndex] = React.useState<number>(
    () => getStoredIndex(EVOLU_MESSAGES_OWNER_INDEX_STORAGE_KEY),
  );
  const [transactionsOwnerIndex, setTransactionsOwnerIndex] =
    React.useState<number>(() =>
      getStoredIndex(EVOLU_TRANSACTIONS_OWNER_INDEX_STORAGE_KEY),
    );
  const [fixedOwnerSyncData, setFixedOwnerSyncData] =
    React.useState<FixedOwnerSyncData | null>(null);
  const [ownerSyncData, setOwnerSyncData] =
    React.useState<OwnerSyncData | null>(null);
  const [cashuVisibleOwnerIds, setCashuVisibleOwnerIds] = React.useState<
    Evolu.OwnerId[]
  >([]);
  const [contactsVisibleOwnerIds, setContactsVisibleOwnerIds] = React.useState<
    Evolu.OwnerId[]
  >([]);
  const [messagesVisibleOwnerIds, setMessagesVisibleOwnerIds] = React.useState<
    Evolu.OwnerId[]
  >([]);
  const [transactionsVisibleOwnerIds, setTransactionsVisibleOwnerIds] =
    React.useState<Evolu.OwnerId[]>([]);
  const [contactsBackupOwnerId, setContactsBackupOwnerId] =
    React.useState<Evolu.OwnerId | null>(null);
  const [messagesBackupOwnerId, setMessagesBackupOwnerId] =
    React.useState<Evolu.OwnerId | null>(null);
  const [transactionsBackupOwnerId, setTransactionsBackupOwnerId] =
    React.useState<Evolu.OwnerId | null>(null);
  const [rotateContactsOwnerIsBusy, setRotateContactsOwnerIsBusy] =
    React.useState(false);
  const [rotateCashuOwnerIsBusy, setRotateCashuOwnerIsBusy] =
    React.useState(false);
  const [rotateMessagesOwnerIsBusy, setRotateMessagesOwnerIsBusy] =
    React.useState(false);
  const [rotateTransactionsOwnerIsBusy, setRotateTransactionsOwnerIsBusy] =
    React.useState(false);
  const [allowMissingOwnerMetaBootstrap, setAllowMissingOwnerMetaBootstrap] =
    React.useState(false);
  const [historyMutationEntries, setHistoryMutationEntries] = React.useState<
    readonly EvoluHistoryMutationEntry[]
  >([]);

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
    let cancelled = false;

    void loadEvoluHistoryMutationEntries().then((rows) => {
      if (cancelled) return;
      setHistoryMutationEntries(rows);
    });

    return () => {
      cancelled = true;
    };
  }, [
    allCashuTokensRows,
    allContactsRows,
    allNostrMessagesRows,
    allNostrReactionsRows,
    allTransactionsRows,
    ownerMetaRows,
  ]);

  const recordContactsOwnerWrite = React.useCallback(() => {
    // Rotation counts are derived from local Evolu history.
  }, []);

  const recordMessagesOwnerWrite = React.useCallback(() => {
    // Rotation counts are derived from local Evolu history.
  }, []);

  const recordTransactionsOwnerWrite = React.useCallback(() => {
    // Rotation counts are derived from local Evolu history.
  }, []);

  React.useEffect(() => {
    if (!isSeedLogin) {
      setFixedOwnerSyncData(null);
      return;
    }

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!normalizedSeed) {
      setFixedOwnerSyncData(null);
      return;
    }

    let cancelled = false;

    void deriveFixedOwnerSyncDataFromSeed(normalizedSeed).then((derived) => {
      if (cancelled) return;
      setFixedOwnerSyncData(derived);
    });

    return () => {
      cancelled = true;
    };
  }, [isSeedLogin, slip39Seed]);

  React.useEffect(() => {
    if (!isSeedLogin) {
      setAllowMissingOwnerMetaBootstrap(false);
      return;
    }

    const metaOwnerId = String(fixedOwnerSyncData?.metaOwner.id ?? "").trim();
    if (!metaOwnerId) {
      setAllowMissingOwnerMetaBootstrap(false);
      return;
    }

    setAllowMissingOwnerMetaBootstrap(false);
    const timeoutId = window.setTimeout(() => {
      setAllowMissingOwnerMetaBootstrap(true);
    }, 2500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fixedOwnerSyncData?.metaOwner.id, isSeedLogin]);

  const metaOwnerIdText = String(fixedOwnerSyncData?.metaOwner.id ?? "").trim();
  const rotationSnapshots = React.useMemo(
    () => readRotationSnapshotsByScope(ownerMetaRows, metaOwnerIdText),
    [metaOwnerIdText, ownerMetaRows],
  );

  const resolvedContactsOwnerIndex =
    rotationSnapshots.contacts?.index ?? contactsOwnerIndex;
  const resolvedCashuOwnerIndex =
    rotationSnapshots.cashu?.index ?? cashuOwnerIndex;
  const resolvedMessagesOwnerIndex =
    rotationSnapshots.messages?.index ?? messagesOwnerIndex;
  const resolvedTransactionsOwnerIndex =
    rotationSnapshots.transactions?.index ?? transactionsOwnerIndex;

  const contactsRotationSnapshot = readSnapshotForCurrentIndex(
    rotationSnapshots.contacts,
    resolvedContactsOwnerIndex,
  );
  const cashuRotationSnapshot = readSnapshotForCurrentIndex(
    rotationSnapshots.cashu,
    resolvedCashuOwnerIndex,
  );
  const messagesRotationSnapshot = readSnapshotForCurrentIndex(
    rotationSnapshots.messages,
    resolvedMessagesOwnerIndex,
  );
  const transactionsRotationSnapshot = readSnapshotForCurrentIndex(
    rotationSnapshots.transactions,
    resolvedTransactionsOwnerIndex,
  );

  const contactsOwnerBaselineCount = React.useMemo(
    () =>
      contactsRotationSnapshot?.baseline ??
      getCounterValue(
        EVOLU_CONTACTS_OWNER_BASELINE_COUNT_STORAGE_KEY,
        contactsOwnerIndex,
      ),
    [contactsOwnerIndex, contactsRotationSnapshot],
  );
  const cashuOwnerBaselineCount = React.useMemo(
    () =>
      cashuRotationSnapshot?.baseline ??
      getCounterValue(
        EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY,
        cashuOwnerIndex,
      ),
    [cashuOwnerIndex, cashuRotationSnapshot],
  );
  const messagesOwnerBaselineCount = React.useMemo(
    () =>
      messagesRotationSnapshot?.baseline ??
      getCounterValue(
        EVOLU_MESSAGES_OWNER_BASELINE_COUNT_STORAGE_KEY,
        messagesOwnerIndex,
      ),
    [messagesOwnerIndex, messagesRotationSnapshot],
  );
  const transactionsOwnerBaselineCount = React.useMemo(
    () =>
      transactionsRotationSnapshot?.baseline ??
      getCounterValue(
        EVOLU_TRANSACTIONS_OWNER_BASELINE_COUNT_STORAGE_KEY,
        transactionsOwnerIndex,
      ),
    [transactionsOwnerIndex, transactionsRotationSnapshot],
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

  const contactsOwnerEditCount = React.useMemo(
    () =>
      countOwnerHistoryWrites({
        entries: historyMutationEntries,
        fallbackCount: Math.max(
          0,
          contactsOwnerWriteCount - contactsOwnerBaselineCount,
        ),
        ownerId: contactsActiveOwnerId,
        rotatedAtMs: contactsRotationSnapshot?.rotatedAtMs ?? null,
        tables: ["contact"],
      }),
    [
      contactsActiveOwnerId,
      contactsOwnerBaselineCount,
      contactsOwnerWriteCount,
      contactsRotationSnapshot,
      historyMutationEntries,
    ],
  );

  const cashuOwnerWriteDelta = React.useMemo(
    () =>
      countOwnerHistoryWrites({
        entries: historyMutationEntries,
        fallbackCount: Math.max(
          0,
          cashuOwnerWriteCount - cashuOwnerBaselineCount,
        ),
        ownerId: cashuActiveOwnerId,
        rotatedAtMs: cashuRotationSnapshot?.rotatedAtMs ?? null,
        tables: ["cashuToken"],
      }),
    [
      cashuActiveOwnerId,
      cashuOwnerBaselineCount,
      cashuOwnerWriteCount,
      cashuRotationSnapshot,
      historyMutationEntries,
    ],
  );

  const messagesOwnerWriteDelta = React.useMemo(
    () =>
      countOwnerHistoryWrites({
        entries: historyMutationEntries,
        fallbackCount: Math.max(
          0,
          messagesOwnerWriteCount - messagesOwnerBaselineCount,
        ),
        ownerId: messagesActiveOwnerId,
        rotatedAtMs: messagesRotationSnapshot?.rotatedAtMs ?? null,
        tables: ["nostrMessage", "nostrReaction"],
      }),
    [
      historyMutationEntries,
      messagesActiveOwnerId,
      messagesOwnerBaselineCount,
      messagesOwnerWriteCount,
      messagesRotationSnapshot,
    ],
  );

  const transactionsOwnerWriteDelta = React.useMemo(
    () =>
      countOwnerHistoryWrites({
        entries: historyMutationEntries,
        fallbackCount: Math.max(
          0,
          transactionsOwnerWriteCount - transactionsOwnerBaselineCount,
        ),
        ownerId: transactionsActiveOwnerId,
        rotatedAtMs: transactionsRotationSnapshot?.rotatedAtMs ?? null,
        tables: ["transaction"],
      }),
    [
      historyMutationEntries,
      transactionsActiveOwnerId,
      transactionsOwnerBaselineCount,
      transactionsOwnerWriteCount,
      transactionsRotationSnapshot,
    ],
  );
  const contactsOwnerWriteDelta = contactsOwnerEditCount;

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
        cashuOwnerIndex,
      )
    ) {
      setCounterValue(
        EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY,
        cashuOwnerIndex,
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
    cashuOwnerIndex,
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
      setCashuVisibleOwnerIds([]);
      setContactsVisibleOwnerIds([]);
      setMessagesVisibleOwnerIds([]);
      setTransactionsVisibleOwnerIds([]);
      setContactsBackupOwnerId(null);
      setMessagesBackupOwnerId(null);
      setTransactionsBackupOwnerId(null);
      return;
    }

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!normalizedSeed) {
      setOwnerSyncData(null);
      setCashuVisibleOwnerIds([]);
      setContactsVisibleOwnerIds([]);
      setMessagesVisibleOwnerIds([]);
      setTransactionsVisibleOwnerIds([]);
      setContactsBackupOwnerId(null);
      setMessagesBackupOwnerId(null);
      setTransactionsBackupOwnerId(null);
      return;
    }

    let cancelled = false;
    void Promise.all([
      deriveOwnerSyncDataFromSeed(
        normalizedSeed,
        resolvedContactsOwnerIndex,
        resolvedCashuOwnerIndex,
        resolvedMessagesOwnerIndex,
        resolvedTransactionsOwnerIndex,
      ),
      deriveCashuOwnerIdsFromSeed(normalizedSeed, resolvedCashuOwnerIndex),
      deriveContactsOwnerIdsFromSeed(
        normalizedSeed,
        resolvedContactsOwnerIndex,
      ),
      deriveMessagesOwnerIdsFromSeed(
        normalizedSeed,
        resolvedMessagesOwnerIndex,
      ),
      deriveTransactionsOwnerIdsFromSeed(
        normalizedSeed,
        resolvedTransactionsOwnerIndex,
      ),
      resolvedContactsOwnerIndex > 0
        ? deriveOwnerSyncDataFromSeed(
            normalizedSeed,
            resolvedContactsOwnerIndex - 1,
            resolvedCashuOwnerIndex,
            resolvedMessagesOwnerIndex,
            resolvedTransactionsOwnerIndex,
          )
        : Promise.resolve(null),
      resolvedMessagesOwnerIndex > 0
        ? deriveOwnerSyncDataFromSeed(
            normalizedSeed,
            resolvedContactsOwnerIndex,
            resolvedCashuOwnerIndex,
            resolvedMessagesOwnerIndex - 1,
            resolvedTransactionsOwnerIndex,
          )
        : Promise.resolve(null),
      resolvedTransactionsOwnerIndex > 0
        ? deriveOwnerSyncDataFromSeed(
            normalizedSeed,
            resolvedContactsOwnerIndex,
            resolvedCashuOwnerIndex,
            resolvedMessagesOwnerIndex,
            resolvedTransactionsOwnerIndex - 1,
          )
        : Promise.resolve(null),
    ]).then(
      ([
        derived,
        visibleCashuOwnerIds,
        visibleContactOwnerIds,
        visibleMessagesOwnerIds,
        visibleTransactionsOwnerIds,
        contactsBackup,
        messagesBackup,
        transactionsBackup,
      ]) => {
        if (cancelled) return;
        setOwnerSyncData(derived);
        setCashuVisibleOwnerIds(visibleCashuOwnerIds);
        setContactsVisibleOwnerIds(visibleContactOwnerIds);
        setMessagesVisibleOwnerIds(visibleMessagesOwnerIds);
        setTransactionsVisibleOwnerIds(visibleTransactionsOwnerIds);
        setContactsBackupOwnerId(contactsBackup?.contactsOwner.id ?? null);
        setMessagesBackupOwnerId(messagesBackup?.messagesOwner.id ?? null);
        setTransactionsBackupOwnerId(
          transactionsBackup?.transactionsOwner.id ?? null,
        );
      },
    );

    return () => {
      cancelled = true;
    };
  }, [
    isSeedLogin,
    resolvedCashuOwnerIndex,
    resolvedContactsOwnerIndex,
    resolvedMessagesOwnerIndex,
    resolvedTransactionsOwnerIndex,
    slip39Seed,
  ]);

  // Cashu writes stay on the active cashu owner only. Older duplicates can
  // remain from earlier versions, but new writes no longer mirror into a
  // contacts-aligned legacy lane.

  React.useEffect(() => {
    if (!fixedOwnerSyncData) return;

    const metaOwnerId = String(fixedOwnerSyncData.metaOwner.id).trim();
    if (!metaOwnerId) return;

    let cashuSnap: RotationSnapshot | null = null;
    let contactsSnap: RotationSnapshot | null = null;
    let messagesSnap: RotationSnapshot | null = null;
    let transactionsSnap: RotationSnapshot | null = null;
    for (const row of ownerMetaRows) {
      if (readRowOwnerId(row) !== metaOwnerId) continue;
      const scope =
        typeof row === "object" && row !== null && "scope" in row
          ? row.scope
          : null;
      const scopeText = typeof scope === "string" ? scope.trim() : "";
      const rawValue = readRowPointerValue(row);
      if (scopeText === "cashu") {
        const decoded = decodeRotationSnapshot(rawValue, "cashu");
        if (decoded) cashuSnap = decoded;
      } else if (scopeText === "contacts") {
        const decoded = decodeRotationSnapshot(rawValue, "contacts");
        if (decoded) contactsSnap = decoded;
      } else if (scopeText === "messages") {
        const decoded = decodeRotationSnapshot(rawValue, "messages");
        if (decoded) messagesSnap = decoded;
      } else if (scopeText === "transactions") {
        const decoded = decodeRotationSnapshot(rawValue, "transactions");
        if (decoded) transactionsSnap = decoded;
      }
    }

    // When adopting a rotation from another device we must reset baseline +
    // lastRotatedAt for the new index. Otherwise the adopter sees
    // `delta = currentRowCount - 0` once Evolu sync pulls in the migrated
    // rows and immediately re-rotates, cascading divergent owner lanes
    // across the fleet.
    //
    // JSON snapshots carry the authoritative baseline values. Legacy
    // `<scope>-N` values lose them — we fall back to baseline=0 and prime
    // the cooldown with `now`, which matches the existing behaviour and is
    // the best we can do without a baseline hint from the rotator.
    const adoptIndex = (params: {
      indexStorageKey: string;
      baselineStorageKey: string;
      lastRotatedStorageKey: string;
      currentIndex: number;
      nextIndex: number;
      baseline: number | null;
      rotatedAtMs: number | null;
      setCurrentIndex: (next: number) => void;
      extra?: () => void;
    }) => {
      const {
        indexStorageKey,
        baselineStorageKey,
        lastRotatedStorageKey,
        currentIndex,
        nextIndex,
        baseline,
        rotatedAtMs,
        setCurrentIndex,
        extra,
      } = params;
      if (nextIndex === currentIndex) return;
      setStoredIndex(indexStorageKey, nextIndex);
      setCounterValue(baselineStorageKey, nextIndex, baseline ?? 0);
      setStoredTimestampMs(lastRotatedStorageKey, rotatedAtMs ?? Date.now());
      setCurrentIndex(nextIndex);
      extra?.();
    };

    if (cashuSnap && cashuSnap.index !== cashuOwnerIndex) {
      adoptIndex({
        indexStorageKey: EVOLU_CASHU_OWNER_INDEX_STORAGE_KEY,
        baselineStorageKey: EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY,
        lastRotatedStorageKey: EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
        currentIndex: cashuOwnerIndex,
        nextIndex: cashuSnap.index,
        baseline: cashuSnap.baseline,
        rotatedAtMs: cashuSnap.rotatedAtMs,
        setCurrentIndex: setCashuOwnerIndex,
      });
    }

    if (contactsSnap && contactsSnap.index !== contactsOwnerIndex) {
      const snap = contactsSnap;
      adoptIndex({
        indexStorageKey: EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY,
        baselineStorageKey: EVOLU_CONTACTS_OWNER_BASELINE_COUNT_STORAGE_KEY,
        lastRotatedStorageKey:
          EVOLU_CONTACTS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
        currentIndex: contactsOwnerIndex,
        nextIndex: snap.index,
        baseline: snap.baseline,
        rotatedAtMs: snap.rotatedAtMs,
        setCurrentIndex: setContactsOwnerIndex,
      });
    }

    if (messagesSnap && messagesSnap.index !== messagesOwnerIndex) {
      adoptIndex({
        indexStorageKey: EVOLU_MESSAGES_OWNER_INDEX_STORAGE_KEY,
        baselineStorageKey: EVOLU_MESSAGES_OWNER_BASELINE_COUNT_STORAGE_KEY,
        lastRotatedStorageKey:
          EVOLU_MESSAGES_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
        currentIndex: messagesOwnerIndex,
        nextIndex: messagesSnap.index,
        baseline: messagesSnap.baseline,
        rotatedAtMs: messagesSnap.rotatedAtMs,
        setCurrentIndex: setMessagesOwnerIndex,
      });
    }

    if (transactionsSnap && transactionsSnap.index !== transactionsOwnerIndex) {
      adoptIndex({
        indexStorageKey: EVOLU_TRANSACTIONS_OWNER_INDEX_STORAGE_KEY,
        baselineStorageKey: EVOLU_TRANSACTIONS_OWNER_BASELINE_COUNT_STORAGE_KEY,
        lastRotatedStorageKey:
          EVOLU_TRANSACTIONS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
        currentIndex: transactionsOwnerIndex,
        nextIndex: transactionsSnap.index,
        baseline: transactionsSnap.baseline,
        rotatedAtMs: transactionsSnap.rotatedAtMs,
        setCurrentIndex: setTransactionsOwnerIndex,
      });
    }
  }, [
    cashuOwnerIndex,
    contactsOwnerIndex,
    fixedOwnerSyncData,
    messagesOwnerIndex,
    ownerMetaRows,
    slip39Seed,
    transactionsOwnerIndex,
  ]);

  React.useEffect(() => {
    if (!isSeedLogin) return;
    if (!fixedOwnerSyncData) return;
    if (!ownerSyncData) return;
    if (rotationSnapshots.cashu) return;
    if (cashuOwnerIndex <= 0) return;
    if (cashuOwnerWriteCount > 0) return;

    setStoredIndex(EVOLU_CASHU_OWNER_INDEX_STORAGE_KEY, 0);
    setCounterValue(EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY, 0, 0);
    setStoredTimestampMs(EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY, 0);
    setCashuOwnerIndex(0);
  }, [
    cashuOwnerIndex,
    cashuOwnerWriteCount,
    fixedOwnerSyncData,
    isSeedLogin,
    ownerSyncData,
    rotationSnapshots.cashu,
  ]);

  // Bootstrap or upgrade the active scope snapshots in ownerMeta.
  //
  // Users who joined before rotation pointers existed (or who never crossed
  // a rotation threshold post-deploy) have local `*OwnerIndex` values that
  // diverge across devices silently, because the reconciler above has
  // nothing in ownerMeta to read. Without a manual `Rotate ... owner` click
  // from Advanced > Evolu data, devices can stay out of sync indefinitely.
  //
  // Write the current local snapshot once per scope when the entry is
  // missing, or when a legacy / incomplete snapshot lacks baseline or
  // rotatedAtMs. The first device to upgrade seeds ownerMeta with its
  // current lane index + row counts and resets the deterministic history
  // window to "from now".
  //
  // If two devices boot at the same time and both write their own snapshot
  // (different local indices), CRDT LWW picks one and the loser adopts
  // through the same reconciler + heal path. Same convergence outcome.
  React.useEffect(() => {
    if (!isSeedLogin) return;
    if (!fixedOwnerSyncData) return;
    if (!ownerSyncData) return;
    const metaOwnerId = fixedOwnerSyncData.metaOwner.id;
    const metaOwnerIdStr = String(metaOwnerId).trim();
    if (!metaOwnerIdStr) return;

    const readSnapshotForScope = (
      scope: "cashu" | "contacts" | "messages" | "transactions",
    ): RotationSnapshot | null => {
      for (const row of ownerMetaRows) {
        if (readRowOwnerId(row) !== metaOwnerIdStr) continue;
        const rowScope =
          typeof row === "object" && row !== null && "scope" in row
            ? row.scope
            : null;
        const rowScopeText =
          typeof rowScope === "string" ? rowScope.trim() : "";
        if (rowScopeText !== scope) continue;
        const decoded = decodeRotationSnapshot(readRowPointerValue(row), scope);
        if (decoded) return decoded;
      }
      return null;
    };

    const nowMs = Date.now();

    const shouldWriteSnapshot = (
      snapshot: RotationSnapshot | null,
      currentIndex: number,
      currentWriteCount: number,
    ): boolean => {
      if (snapshot) {
        return needsStructuredSnapshotUpgrade(snapshot, currentIndex);
      }
      return (
        allowMissingOwnerMetaBootstrap &&
        currentIndex > 0 &&
        currentWriteCount > 0
      );
    };

    if (
      shouldWriteSnapshot(
        readSnapshotForScope("cashu"),
        resolvedCashuOwnerIndex,
        cashuOwnerWriteCount,
      )
    ) {
      upsertOwnerMetaSnapshot(upsert, metaOwnerId, "cashu", {
        index: resolvedCashuOwnerIndex,
        baseline: cashuOwnerWriteCount,
        cashuBaseline: null,
        rotatedAtMs: nowMs,
      });
    }

    if (
      shouldWriteSnapshot(
        readSnapshotForScope("contacts"),
        resolvedContactsOwnerIndex,
        contactsOwnerWriteCount,
      )
    ) {
      upsertOwnerMetaSnapshot(upsert, metaOwnerId, "contacts", {
        index: resolvedContactsOwnerIndex,
        baseline: contactsOwnerWriteCount,
        cashuBaseline: cashuOwnerWriteCount,
        rotatedAtMs: nowMs,
      });
    }

    if (
      shouldWriteSnapshot(
        readSnapshotForScope("messages"),
        resolvedMessagesOwnerIndex,
        messagesOwnerWriteCount,
      )
    ) {
      upsertOwnerMetaSnapshot(upsert, metaOwnerId, "messages", {
        index: resolvedMessagesOwnerIndex,
        baseline: messagesOwnerWriteCount,
        cashuBaseline: null,
        rotatedAtMs: nowMs,
      });
    }

    if (
      shouldWriteSnapshot(
        readSnapshotForScope("transactions"),
        resolvedTransactionsOwnerIndex,
        transactionsOwnerWriteCount,
      )
    ) {
      upsertOwnerMetaSnapshot(upsert, metaOwnerId, "transactions", {
        index: resolvedTransactionsOwnerIndex,
        baseline: transactionsOwnerWriteCount,
        cashuBaseline: null,
        rotatedAtMs: nowMs,
      });
    }
  }, [
    allowMissingOwnerMetaBootstrap,
    cashuOwnerIndex,
    cashuOwnerWriteCount,
    contactsOwnerIndex,
    contactsOwnerWriteCount,
    fixedOwnerSyncData,
    isSeedLogin,
    messagesOwnerIndex,
    messagesOwnerWriteCount,
    ownerMetaRows,
    ownerSyncData,
    resolvedCashuOwnerIndex,
    resolvedContactsOwnerIndex,
    resolvedMessagesOwnerIndex,
    resolvedTransactionsOwnerIndex,
    transactionsOwnerIndex,
    transactionsOwnerWriteCount,
    upsert,
  ]);

  const rotateContactsOwner = React.useCallback(async () => {
    if (rotateContactsOwnerIsBusy) return;

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!isSeedLogin || !normalizedSeed) {
      return;
    }

    const nowMs = Date.now();
    const cooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_CONTACTS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    if (cooldownRemainingMs > 0) {
      return;
    }

    setRotateContactsOwnerIsBusy(true);
    try {
      const nextIndex = contactsOwnerIndex + 1;
      const derived = await deriveOwnerSyncDataFromSeed(
        normalizedSeed,
        nextIndex,
        cashuOwnerIndex,
        messagesOwnerIndex,
        transactionsOwnerIndex,
      );
      if (!derived) {
        pushToast(t("restoreFailed"));
        return;
      }

      // Encode the full rotation snapshot — adopters need baseline +
      // rotatedAtMs so their local delta calculation starts at 0 and the
      // cooldown blocks an immediate re-rotation. Legacy adopters that only
      // know how to parse `contacts-N` ignore the extra fields.
      const contactsPointerResult = upsertOwnerMetaSnapshot(
        upsert,
        derived.metaOwner.id,
        "contacts",
        {
          index: nextIndex,
          baseline: 0,
          cashuBaseline: cashuOwnerWriteCount,
          rotatedAtMs: nowMs,
        },
      );

      if (!contactsPointerResult.ok) {
        pushToast(
          `${t("errorPrefix")}: ${formatMutationError(contactsPointerResult.error)}`,
        );
        return;
      }

      setStoredIndex(EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY, nextIndex);
      setCounterValue(
        EVOLU_CONTACTS_OWNER_BASELINE_COUNT_STORAGE_KEY,
        nextIndex,
        0,
      );
      setCounterValue(
        EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY,
        nextIndex,
        cashuOwnerWriteCount,
      );
      setStoredTimestampMs(
        EVOLU_CONTACTS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
        nowMs,
      );
      setStoredTimestampMs(
        EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
        nowMs,
      );

      setOwnerSyncData(derived);
      setContactsVisibleOwnerIds((previous) => {
        const nextIds = [...previous, derived.contactsOwner.id];
        return Array.from(new Set(nextIds));
      });
      setContactsOwnerIndex(nextIndex);
      pushToast(t("evoluContactsOwnerRotated"));
    } finally {
      setRotateContactsOwnerIsBusy(false);
    }
  }, [
    cashuOwnerIndex,
    cashuOwnerWriteCount,
    contactsOwnerIndex,
    isSeedLogin,
    pushToast,
    rotateContactsOwnerIsBusy,
    messagesOwnerIndex,
    slip39Seed,
    t,
    transactionsOwnerIndex,
    update,
    upsert,
  ]);

  const rotateCashuOwner = React.useCallback(async () => {
    if (rotateCashuOwnerIsBusy) return;

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!isSeedLogin || !normalizedSeed) {
      return;
    }

    const nowMs = Date.now();
    const cooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    if (cooldownRemainingMs > 0) {
      return;
    }

    setRotateCashuOwnerIsBusy(true);
    try {
      const nextIndex = cashuOwnerIndex + 1;
      const derived = await deriveOwnerSyncDataFromSeed(
        normalizedSeed,
        contactsOwnerIndex,
        nextIndex,
        messagesOwnerIndex,
        transactionsOwnerIndex,
      );
      if (!derived) {
        pushToast(t("restoreFailed"));
        return;
      }

      const cashuPointerResult = upsertOwnerMetaSnapshot(
        upsert,
        derived.metaOwner.id,
        "cashu",
        {
          index: nextIndex,
          baseline: 0,
          cashuBaseline: null,
          rotatedAtMs: nowMs,
        },
      );

      if (!cashuPointerResult.ok) {
        pushToast(
          `${t("errorPrefix")}: ${formatMutationError(cashuPointerResult.error)}`,
        );
        return;
      }

      setStoredIndex(EVOLU_CASHU_OWNER_INDEX_STORAGE_KEY, nextIndex);
      const nextOwnerCashuRows = allCashuTokensRows.reduce(
        (count, row) =>
          readRowOwnerId(row) === String(derived.cashuOwner.id).trim()
            ? count + 1
            : count,
        0,
      );
      setCounterValue(
        EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY,
        nextIndex,
        nextOwnerCashuRows,
      );
      setStoredTimestampMs(
        EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
        nowMs,
      );

      setOwnerSyncData(derived);
      setCashuVisibleOwnerIds((previous) => {
        const nextIds = [...previous, derived.cashuOwner.id];
        return Array.from(new Set(nextIds));
      });
      setCashuOwnerIndex(nextIndex);
      pushToast(`${t("evoluCashuOwnerRotated")} (0)`);
    } finally {
      setRotateCashuOwnerIsBusy(false);
    }
  }, [
    allCashuTokensRows,
    cashuOwnerIndex,
    contactsOwnerIndex,
    isSeedLogin,
    messagesOwnerIndex,
    pushToast,
    rotateCashuOwnerIsBusy,
    slip39Seed,
    t,
    transactionsOwnerIndex,
    upsert,
  ]);

  const requestManualRotateContactsOwner = React.useCallback(async () => {
    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!isSeedLogin || !normalizedSeed) {
      pushToast(t("seedMissing"));
      return;
    }

    const nowMs = Date.now();
    const cooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_CONTACTS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
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

    await rotateContactsOwner();
  }, [isSeedLogin, pushToast, rotateContactsOwner, slip39Seed, t]);

  const requestManualRotateCashuOwner = React.useCallback(async () => {
    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!isSeedLogin || !normalizedSeed) {
      pushToast(t("seedMissing"));
      return;
    }

    const nowMs = Date.now();
    const cooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
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

    await rotateCashuOwner();
  }, [isSeedLogin, pushToast, rotateCashuOwner, slip39Seed, t]);

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
        cashuOwnerIndex,
        nextIndex,
        transactionsOwnerIndex,
      );
      if (!derived) {
        pushToast(t("restoreFailed"));
        return;
      }

      // Messages rotation is pointer-only (no row copy), so baseline = 0
      // for the new lane. rotatedAtMs primes the adopter's cooldown.
      const pointerResult = upsertOwnerMetaSnapshot(
        upsert,
        derived.metaOwner.id,
        "messages",
        {
          index: nextIndex,
          baseline: 0,
          cashuBaseline: null,
          rotatedAtMs: nowMs,
        },
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
      setStoredTimestampMs(
        EVOLU_MESSAGES_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
        nowMs,
      );

      setOwnerSyncData(derived);
      setMessagesVisibleOwnerIds((previous) => {
        const nextIds = [...previous, derived.messagesOwner.id];
        return Array.from(new Set(nextIds));
      });
      setMessagesOwnerIndex(nextIndex);
      pushToast(`${t("evoluMessagesOwnerRotated")} (0)`);
    } finally {
      setRotateMessagesOwnerIsBusy(false);
    }
  }, [
    contactsOwnerIndex,
    isSeedLogin,
    messagesOwnerIndex,
    pushToast,
    rotateMessagesOwnerIsBusy,
    slip39Seed,
    t,
    transactionsOwnerIndex,
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
        cashuOwnerIndex,
        messagesOwnerIndex,
        nextIndex,
      );
      if (!derived) {
        pushToast(t("restoreFailed"));
        return;
      }

      // Transactions rotation is pointer-only (no row copy). Baseline =
      // 0 + rotatedAtMs primes the adopter's cooldown so it doesn't
      // re-rotate when Evolu sync floods rows into the new lane.
      const pointerResult = upsertOwnerMetaSnapshot(
        upsert,
        derived.metaOwner.id,
        "transactions",
        {
          index: nextIndex,
          baseline: 0,
          cashuBaseline: null,
          rotatedAtMs: nowMs,
        },
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
      setStoredTimestampMs(
        EVOLU_TRANSACTIONS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
        nowMs,
      );

      setOwnerSyncData(derived);
      setTransactionsVisibleOwnerIds((previous) => {
        const nextIds = [...previous, derived.transactionsOwner.id];
        return Array.from(new Set(nextIds));
      });
      setTransactionsOwnerIndex(nextIndex);
      pushToast(`${t("evoluTransactionsOwnerRotated")} (0)`);
    } finally {
      setRotateTransactionsOwnerIsBusy(false);
    }
  }, [
    contactsOwnerIndex,
    isSeedLogin,
    messagesOwnerIndex,
    pushToast,
    rotateTransactionsOwnerIsBusy,
    slip39Seed,
    t,
    transactionsOwnerIndex,
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
    const reachedEditLimit =
      contactsOwnerWriteDelta >= CONTACTS_OWNER_ROTATION_TRIGGER_WRITE_COUNT;
    const reachedRecordLimit =
      contactsOwnerWriteCount >= MAX_CONTACTS_PER_OWNER;
    if (!reachedEditLimit && !reachedRecordLimit) {
      return;
    }

    const nowMs = Date.now();
    const cooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_CONTACTS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    if (cooldownRemainingMs > 0) return;

    void rotateContactsOwner();
  }, [
    contactsOwnerWriteCount,
    contactsOwnerWriteDelta,
    isSeedLogin,
    rotateContactsOwner,
    rotateContactsOwnerIsBusy,
  ]);

  React.useEffect(() => {
    if (!isSeedLogin) return;
    if (rotateCashuOwnerIsBusy) return;
    if (cashuOwnerWriteDelta < CASHU_OWNER_ROTATION_TRIGGER_WRITE_COUNT) {
      return;
    }

    const nowMs = Date.now();
    const cooldownRemainingMs = getCooldownRemainingMs(
      EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
      nowMs,
      OWNER_ROTATION_COOLDOWN_MS,
    );
    if (cooldownRemainingMs > 0) return;

    void rotateCashuOwner();
  }, [
    cashuOwnerWriteDelta,
    isSeedLogin,
    rotateCashuOwner,
    rotateCashuOwnerIsBusy,
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

  const contactsOwnerNewContactsCount = Math.max(0, contactsOwnerWriteCount);
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
    cashuOwnerIndex: resolvedCashuOwnerIndex,
    cashuOwnerPointer: `cashu-${resolvedCashuOwnerIndex}`,
    cashuSyncOwner: isSeedLogin ? (ownerSyncData?.cashuOwner ?? null) : null,
    cashuVisibleOwnerIds: isSeedLogin
      ? cashuVisibleOwnerIds
      : appOwnerId
        ? [appOwnerId]
        : [],
    contactsBackupOwnerId: isSeedLogin ? contactsBackupOwnerId : null,
    contactsOwnerEditCount,
    contactsOwnerEditsUntilRotation,
    contactsSyncOwner: isSeedLogin
      ? (ownerSyncData?.contactsOwner ?? null)
      : null,
    contactsOwnerId: isSeedLogin
      ? (ownerSyncData?.contactsOwner.id ?? null)
      : appOwnerId,
    contactsOwnerIndex: resolvedContactsOwnerIndex,
    contactsOwnerNewContactsCount,
    contactsOwnerPointer: `contacts-${resolvedContactsOwnerIndex}`,
    contactsVisibleOwnerIds: isSeedLogin
      ? contactsVisibleOwnerIds
      : appOwnerId
        ? [appOwnerId]
        : [],
    identityOwnerId: isSeedLogin
      ? (fixedOwnerSyncData?.identityOwner.id ?? null)
      : appOwnerId,
    identitySyncOwner: isSeedLogin
      ? (fixedOwnerSyncData?.identityOwner ?? null)
      : null,
    legacyIdentitiesOwnerId: isSeedLogin
      ? (fixedOwnerSyncData?.legacyIdentitiesOwner.id ?? null)
      : null,
    legacyIdentitiesSyncOwner: isSeedLogin
      ? (fixedOwnerSyncData?.legacyIdentitiesOwner ?? null)
      : null,
    legacyMessagesIdentityOwnerId: isSeedLogin
      ? (fixedOwnerSyncData?.legacyMessagesIdentityOwner.id ?? null)
      : null,
    legacyMessagesIdentitySyncOwner: isSeedLogin
      ? (fixedOwnerSyncData?.legacyMessagesIdentityOwner ?? null)
      : null,
    metaOwnerId: isSeedLogin
      ? (fixedOwnerSyncData?.metaOwner.id ?? null)
      : null,
    metaSyncOwner: isSeedLogin ? (fixedOwnerSyncData?.metaOwner ?? null) : null,
    messagesBackupOwnerId: isSeedLogin ? messagesBackupOwnerId : null,
    messagesOwnerId: isSeedLogin
      ? (ownerSyncData?.messagesOwner.id ?? null)
      : appOwnerId,
    messagesOwnerIndex: resolvedMessagesOwnerIndex,
    messagesOwnerPointer: `messages-${resolvedMessagesOwnerIndex}`,
    messagesOwnerEditsUntilRotation,
    messagesSyncOwner: isSeedLogin
      ? (ownerSyncData?.messagesOwner ?? null)
      : null,
    messagesVisibleOwnerIds: isSeedLogin
      ? messagesVisibleOwnerIds
      : appOwnerId
        ? [appOwnerId]
        : [],
    recordMessagesOwnerWrite,
    recordTransactionsOwnerWrite,
    recordContactsOwnerWrite,
    requestManualRotateCashuOwner,
    requestManualRotateContactsOwner,
    requestManualRotateMessagesOwner,
    requestManualRotateTransactionsOwner,
    rotateCashuOwnerIsBusy,
    rotateContactsOwnerIsBusy,
    rotateMessagesOwnerIsBusy,
    rotateTransactionsOwnerIsBusy,
    transactionsBackupOwnerId: isSeedLogin ? transactionsBackupOwnerId : null,
    transactionsOwnerEditsUntilRotation,
    transactionsOwnerId: isSeedLogin
      ? (ownerSyncData?.transactionsOwner.id ?? null)
      : appOwnerId,
    transactionsOwnerIndex: resolvedTransactionsOwnerIndex,
    transactionsOwnerPointer: `transactions-${resolvedTransactionsOwnerIndex}`,
    transactionsSyncOwner: isSeedLogin
      ? (ownerSyncData?.transactionsOwner ?? null)
      : null,
    transactionsVisibleOwnerIds: isSeedLogin
      ? transactionsVisibleOwnerIds
      : appOwnerId
        ? [appOwnerId]
        : [],
  };
};
