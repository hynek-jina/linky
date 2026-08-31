// ONE-TIME MIGRATION — DELETE ME EVENTUALLY
//
// Carries a device's legacy cashu localStorage state to the key formats
// @linky/linkshu reads through the localStorage KeyValueStore adapter (#307).
// Both sides store the same "next unused derivation slot" accounting, so
// counters and restore cursors copy verbatim — a key rename, never a
// recomputation. Where a linkshu key already exists the existing value wins:
// post-cutover writes are fresher, and a re-run after a partial first run
// must not overwrite what that first run already copied.
//
// Legacy pending topup/autoswap records, claimed stashes, and lock keys are
// deleted without conversion — accepted risk per the #298 spec. The legacy
// seen-mints arrays are only read (the mints UI still owns them); linkshu's
// per-mint seen keys are seeded from them plus the mints of stored token
// rows.
//
// Removal condition: delete this folder and its three marked call sites
// (useLinkshuComposition, useCashuWalletComposition,
// wipeLinkshuSeedBoundState) once production devices have all launched a
// post-cutover build; the done flags make later runs no-ops either way.

import { parseMintUrl } from "@linky/linkshu";
import { parseCashuToken } from "../../cashu";

const DONE_STORAGE_KEY = "linky.linkshu_storage_migration_v1";
const ROW_MINTS_DONE_STORAGE_KEY = "linky.linkshu_seen_mints_backfill_v1";

// Legacy writers (deleted in #300–#306): utils/cashuDeterministic.ts,
// app/lib/topupQuoteStorage.ts, app/lib/autoswapClaim.ts and
// useOwnerScopedStorage.ts in git history. Scoped keys were
// `<prefix>:<enc(mint)>:<enc(unit)>:<enc(keysetId)>` with the mint trimmed
// and stripped of trailing slashes before encodeURIComponent — the exact
// normalization linkshu's `parseMintUrl` applies, so segments carry over
// byte-for-byte.
const LEGACY_COUNTER_PREFIX = "linky.cashu.detCounter.v1:";
const LEGACY_RESTORE_CURSOR_PREFIX = "linky.cashu.restoreCursor.v1:";
const LEGACY_SEEN_MINTS_PREFIX = "linky.cashu.seenMints.v1.";
const LEGACY_DELETE_ONLY_PREFIXES = [
  "linky.cashu.detCounterLock.v1",
  "linky.local.pendingTopupQuote.v1",
  "linky.local.pendingAutoswapClaim.v1",
  "linky.topup.claimed.v1",
  "linky.autoswap.claimed.v1",
  "linky.topup.claimLock.v1",
];

// linkshu's own keys as stored by makeLocalStorageKeyValueStore: the
// adapter's "linky.linkshu.value." prefix plus the package-internal
// dot-joined key. Both sides encode segments with encodeURIComponent (which
// escapes ":" but not "."), so mapping a legacy key is replacing its ":"
// separators with ".".
const LINKSHU_COUNTER_PREFIX = "linky.linkshu.value.linkshu.detCounter.";
const LINKSHU_RESTORE_CURSOR_PREFIX =
  "linky.linkshu.value.linkshu.restoreCursor.";
const LINKSHU_SEEN_MINTS_PREFIX = "linky.linkshu.value.linkshu.seenMints.";

const snapshotStorageKeys = (): string[] => {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null) keys.push(key);
  }
  return keys;
};

const copyScopedValue = (
  legacyKey: string,
  legacyPrefix: string,
  linkshuPrefix: string,
): void => {
  const segments = legacyKey.slice(legacyPrefix.length).split(":");
  if (segments.length === 3) {
    const targetKey = linkshuPrefix + segments.join(".");
    const value = localStorage.getItem(legacyKey);
    if (value !== null && localStorage.getItem(targetKey) === null) {
      localStorage.setItem(targetKey, value);
    }
  }
  localStorage.removeItem(legacyKey);
};

const seedSeenMint = (candidate: string): void => {
  const mint = parseMintUrl(candidate);
  if (mint === null) return;
  const targetKey = LINKSHU_SEEN_MINTS_PREFIX + encodeURIComponent(mint);
  if (localStorage.getItem(targetKey) === null) {
    localStorage.setItem(targetKey, mint);
  }
};

const seedSeenMintsFromLegacyArray = (legacyKey: string): void => {
  const raw = localStorage.getItem(legacyKey);
  if (raw === null) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;
  for (const entry of parsed) {
    if (typeof entry === "string") seedSeenMint(entry);
  }
};

/**
 * Runs once per device, before the linkshu runtime exists, so linkshu never
 * reads a deterministic counter or restore cursor that still lives under a
 * legacy key.
 */
export const migrateLegacyCashuLocalState = (): void => {
  try {
    if (localStorage.getItem(DONE_STORAGE_KEY) === "1") return;
    for (const key of snapshotStorageKeys()) {
      if (key.startsWith(LEGACY_COUNTER_PREFIX)) {
        copyScopedValue(key, LEGACY_COUNTER_PREFIX, LINKSHU_COUNTER_PREFIX);
      } else if (key.startsWith(LEGACY_RESTORE_CURSOR_PREFIX)) {
        copyScopedValue(
          key,
          LEGACY_RESTORE_CURSOR_PREFIX,
          LINKSHU_RESTORE_CURSOR_PREFIX,
        );
      } else if (key.startsWith(LEGACY_SEEN_MINTS_PREFIX)) {
        seedSeenMintsFromLegacyArray(key);
      } else if (
        LEGACY_DELETE_ONLY_PREFIXES.some((prefix) => key.startsWith(prefix))
      ) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem(DONE_STORAGE_KEY, "1");
  } catch {
    // Storage unavailable: retry next launch — every step is idempotent and
    // existing linkshu values are never overwritten.
  }
};

interface TokenRowMintSource {
  readonly mint: string | null;
  readonly rawToken: string | null;
  readonly token: string | null;
}

/**
 * Seeds linkshu's seen-mint keys from the mints of stored token rows, once
 * the first non-empty row set arrives. Timing is not critical: linkshu's
 * `collectKnownMints` already unions stored-row mints in at every read; this
 * only makes them durable should the rows later be deleted.
 */
export const seedLinkshuSeenMintsFromTokenRows = (
  rows: ReadonlyArray<TokenRowMintSource>,
): void => {
  try {
    if (rows.length === 0) return;
    if (localStorage.getItem(ROW_MINTS_DONE_STORAGE_KEY) === "1") return;
    for (const row of rows) {
      const tokenText = row.rawToken ?? row.token ?? "";
      const candidate =
        row.mint ?? (tokenText ? parseCashuToken(tokenText)?.mint : null);
      if (typeof candidate === "string") seedSeenMint(candidate);
    }
    localStorage.setItem(ROW_MINTS_DONE_STORAGE_KEY, "1");
  } catch {
    // Storage unavailable: retry on the next rows change.
  }
};
