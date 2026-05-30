import type { EvoluHistoryMutationEntry } from "../../evolu";

interface CountOwnerHistoryWritesParams {
  entries: readonly EvoluHistoryMutationEntry[];
  fallbackCount: number;
  ownerId: string;
  rotatedAtMs: number | null;
  tables: readonly string[];
}

const normalizeText = (value: string): string => String(value ?? "").trim();

const normalizeOwnerId = (value: string): string => {
  const raw = normalizeText(value);
  if (!raw) return "";

  const replaced = raw.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = replaced.length % 4;
  if (remainder === 0) return replaced;
  if (remainder === 1) return replaced;
  return replaced.padEnd(replaced.length + (4 - remainder), "=");
};

export const countOwnerHistoryWrites = ({
  entries,
  fallbackCount,
  ownerId,
  rotatedAtMs,
  tables,
}: CountOwnerHistoryWritesParams): number => {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  const normalizedTables = new Set(
    tables.map((table) => normalizeText(table)).filter(Boolean),
  );

  if (!normalizedOwnerId || normalizedTables.size === 0) return 0;
  if (rotatedAtMs === null) return Math.max(0, Math.trunc(fallbackCount));

  const seenMutations = new Set<string>();
  for (const entry of entries) {
    const entryOwnerId = normalizeOwnerId(entry.ownerId);
    if (entryOwnerId !== normalizedOwnerId) continue;

    const tableName = normalizeText(entry.table);
    if (!normalizedTables.has(tableName)) continue;

    const timestampMs = entry.timestampMs;
    if (timestampMs === null || timestampMs <= rotatedAtMs) continue;

    const rowId = normalizeText(entry.id);
    const timestampKey = normalizeText(entry.timestampKey);
    if (!rowId || !timestampKey) continue;

    seenMutations.add(`${entryOwnerId}|${tableName}|${rowId}|${timestampKey}`);
  }

  return seenMutations.size;
};
