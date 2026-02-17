import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import React from "react";
import type { ContactId } from "../../evolu";
import { evolu } from "../../evolu";
import {
  EVOLU_CONTACTS_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_EDIT_COUNT_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY,
} from "../../utils/constants";
import { deriveEvoluOwnerMnemonicFromSlip39 } from "../../utils/slip39Nostr";
import type { ContactRowLike } from "../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

type CounterMap = Record<string, number>;

interface OwnerSyncData {
  contactsOwner: Evolu.AppOwner;
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
  contactsBackupOwnerId: Evolu.OwnerId | null;
  contactsOwnerEditCount: number;
  contactsOwnerId: Evolu.OwnerId | null;
  contactsSyncOwner: Evolu.SyncOwner | null;
  contactsOwnerIndex: number;
  contactsOwnerNewContactsCount: number;
  contactsOwnerPointer: string;
  metaOwnerId: Evolu.OwnerId | null;
  metaSyncOwner: Evolu.SyncOwner | null;
  requestManualRotateContactsOwner: () => Promise<void>;
  rotateContactsOwnerIsBusy: boolean;
}

const META_POINTER_ROW_ID = Evolu.createIdFromString<"OwnerMeta">(
  "contacts-owner-active",
);

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

const getStoredIndex = (): number => {
  try {
    const raw = Number(
      localStorage.getItem(EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY),
    );
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return Math.trunc(raw);
  } catch {
    return 0;
  }
};

