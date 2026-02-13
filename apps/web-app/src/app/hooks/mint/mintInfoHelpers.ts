import type { MintId } from "../../../evolu";
import * as Evolu from "@evolu/common";
import {
  extractPpk,
  MAIN_MINT_URL,
  normalizeMintUrl,
} from "../../../utils/mint";
import type { LocalMintInfoRow } from "../../types/appTypes";

interface MintInfoRowLike {
  feesJson?: unknown;
  firstSeenAtSec?: unknown;
  id?: unknown;
  infoJson?: unknown;
  isDeleted?: unknown;
  lastSeenAtSec?: unknown;
  supportsMpp?: unknown;
  url?: unknown;
}

export const isMintDeletedRow = (row: MintInfoRowLike): boolean =>
  String(row.isDeleted ?? "") === String(Evolu.sqliteTrue);

const getLastSeenAtSec = (row: MintInfoRowLike): number =>
  Number(row.lastSeenAtSec ?? 0) || 0;

const hasJsonText = (value: unknown): boolean =>
  Boolean(String(value ?? "").trim().length);

const getMintRowScore = (row: MintInfoRowLike): number => {
  const hasInfo = hasJsonText(row.infoJson);
  const hasFees = hasJsonText(row.feesJson);
  return (hasInfo ? 2 : 0) + (hasFees ? 1 : 0) + getLastSeenAtSec(row);
};

const getCanonicalMintUrl = (row: MintInfoRowLike): string | null => {
  const raw = String(row.url ?? "");
  return normalizeMintUrl(raw);
};

export const getActiveMintInfoRows = (
  mintInfoAll: LocalMintInfoRow[],
): LocalMintInfoRow[] => {
  return [...mintInfoAll]
    .filter((row) => !isMintDeletedRow(row as MintInfoRowLike))
    .sort((a, b) => getLastSeenAtSec(b) - getLastSeenAtSec(a));
};

export const getMintInfoDedupedRows = (
  mintInfo: LocalMintInfoRow[],
  defaultMintUrl: string | null,
): Array<{ canonicalUrl: string; row: LocalMintInfoRow }> => {
  const bestByUrl = new Map<string, LocalMintInfoRow>();

  for (const row of mintInfo) {
    const key = getCanonicalMintUrl(row);
    if (!key) continue;

    const existing = bestByUrl.get(key);
    if (!existing) {
      bestByUrl.set(key, row);
      continue;
    }

    if (
      getMintRowScore(row as MintInfoRowLike) >
      getMintRowScore(existing as MintInfoRowLike)
    ) {
      bestByUrl.set(key, row);
    }
  }

  const main = normalizeMintUrl(defaultMintUrl ?? MAIN_MINT_URL);

  return Array.from(bestByUrl.entries())
    .sort((a, b) => {
      const aIsMain = main ? a[0] === main : false;
      const bIsMain = main ? b[0] === main : false;
      if (aIsMain !== bIsMain) return aIsMain ? -1 : 1;
      return getLastSeenAtSec(b[1]) - getLastSeenAtSec(a[1]);
    })
    .map(([canonicalUrl, row]) => ({ canonicalUrl, row }));
};

export const getMintInfoByUrlMap = (
  mintInfoAll: LocalMintInfoRow[],
): Map<string, LocalMintInfoRow> => {
  const map = new Map<string, LocalMintInfoRow>();

  for (const row of mintInfoAll) {
    const url = getCanonicalMintUrl(row);
    if (!url) continue;

    const existing = map.get(url);
    if (!existing) {
      map.set(url, row);
      continue;
    }

    const existingDeleted = isMintDeletedRow(existing as MintInfoRowLike);
    const rowDeleted = isMintDeletedRow(row as MintInfoRowLike);
    if (existingDeleted && !rowDeleted) {
      map.set(url, row);
    }
  }

  return map;
};

export const getEncounteredMintUrls = (
  cashuTokensAll: readonly Record<string, unknown>[],
): string[] => {
  const set = new Set<string>();

  for (const row of cashuTokensAll) {
    const state = String(row.state ?? "");
    if (state !== "accepted") continue;

    const mint = String(row.mint ?? "").trim();
    const normalized = normalizeMintUrl(mint);
    if (normalized) set.add(normalized);
  }

  return Array.from(set.values()).sort();
};

