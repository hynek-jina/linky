import * as Evolu from "@evolu/common";
import type { CashuTokenRow } from "../../evolu";

type CashuOwnerRow = Pick<CashuTokenRow, "ownerId">;

export const readCashuRowOwnerId = (row: CashuOwnerRow): string =>
  String(row.ownerId);

export const resolveCashuRowStoredOwnerLane = (
  row: CashuOwnerRow | null | undefined,
): Evolu.OwnerId | null => row?.ownerId ?? null;

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
  row: CashuOwnerRow,
  visibleOwnerIds: readonly Evolu.OwnerId[],
): Evolu.OwnerId | null => {
  return visibleOwnerIds.find((owner) => owner === row.ownerId) ?? null;
};
