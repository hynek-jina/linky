import * as Evolu from "@evolu/common";

interface CashuOwnerLaneRow {
  readonly id?: unknown;
  readonly ownerId?: unknown;
}

/**
 * Read the persisted owner-lane id from an aggregated cashu token row.
 *
 * Cashu token reads aggregate multiple deterministic `cashu-n` owner lanes, so
 * each row carries the id of the lane it physically lives in. The runtime row
 * always has `ownerId`, but the shared row type does not declare it, so we read
 * it defensively instead of casting.
 */
export const readCashuRowOwnerId = (row: unknown): string => {
  if (typeof row !== "object" || row === null) return "";
  if (!("ownerId" in row)) return "";
  const ownerId = Reflect.get(row, "ownerId");
  if (typeof ownerId !== "string") return "";
  return ownerId.trim();
};

export const resolveCashuRowStoredOwnerLane = (
  row: unknown,
): Evolu.OwnerId | null => {
  const rowOwnerId = readCashuRowOwnerId(row);
  if (!rowOwnerId) return null;
  const parsed = Evolu.OwnerId.fromUnknown(rowOwnerId);
  return parsed.ok ? parsed.value : null;
};

/**
 * Resolve the branded {@link Evolu.OwnerId} a cashu token row belongs to.
 *
 * Evolu materializes rows keyed by `(ownerId, id)`, so a soft-delete/update
 * MUST target the lane that actually holds the row. Writing with the active
 * write lane when the row lives in an older lane silently no-ops (it touches a
 * phantom `(activeLane, id)` row and leaves the real row untouched), which is
 * how spent tokens survive a payment and block the next one.
 *
 * Returns the matching visible owner id, or `null` when the row's lane is not
 * among the visible owners (caller should fall back to its default behavior).
 */
export const resolveCashuRowOwnerLane = (
  row: unknown,
  visibleOwnerIds: readonly Evolu.OwnerId[],
): Evolu.OwnerId | null => {
  const storedOwnerId = resolveCashuRowStoredOwnerLane(row);
  if (!storedOwnerId) return null;
  const rowOwnerId = String(storedOwnerId);
  return (
    visibleOwnerIds.find((owner) => String(owner).trim() === rowOwnerId) ?? null
  );
};

export const resolveCashuTokenStoredOwnerLaneById = (
  rows: readonly CashuOwnerLaneRow[],
  id: unknown,
  fallbackOwnerId: Evolu.OwnerId | null,
): Evolu.OwnerId | null => {
  const idText = String(id ?? "").trim();
  if (!idText) return fallbackOwnerId;

  const row =
    rows.find((entry) => {
      return String(entry.id ?? "").trim() === idText;
    }) ?? null;

  return resolveCashuRowStoredOwnerLane(row) ?? fallbackOwnerId;
};
