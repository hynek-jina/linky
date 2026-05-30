import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import React from "react";
import type {
  CashuTokenId,
  ContactId,
  EvoluHistoryMutationEntry,
} from "../../evolu";
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
import type { CashuTokenRowLike, ContactRowLike } from "../types/appTypes";

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
  metaOwner: Evolu.AppOwner;
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
  cashuOwnerIndex: number;
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

const readCashuTokenRowLike = (row: unknown): CashuTokenRowLike | null => {
  const id = readCashuTokenId(row);
  const token = readCashuTokenValue(row);
  if (!id || !token) return null;

  return {
    id,
    token,
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
};

const getCashuTokenSyncSignature = (token: CashuTokenRowLike): string =>
  JSON.stringify({
    amount: token.amount ?? null,
    error: token.error ?? null,
    mint: token.mint ?? null,
    rawToken: token.rawToken ?? null,
    state: token.state ?? null,
    token: token.token ?? null,
    unit: token.unit ?? null,
  });

const shouldPreferCashuToken = (
  candidate: CashuTokenRowLike,
  existing: CashuTokenRowLike | null | undefined,
): boolean => {
  if (!existing) return true;
  const candidateScore = scoreCashuToken(candidate);
  const existingScore = scoreCashuToken(existing);
  if (candidateScore !== existingScore) return candidateScore > existingScore;
  return (
    getCashuTokenSyncSignature(candidate) > getCashuTokenSyncSignature(existing)
  );
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

const buildCashuTokenUpsertPayload = (token: CashuTokenRowLike) => {
  const tokenId = String(token.id ?? "").trim();
  const tokenText = String(token.token ?? "").trim();
  if (!tokenId || !tokenText) return null;

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
    payload.amount = Math.trunc(token.amount) as typeof Evolu.PositiveInt.Type;
  }

  const state = String(token.state ?? "").trim();
  if (state) {
    payload.state = state as typeof Evolu.NonEmptyString100.Type;
  }

  const error = String(token.error ?? "").trim();
  if (error) {
    payload.error = error as typeof Evolu.NonEmptyString1000.Type;
  }

  return payload;
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
  const [metaMnemonic, identityMnemonic] = await Promise.all([
    deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "meta", 0),
    deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "identity", 0),
  ]);

  if (!metaMnemonic || !identityMnemonic) return null;

  const metaOwner = toAppOwnerFromMnemonic(metaMnemonic);
  const identityOwner = toAppOwnerFromMnemonic(identityMnemonic);

  if (!metaOwner || !identityOwner) return null;

  return {
    identityOwner,
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

const deriveContactsAndCashuOwnersFromSeed = async (
  slip39Seed: string,
  contactsOwnerIndex: number,
  cashuOwnerIndex: number,
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
    deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "cashu", cashuOwnerIndex),
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
        resolvedContactsOwnerIndex,
        resolvedCashuOwnerIndex,
        resolvedMessagesOwnerIndex,
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
    isSeedLogin,
    resolvedCashuOwnerIndex,
    resolvedContactsOwnerIndex,
    resolvedMessagesOwnerIndex,
    resolvedTransactionsOwnerIndex,
    slip39Seed,
  ]);

  // Heal-on-adopt: when the reconciler below adopts a higher index from
  // another device's rotation, this device's local lane (at the OLD lower
  // index) may still hold rows that the rotating device never saw. Without
  // healing, those rows stay orphaned in the old lane and disappear from
  // the active UI. Copy them forward by re-upserting (id-keyed, so Evolu's
  // last-write-wins keeps the latest version of any row also touched by
  // the rotator). Fire-and-forget — failures are non-fatal; subsequent
  // rotations re-attempt the copy by the same logic.
  const healAdoptedContactsRef = React.useRef<
    (args: { seed: string; fromIndex: number; toIndex: number }) => void
  >(() => {});
  const healAdoptedCashuRef = React.useRef<
    (args: { seed: string; fromIndex: number; toIndex: number }) => void
  >(() => {});
  const healAdoptedMessagesRef = React.useRef<
    (args: { seed: string; fromIndex: number; toIndex: number }) => void
  >(() => {});
  const healAdoptedTransactionsRef = React.useRef<
    (args: { seed: string; fromIndex: number; toIndex: number }) => void
  >(() => {});

  // Refresh the heal callbacks on every render so they close over the
  // latest row data + index state. Using refs (vs putting these in the
  // reconciler deps) keeps the reconciler effect from churning every time
  // a row syncs in.
  healAdoptedContactsRef.current = ({
    seed,
    fromIndex,
    toIndex,
  }: {
    seed: string;
    fromIndex: number;
    toIndex: number;
  }) => {
    if (fromIndex === toIndex) return;
    const normalizedSeed = String(seed ?? "").trim();
    if (!normalizedSeed) return;

    void (async () => {
      const fromDerived = await deriveContactsAndCashuOwnersFromSeed(
        normalizedSeed,
        fromIndex,
        fromIndex,
      );
      const toDerived = await deriveContactsAndCashuOwnersFromSeed(
        normalizedSeed,
        toIndex,
        toIndex,
      );
      if (!fromDerived || !toDerived) return;

      const fromContactsOwnerId = String(fromDerived.contactsOwner.id).trim();

      for (const row of allContactsRows) {
        if (readRowOwnerId(row) !== fromContactsOwnerId) continue;
        if (
          typeof row !== "object" ||
          row === null ||
          !("id" in row) ||
          typeof row.id !== "string"
        ) {
          continue;
        }
        const id = row.id.trim();
        if (!id) continue;
        const contact = row as ContactRowLike & { id: string };
        const name = String(contact.name ?? "").trim();
        const npub = String(contact.npub ?? "").trim();
        const lnAddress = String(contact.lnAddress ?? "").trim();
        const groupName = String(contact.groupName ?? "").trim();
        if (!name && !npub && !lnAddress && !groupName) continue;
        upsert(
          "contact",
          {
            id: id as ContactId,
            name: name ? (name as typeof Evolu.NonEmptyString1000.Type) : null,
            npub: npub ? (npub as typeof Evolu.NonEmptyString1000.Type) : null,
            lnAddress: lnAddress
              ? (lnAddress as typeof Evolu.NonEmptyString1000.Type)
              : null,
            groupName: groupName
              ? (groupName as typeof Evolu.NonEmptyString1000.Type)
              : null,
          },
          { ownerId: toDerived.contactsOwner.id },
        );
      }
    })();
  };

  healAdoptedCashuRef.current = ({
    seed,
    fromIndex,
    toIndex,
  }: {
    seed: string;
    fromIndex: number;
    toIndex: number;
  }) => {
    if (fromIndex === toIndex) return;
    const normalizedSeed = String(seed ?? "").trim();
    if (!normalizedSeed) return;

    void (async () => {
      const fromMnemonic = await deriveEvoluOwnerMnemonicFromSlip39(
        normalizedSeed,
        "cashu",
        fromIndex,
      );
      const toMnemonic = await deriveEvoluOwnerMnemonicFromSlip39(
        normalizedSeed,
        "cashu",
        toIndex,
      );
      if (!fromMnemonic || !toMnemonic) return;

      const fromOwner = toAppOwnerFromMnemonic(fromMnemonic);
      const toOwner = toAppOwnerFromMnemonic(toMnemonic);
      if (!fromOwner || !toOwner) return;

      const fromCashuOwnerId = String(fromOwner.id).trim();

      for (const row of allCashuTokensRows) {
        if (readRowOwnerId(row) !== fromCashuOwnerId) continue;
        const token = readCashuTokenRowLike(row);
        if (!token) continue;
        const payload = buildCashuTokenUpsertPayload(token);
        if (!payload) continue;
        upsert("cashuToken", payload, {
          ownerId: toOwner.id,
        });
      }
    })();
  };

  React.useEffect(() => {
    if (!isSeedLogin) return;
    if (cashuOwnerIndex === contactsOwnerIndex) return;

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!normalizedSeed) return;

    let cancelled = false;

    void (async () => {
      const [activeMnemonic, legacyMnemonic] = await Promise.all([
        deriveEvoluOwnerMnemonicFromSlip39(
          normalizedSeed,
          "cashu",
          cashuOwnerIndex,
        ),
        deriveEvoluOwnerMnemonicFromSlip39(
          normalizedSeed,
          "cashu",
          contactsOwnerIndex,
        ),
      ]);

      if (!activeMnemonic || !legacyMnemonic || cancelled) return;

      const activeOwner = toAppOwnerFromMnemonic(activeMnemonic);
      const legacyOwner = toAppOwnerFromMnemonic(legacyMnemonic);
      if (!activeOwner || !legacyOwner || cancelled) return;

      const activeOwnerId = String(activeOwner.id).trim();
      const legacyOwnerId = String(legacyOwner.id).trim();
      if (!activeOwnerId || !legacyOwnerId) return;

      const bestByToken = new Map<string, CashuTokenRowLike>();
      const activeByToken = new Map<string, CashuTokenRowLike>();
      const legacyByToken = new Map<string, CashuTokenRowLike>();

      for (const row of allCashuTokensRows) {
        const ownerId = readRowOwnerId(row);
        if (ownerId !== activeOwnerId && ownerId !== legacyOwnerId) continue;

        const token = readCashuTokenRowLike(row);
        if (!token) continue;

        const tokenKey = String(token.token ?? "").trim();
        if (!tokenKey) continue;

        if (ownerId === activeOwnerId) {
          const existingActive = activeByToken.get(tokenKey);
          if (shouldPreferCashuToken(token, existingActive)) {
            activeByToken.set(tokenKey, token);
          }
        }

        if (ownerId === legacyOwnerId) {
          const existingLegacy = legacyByToken.get(tokenKey);
          if (shouldPreferCashuToken(token, existingLegacy)) {
            legacyByToken.set(tokenKey, token);
          }
        }

        const existingBest = bestByToken.get(tokenKey);
        if (shouldPreferCashuToken(token, existingBest)) {
          bestByToken.set(tokenKey, token);
        }
      }

      for (const [tokenText, token] of bestByToken.entries()) {
        const payload = buildCashuTokenUpsertPayload(token);
        if (!payload) continue;

        const activeExisting = activeByToken.get(tokenText);
        if (
          !activeExisting ||
          getCashuTokenSyncSignature(activeExisting) !==
            getCashuTokenSyncSignature(token)
        ) {
          upsert("cashuToken", payload, { ownerId: activeOwner.id });
        }

        const legacyExisting = legacyByToken.get(tokenText);
        if (
          !legacyExisting ||
          getCashuTokenSyncSignature(legacyExisting) !==
            getCashuTokenSyncSignature(token)
        ) {
          upsert("cashuToken", payload, { ownerId: legacyOwner.id });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    allCashuTokensRows,
    cashuOwnerIndex,
    contactsOwnerIndex,
    isSeedLogin,
    slip39Seed,
    upsert,
  ]);

  healAdoptedMessagesRef.current = ({
    seed,
    fromIndex,
    toIndex,
  }: {
    seed: string;
    fromIndex: number;
    toIndex: number;
  }) => {
    if (fromIndex === toIndex) return;
    const normalizedSeed = String(seed ?? "").trim();
    if (!normalizedSeed) return;

    void (async () => {
      const fromMnemonic = await deriveEvoluOwnerMnemonicFromSlip39(
        normalizedSeed,
        "messages",
        fromIndex,
      );
      const toMnemonic = await deriveEvoluOwnerMnemonicFromSlip39(
        normalizedSeed,
        "messages",
        toIndex,
      );
      if (!fromMnemonic || !toMnemonic) return;
      const fromOwner = toAppOwnerFromMnemonic(fromMnemonic);
      const toOwner = toAppOwnerFromMnemonic(toMnemonic);
      if (!fromOwner || !toOwner) return;
      const fromOwnerId = String(fromOwner.id).trim();

      for (const row of allNostrMessagesRows) {
        if (readRowOwnerId(row) !== fromOwnerId) continue;
        if (
          typeof row !== "object" ||
          row === null ||
          !("id" in row) ||
          typeof row.id !== "string"
        ) {
          continue;
        }
        // Re-upsert the row payload into the new lane. We let Evolu
        // schema validation drop any fields that don't apply — but the
        // row already conformed when first written, so the payload is a
        // shape-preserving copy.
        const payload = { ...row } as Record<string, unknown>;
        delete payload.ownerId;
        upsert("nostrMessage", payload as never, {
          ownerId: toOwner.id,
        });
      }

      for (const row of allNostrReactionsRows) {
        if (readRowOwnerId(row) !== fromOwnerId) continue;
        if (
          typeof row !== "object" ||
          row === null ||
          !("id" in row) ||
          typeof row.id !== "string"
        ) {
          continue;
        }
        const payload = { ...row } as Record<string, unknown>;
        delete payload.ownerId;
        upsert("nostrReaction", payload as never, {
          ownerId: toOwner.id,
        });
      }
    })();
  };

  healAdoptedTransactionsRef.current = ({
    seed,
    fromIndex,
    toIndex,
  }: {
    seed: string;
    fromIndex: number;
    toIndex: number;
  }) => {
    if (fromIndex === toIndex) return;
    const normalizedSeed = String(seed ?? "").trim();
    if (!normalizedSeed) return;

    void (async () => {
      const fromMnemonic = await deriveEvoluOwnerMnemonicFromSlip39(
        normalizedSeed,
        "transactions",
        fromIndex,
      );
      const toMnemonic = await deriveEvoluOwnerMnemonicFromSlip39(
        normalizedSeed,
        "transactions",
        toIndex,
      );
      if (!fromMnemonic || !toMnemonic) return;
      const fromOwner = toAppOwnerFromMnemonic(fromMnemonic);
      const toOwner = toAppOwnerFromMnemonic(toMnemonic);
      if (!fromOwner || !toOwner) return;
      const fromOwnerId = String(fromOwner.id).trim();

      for (const row of allTransactionsRows) {
        if (readRowOwnerId(row) !== fromOwnerId) continue;
        if (
          typeof row !== "object" ||
          row === null ||
          !("id" in row) ||
          typeof row.id !== "string"
        ) {
          continue;
        }
        const payload = { ...row } as Record<string, unknown>;
        delete payload.ownerId;
        upsert("transaction", payload as never, {
          ownerId: toOwner.id,
        });
      }
    })();
  };

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

    const normalizedSeed = String(slip39Seed ?? "").trim();

    if (cashuSnap && cashuSnap.index !== cashuOwnerIndex) {
      const fromCashuIndex = cashuOwnerIndex;
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
      if (normalizedSeed) {
        healAdoptedCashuRef.current({
          seed: normalizedSeed,
          fromIndex: fromCashuIndex,
          toIndex: cashuSnap.index,
        });
      }
    }

    if (contactsSnap && contactsSnap.index !== contactsOwnerIndex) {
      const snap = contactsSnap;
      const fromContactsIndex = contactsOwnerIndex;
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
      if (normalizedSeed) {
        healAdoptedContactsRef.current({
          seed: normalizedSeed,
          fromIndex: fromContactsIndex,
          toIndex: contactsSnap.index,
        });
      }
    }

    if (messagesSnap && messagesSnap.index !== messagesOwnerIndex) {
      const fromMessagesIndex = messagesOwnerIndex;
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
      if (normalizedSeed) {
        healAdoptedMessagesRef.current({
          seed: normalizedSeed,
          fromIndex: fromMessagesIndex,
          toIndex: messagesSnap.index,
        });
      }
    }

    if (transactionsSnap && transactionsSnap.index !== transactionsOwnerIndex) {
      const fromTransactionsIndex = transactionsOwnerIndex;
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
      if (normalizedSeed) {
        healAdoptedTransactionsRef.current({
          seed: normalizedSeed,
          fromIndex: fromTransactionsIndex,
          toIndex: transactionsSnap.index,
        });
      }
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
    ): boolean => {
      if (snapshot) {
        return needsStructuredSnapshotUpgrade(snapshot, currentIndex);
      }
      return allowMissingOwnerMetaBootstrap && currentIndex > 0;
    };

    if (
      shouldWriteSnapshot(
        readSnapshotForScope("cashu"),
        resolvedCashuOwnerIndex,
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
      const currentDerived = await deriveOwnerSyncDataFromSeed(
        normalizedSeed,
        contactsOwnerIndex,
        cashuOwnerIndex,
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
        cashuOwnerIndex,
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
          archivedAtSec:
            typeof contact.archivedAtSec === "number" &&
            Number.isFinite(contact.archivedAtSec) &&
            contact.archivedAtSec > 0
              ? (contact.archivedAtSec as typeof Evolu.PositiveInt.Type)
              : contact.archivedAtSec
                ? (Number(
                    contact.archivedAtSec,
                  ) as typeof Evolu.PositiveInt.Type)
                : null,
        };

        const result = upsert("contact", payload, {
          ownerId: derived.contactsOwner.id,
        });
        if (result.ok) copiedCount += 1;
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
          baseline: copiedCount,
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
        copiedCount,
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

      if (nextIndex >= 2) {
        const pruneIndex = nextIndex - 2;
        const pruneOwners = await deriveContactsAndCashuOwnersFromSeed(
          normalizedSeed,
          pruneIndex,
          cashuOwnerIndex,
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
        }
      }

      setOwnerSyncData(derived);
      setContactsOwnerIndex(nextIndex);
      pushToast(`${t("evoluContactsOwnerRotated")} (${copiedCount})`);
    } finally {
      setRotateContactsOwnerIsBusy(false);
    }
  }, [
    cashuOwnerIndex,
    cashuOwnerWriteCount,
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
      const currentDerived = await deriveOwnerSyncDataFromSeed(
        normalizedSeed,
        contactsOwnerIndex,
        cashuOwnerIndex,
        messagesOwnerIndex,
        transactionsOwnerIndex,
      );
      if (!currentDerived) {
        pushToast(t("restoreFailed"));
        return;
      }

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

      const currentCashuOwnerId = String(
        currentDerived.cashuOwner.id ?? "",
      ).trim();
      const byCashuToken = new Map<string, CashuTokenRowLike>();
      if (currentCashuOwnerId) {
        for (const row of allCashuTokensRows) {
          if (readRowOwnerId(row) !== currentCashuOwnerId) continue;
          const token = readCashuTokenRowLike(row);
          if (!token) continue;

          const tokenKey = String(token.token ?? "").trim();
          if (!tokenKey) continue;

          const existing = byCashuToken.get(tokenKey);
          if (shouldPreferCashuToken(token, existing)) {
            byCashuToken.set(tokenKey, token);
          }
        }
      }

      let copiedCashuCount = 0;
      for (const token of byCashuToken.values()) {
        const payload = buildCashuTokenUpsertPayload(token);
        if (!payload) continue;

        const result = upsert("cashuToken", payload, {
          ownerId: derived.cashuOwner.id,
        });
        if (result.ok) copiedCashuCount += 1;
      }

      const cashuPointerResult = upsertOwnerMetaSnapshot(
        upsert,
        derived.metaOwner.id,
        "cashu",
        {
          index: nextIndex,
          baseline: copiedCashuCount,
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
      setCounterValue(
        EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY,
        nextIndex,
        copiedCashuCount,
      );
      setStoredTimestampMs(
        EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
        nowMs,
      );

      if (nextIndex >= 2) {
        const pruneIndex = nextIndex - 2;
        if (pruneIndex !== contactsOwnerIndex) {
          const pruneMnemonic = await deriveEvoluOwnerMnemonicFromSlip39(
            normalizedSeed,
            "cashu",
            pruneIndex,
          );
          const pruneOwner = pruneMnemonic
            ? toAppOwnerFromMnemonic(pruneMnemonic)
            : null;
          const pruneCashuOwnerId = String(pruneOwner?.id ?? "").trim();

          if (pruneOwner && pruneCashuOwnerId) {
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
                { ownerId: pruneOwner.id },
              );
            }
          }
        }
      }

      setOwnerSyncData(derived);
      setCashuOwnerIndex(nextIndex);
      pushToast(`${t("evoluCashuOwnerRotated")} (${copiedCashuCount})`);
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

      if (nextIndex >= 2) {
        const pruneIndex = nextIndex - 2;
        const pruneOwners = await deriveOwnerSyncDataFromSeed(
          normalizedSeed,
          contactsOwnerIndex,
          cashuOwnerIndex,
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

      if (nextIndex >= 2) {
        const pruneIndex = nextIndex - 2;
        const pruneOwners = await deriveOwnerSyncDataFromSeed(
          normalizedSeed,
          contactsOwnerIndex,
          cashuOwnerIndex,
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
    if (contactsOwnerWriteDelta < CONTACTS_OWNER_ROTATION_TRIGGER_WRITE_COUNT) {
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
    cashuOwnerIndex: resolvedCashuOwnerIndex,
    cashuOwnerPointer: `cashu-${resolvedCashuOwnerIndex}`,
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
    contactsOwnerIndex: resolvedContactsOwnerIndex,
    contactsOwnerNewContactsCount,
    contactsOwnerPointer: `contacts-${resolvedContactsOwnerIndex}`,
    identityOwnerId: isSeedLogin
      ? (fixedOwnerSyncData?.identityOwner.id ?? null)
      : appOwnerId,
    identitySyncOwner: isSeedLogin
      ? (fixedOwnerSyncData?.identityOwner ?? null)
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
  };
};
