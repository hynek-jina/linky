import * as Evolu from "@evolu/common";

export const ACTIVE_NOSTR_IDENTITY_ROW_ID =
  Evolu.createIdFromString<"NostrIdentity">("active-nostr-identity");

export interface SyncedNostrIdentity {
  nsec: string;
  npub: string | null;
  ownerId: string;
  source: "custom" | "derived";
  switchedAtSec: number | null;
}

export interface SyncedNostrIdentityResolution {
  identity: SyncedNostrIdentity | null;
  shouldMigrateLegacyIdentity: boolean;
}

const readText = (row: object, key: string): string => {
  const value = Reflect.get(row, key);
  return typeof value === "string" ? value.trim() : "";
};

const readSwitchedAtSec = (row: object): number | null => {
  const value = Number(Reflect.get(row, "switchedAtSec"));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
};

const parseSyncedNostrIdentity = (row: object): SyncedNostrIdentity | null => {
  if (readText(row, "id") !== ACTIVE_NOSTR_IDENTITY_ROW_ID) return null;

  const nsec = readText(row, "nsec");
  const ownerId = readText(row, "ownerId");
  if (!nsec || !ownerId) return null;

  return {
    nsec,
    npub: readText(row, "npub") || null,
    ownerId,
    source: readText(row, "source") === "custom" ? "custom" : "derived",
    switchedAtSec: readSwitchedAtSec(row),
  };
};

export const resolveSyncedNostrIdentity = (
  rows: ReadonlyArray<object>,
  identityOwnerId: string,
  legacyMessagesOwnerIds: ReadonlySet<string>,
): SyncedNostrIdentityResolution => {
  if (!identityOwnerId) {
    return { identity: null, shouldMigrateLegacyIdentity: false };
  }

  const identities = rows
    .map(parseSyncedNostrIdentity)
    .filter((identity) => identity !== null);
  const identity = identities.find((row) => row.ownerId === identityOwnerId);
  if (identity) {
    return { identity, shouldMigrateLegacyIdentity: false };
  }

  const legacyIdentity = identities.find((row) =>
    legacyMessagesOwnerIds.has(row.ownerId),
  );
  return {
    identity: legacyIdentity ?? null,
    shouldMigrateLegacyIdentity: Boolean(legacyIdentity),
  };
};
