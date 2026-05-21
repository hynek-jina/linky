// Cross-device propagation of owner-lane rotations. Each rotation writes
// one row to the synced `ownerMeta` table (one row per scope) so adopters
// can converge on the same (index, baseline, cashuBaseline, rotatedAtMs)
// snapshot.
//
// Historically the `value` column was a plain `"contacts-N"` string carrying
// only the index. Adopters then defaulted baseline / editCount / rotatedAt
// to zero, which made `delta = currentRowCount` after Evolu sync pulled in
// the migrated rows — large enough to fire the auto-rotation threshold a
// second time on the adopting device, cascading rotations across the fleet.
//
// The structured snapshot below fixes that. Legacy `"contacts-N"` values
// still parse (with the missing fields nulled), so old clients keep working
// while new clients reap the full benefit.

export type RotationScope = "contacts" | "messages" | "transactions";

export interface RotationSnapshot {
  /** New owner lane index (e.g. 3 → owner derivation path uses `<scope>-3`). */
  index: number;
  /**
   * Row count copied forward into the new lane at rotation time. Null when
   * decoding a legacy `"<scope>-N"` value that didn't carry baseline info;
   * callers must then fall back to a local snapshot.
   */
  baseline: number | null;
  /**
   * Contacts scope only: cashu rows copied forward in the same rotation
   * (contacts + cashu rotate together). Null on non-contacts scopes and on
   * legacy values.
   */
  cashuBaseline: number | null;
  /** Wall-clock timestamp the rotation completed. Null on legacy values. */
  rotatedAtMs: number | null;
}

const LEGACY_REGEX: Record<RotationScope, RegExp> = {
  contacts: /^contacts-(\d+)$/,
  messages: /^messages-(\d+)$/,
  transactions: /^transactions-(\d+)$/,
};

const sanitizeNonNegativeInt = (value: unknown): number | null => {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  const truncated = Math.trunc(value);
  if (truncated < 0) return null;
  return truncated;
};

const sanitizePositiveInt = (value: unknown): number | null => {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  const truncated = Math.trunc(value);
  if (truncated <= 0) return null;
  return truncated;
};

export const encodeRotationSnapshot = (snap: RotationSnapshot): string => {
  const payload: Record<string, number> = { index: snap.index };
  if (snap.baseline !== null) payload.baseline = snap.baseline;
  if (snap.cashuBaseline !== null) payload.cashuBaseline = snap.cashuBaseline;
  if (snap.rotatedAtMs !== null) payload.rotatedAtMs = snap.rotatedAtMs;
  return JSON.stringify(payload);
};

export const decodeRotationSnapshot = (
  value: unknown,
  scope: RotationScope,
): RotationSnapshot | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // New format: JSON object. Start-byte check keeps the parse off the hot
  // path for legacy values.
  if (trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    const index = sanitizeNonNegativeInt(obj.index);
    if (index === null) return null;
    return {
      index,
      baseline: sanitizeNonNegativeInt(obj.baseline),
      cashuBaseline:
        scope === "contacts" ? sanitizeNonNegativeInt(obj.cashuBaseline) : null,
      rotatedAtMs: sanitizePositiveInt(obj.rotatedAtMs),
    };
  }

  // Legacy format: `"<scope>-<index>"`.
  const match = LEGACY_REGEX[scope].exec(trimmed);
  if (!match) return null;
  const index = sanitizeNonNegativeInt(Number(match[1]));
  if (index === null) return null;
  return {
    index,
    baseline: null,
    cashuBaseline: null,
    rotatedAtMs: null,
  };
};