const setStoredIndex = (value: number): void => {
  try {
    localStorage.setItem(
      EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY,
      String(Math.max(0, Math.trunc(value))),
    );
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
): Promise<OwnerSyncData | null> => {
  const [metaMnemonic, contactsMnemonic] = await Promise.all([
    deriveEvoluOwnerMnemonicFromSlip39(slip39Seed, "meta", 0),
    deriveEvoluOwnerMnemonicFromSlip39(
      slip39Seed,
      "contacts",
      contactsOwnerIndex,
    ),
  ]);

  if (!metaMnemonic || !contactsMnemonic) return null;

  const metaOwner = toAppOwnerFromMnemonic(metaMnemonic);
  const contactsOwner = toAppOwnerFromMnemonic(contactsMnemonic);

  if (!metaOwner || !contactsOwner) return null;

  return {
    contactsOwner,
    metaOwner,
  };
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
    () => getStoredIndex(),
  );
  const [ownerSyncData, setOwnerSyncData] =
    React.useState<OwnerSyncData | null>(null);
  const [contactsBackupOwnerId, setContactsBackupOwnerId] =
    React.useState<Evolu.OwnerId | null>(null);
  const [rotateContactsOwnerIsBusy, setRotateContactsOwnerIsBusy] =
    React.useState(false);

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

  const contactsOwnerEditCount = React.useMemo(
    () =>
      getCounterValue(
        EVOLU_CONTACTS_OWNER_EDIT_COUNT_STORAGE_KEY,
        contactsOwnerIndex,
      ),
    [contactsOwnerIndex],
  );
  const contactsOwnerBaselineCount = React.useMemo(
    () =>
      getCounterValue(
        EVOLU_CONTACTS_OWNER_BASELINE_COUNT_STORAGE_KEY,
        contactsOwnerIndex,
      ),
    [contactsOwnerIndex],
  );

  React.useEffect(() => {
    if (!isSeedLogin) {
      setOwnerSyncData(null);
      setContactsBackupOwnerId(null);
      return;
    }

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!normalizedSeed) {
      setOwnerSyncData(null);
      setContactsBackupOwnerId(null);
      return;
    }

    let cancelled = false;
    void Promise.all([
      deriveOwnerSyncDataFromSeed(normalizedSeed, contactsOwnerIndex),
      contactsOwnerIndex > 0
        ? deriveOwnerSyncDataFromSeed(normalizedSeed, contactsOwnerIndex - 1)
        : Promise.resolve(null),
    ]).then(([derived, backup]) => {
      if (cancelled) return;
      setOwnerSyncData(derived);
      setContactsBackupOwnerId(backup?.contactsOwner.id ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [contactsOwnerIndex, isSeedLogin, slip39Seed]);

  React.useEffect(() => {
    if (!ownerSyncData) return;

    const metaOwnerId = String(ownerSyncData.metaOwner.id).trim();
    if (!metaOwnerId) return;

    let resolvedIndex: number | null = null;
    for (const row of ownerMetaRows) {
      if (readRowOwnerId(row) !== metaOwnerId) continue;
      const parsed = parseContactsOwnerIndexFromPointer(
        readRowPointerValue(row),
      );
      if (parsed === null) continue;
      resolvedIndex = parsed;
      break;
    }

    if (resolvedIndex === null) return;
    if (resolvedIndex === contactsOwnerIndex) return;

    setStoredIndex(resolvedIndex);
    setContactsOwnerIndex(resolvedIndex);
  }, [contactsOwnerIndex, ownerMetaRows, ownerSyncData]);

  const requestManualRotateContactsOwner = React.useCallback(async () => {
    if (rotateContactsOwnerIsBusy) return;

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!isSeedLogin || !normalizedSeed) {
      pushToast(t("seedMissing"));
      return;
    }

    setRotateContactsOwnerIsBusy(true);
    try {
      const nextIndex = contactsOwnerIndex + 1;
      const derived = await deriveOwnerSyncDataFromSeed(
        normalizedSeed,
        nextIndex,
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

      const pointerResult = upsert(
        "ownerMeta",
        {
          id: META_POINTER_ROW_ID,
          scope: "contacts" as typeof Evolu.NonEmptyString100.Type,
          value:
            `contacts-${nextIndex}` as typeof Evolu.NonEmptyString1000.Type,
        },
        { ownerId: derived.metaOwner.id },
      );

      if (!pointerResult.ok) {
        pushToast(
          `${t("errorPrefix")}: ${formatMutationError(pointerResult.error)}`,
        );
        return;
      }

      setStoredIndex(nextIndex);
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

      if (nextIndex >= 2) {
        const pruneIndex = nextIndex - 2;
        const pruneOwners = await deriveOwnerSyncDataFromSeed(
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
        }
      }

      setOwnerSyncData(derived);
      setContactsOwnerIndex(nextIndex);
      pushToast(`${t("evoluContactsOwnerRotated")} (${copiedCount})`);
    } finally {
      setRotateContactsOwnerIsBusy(false);
    }
  }, [
    contactsOwnerIndex,
    getContactsForRotation,
    isSeedLogin,
    allContactsRows,
    pushToast,
    rotateContactsOwnerIsBusy,
    slip39Seed,
    t,
    update,
    upsert,
  ]);

  const contactsOwnerNewContactsCount = Math.max(
    0,
    getContactsForRotation().length - contactsOwnerBaselineCount,
  );

  return {
    contactsBackupOwnerId: isSeedLogin ? contactsBackupOwnerId : null,
    contactsOwnerEditCount,
    contactsSyncOwner: isSeedLogin
      ? (ownerSyncData?.contactsOwner ?? null)
      : null,
    contactsOwnerId: isSeedLogin
      ? (ownerSyncData?.contactsOwner.id ?? null)
      : appOwnerId,
    contactsOwnerIndex,
    contactsOwnerNewContactsCount,
    contactsOwnerPointer: `contacts-${contactsOwnerIndex}`,
    metaOwnerId: isSeedLogin ? (ownerSyncData?.metaOwner.id ?? null) : null,
    metaSyncOwner: isSeedLogin ? (ownerSyncData?.metaOwner ?? null) : null,
    requestManualRotateContactsOwner,
    rotateContactsOwnerIsBusy,
  };
};
