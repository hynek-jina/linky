import * as Evolu from "@evolu/common";

export const readContactRowOwnerId = (row: unknown): string => {
  if (typeof row !== "object" || row === null) return "";
  if (!("ownerId" in row)) return "";
  const ownerId = Reflect.get(row, "ownerId");
  if (typeof ownerId !== "string") return "";
  return ownerId.trim();
};

export const resolveContactRowOwnerLane = (
  row: unknown,
  visibleOwnerIds: readonly Evolu.OwnerId[],
): Evolu.OwnerId | null => {
  const rowOwnerId = readContactRowOwnerId(row);
  if (!rowOwnerId) return null;
  return (
    visibleOwnerIds.find((ownerId) => String(ownerId) === rowOwnerId) ?? null
  );
};