const toJson = (value: unknown): string | null => {
  try {
    const text = JSON.stringify(value);
    const trimmed = String(text ?? "").trim();
    if (
      !trimmed ||
      trimmed === "null" ||
      trimmed === "{}" ||
      trimmed === "[]"
    ) {
      return null;
    }

    return trimmed.slice(0, 1000);
  } catch {
    return null;
  }
};

export const parseMintInfoPayload = (
  info: unknown,
): {
  feesJson: string | null;
  infoJson: string | null;
  supportsMpp: string | null;
} => {
  const nuts =
    (info as { nuts?: unknown }).nuts ??
    (info as { NUTS?: unknown }).NUTS ??
    null;
  const nut15 = (() => {
    if (!nuts || typeof nuts !== "object") return null;
    const rec = nuts as Record<string, unknown>;
    return rec["15"] ?? rec["nut15"] ?? rec["NUT15"] ?? null;
  })();

  const feesRaw =
    (info as { fees?: unknown }).fees ??
    (info as { fee?: unknown }).fee ??
    null;
  const ppk = extractPpk(feesRaw) ?? extractPpk(info);
  const fees = ppk !== null ? { ppk, raw: feesRaw } : feesRaw;

  return {
    supportsMpp: nut15 ? "1" : null,
    feesJson: toJson(fees),
    infoJson: toJson(info),
  };
};

interface DuplicateRow extends MintInfoRowLike {
  id: MintId;
  url: string;
}

interface DuplicateGroup {
  key: string;
  rows: DuplicateRow[];
}

const getDuplicateGroups = (
  mintInfoAll: LocalMintInfoRow[],
): DuplicateGroup[] => {
  const active = mintInfoAll.filter(
    (row) => !isMintDeletedRow(row as MintInfoRowLike),
  );
  if (active.length < 2) return [];

  const grouped = new Map<string, DuplicateRow[]>();
  for (const row of active) {
    const key = getCanonicalMintUrl(row);
    const id = row.id;
    if (!key || !id) continue;
    const existing = grouped.get(key);
    const withTypes = {
      ...(row as MintInfoRowLike),
      id,
      url: String(row.url ?? ""),
    } as DuplicateRow;
    if (existing) existing.push(withTypes);
    else grouped.set(key, [withTypes]);
  }

  return Array.from(grouped.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, rows }));
};

const chooseBestDuplicateRow = (rows: DuplicateRow[]): DuplicateRow => {
  return [...rows].sort(
    (a, b) =>
      getMintRowScore(b as MintInfoRowLike) -
      getMintRowScore(a as MintInfoRowLike),
  )[0];
};

export const buildMintDedupeSignature = (
  mintInfoAll: LocalMintInfoRow[],
): string => {
  const groups = getDuplicateGroups(mintInfoAll);
  return groups
    .map(
      ({ key, rows }) =>
        `${key}:${rows
          .map((row) => String(row.id ?? ""))
          .sort()
          .join(",")}`,
    )
    .sort()
    .join("|");
};

export const dedupeMintInfoRows = (
  mintInfoAll: LocalMintInfoRow[],
): LocalMintInfoRow[] | null => {
  const groups = getDuplicateGroups(mintInfoAll);
  if (groups.length === 0) return null;

  const next = [...mintInfoAll];
  let didChange = false;

  const applyPatch = (patch: Partial<LocalMintInfoRow> & { id: MintId }) => {
    const id = String(patch.id ?? "");
    if (!id) return;

    const idx = next.findIndex((row) => String(row.id ?? "") === id);
    if (idx < 0) return;

    next[idx] = { ...next[idx], ...patch };
    didChange = true;
  };

  for (const { key, rows } of groups) {
    const best = chooseBestDuplicateRow(rows);

    const bestUrl = normalizeMintUrl(best.url);
    if (bestUrl && bestUrl !== key) {
      applyPatch({ id: best.id, url: key });
    }

    for (const row of rows) {
      if (String(row.id ?? "") === String(best.id ?? "")) continue;
      applyPatch({ id: row.id, isDeleted: Evolu.sqliteTrue });
    }
  }

  return didChange ? next : null;
};
