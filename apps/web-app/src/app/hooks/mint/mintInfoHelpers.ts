import * as Evolu from "@evolu/common";
import type { CashuTokenRow } from "../../../evolu";
import {
  extractPpk,
  MAIN_MINT_URL,
  normalizeMintUrl,
} from "../../../utils/mint";
import { extractCashuTokenMeta } from "../../lib/tokenText";
import type {
  LocalMintInfoRow,
  MintUrlInput,
  OptionalText,
} from "../../types/appTypes";

interface MintInfoRowLike {
  feesJson?: LocalMintInfoRow["feesJson"];
  firstSeenAtSec?: LocalMintInfoRow["firstSeenAtSec"];
  id?: string | null;
  infoJson?: LocalMintInfoRow["infoJson"];
  isDeleted?: LocalMintInfoRow["isDeleted"];
  lastSeenAtSec?: LocalMintInfoRow["lastSeenAtSec"];
  supportsMpp?: LocalMintInfoRow["supportsMpp"];
  url?: OptionalText;
}

type MintInfoSearchPrimitive = boolean | number | string | null | undefined;

interface MintInfoSearchObject {
  [key: string]: MintInfoSearchValue;
}

type MintInfoSearchValue =
  | MintInfoSearchObject
  | MintInfoSearchPrimitive
  | MintInfoSearchValue[];

const MINT_INFO_ICON_KEYS = [
  "icon_url",
  "iconUrl",
  "icon",
  "logo",
  "image",
  "image_url",
  "imageUrl",
];

const isSearchableMintInfoValue = (
  value: unknown,
): value is MintInfoSearchObject | MintInfoSearchValue[] => {
  return typeof value === "object" && value !== null;
};

const findMintInfoIconValue = (
  value: unknown,
  seen: Set<MintInfoSearchObject | MintInfoSearchValue[]>,
): string | null => {
  if (!isSearchableMintInfoValue(value)) return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (!Array.isArray(value)) {
    for (const key of MINT_INFO_ICON_KEYS) {
      const rawValue = value[key];
      if (typeof rawValue !== "string") continue;
      const trimmed = rawValue.trim();
      if (trimmed) return trimmed;
    }
  }

  for (const inner of Object.values(value)) {
    const found = findMintInfoIconValue(inner, seen);
    if (found) return found;
  }

  return null;
};

export const isMintDeletedRow = (row: MintInfoRowLike): boolean =>
  String(row.isDeleted ?? "") === String(Evolu.sqliteTrue);

const getLastSeenAtSec = (row: MintInfoRowLike): number =>
  Number(row.lastSeenAtSec ?? 0) || 0;

const hasJsonText = (value: OptionalText): boolean =>
  Boolean(String(value ?? "").trim().length);

const compareMintRows = (
  left: MintInfoRowLike,
  right: MintInfoRowLike,
): number => {
  const recencyDifference = getLastSeenAtSec(left) - getLastSeenAtSec(right);
  if (recencyDifference !== 0) return recencyDifference;

  const infoDifference =
    Number(hasJsonText(left.infoJson)) - Number(hasJsonText(right.infoJson));
  if (infoDifference !== 0) return infoDifference;

  return (
    Number(hasJsonText(left.feesJson)) - Number(hasJsonText(right.feesJson))
  );
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

    if (compareMintRows(row, existing) > 0) {
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
  cashuTokensAll: readonly CashuTokenRow[],
): string[] => {
  const set = new Set<string>();

  for (const row of cashuTokensAll) {
    const state = String(row.state ?? "");
    if (state !== "accepted") continue;

    const mint = extractCashuTokenMeta(row).mint;
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

export const getMintInfoIconUrl = (
  mintUrl: MintUrlInput,
  infoJson: OptionalText,
): string | null => {
  const infoText = String(infoJson ?? "").trim();
  if (!infoText) return null;

  const normalizedMintUrl = normalizeMintUrl(mintUrl);
  if (!normalizedMintUrl) return null;

  let info: unknown;
  try {
    info = JSON.parse(infoText);
  } catch {
    return null;
  }

  const rawIcon = findMintInfoIconValue(info, new Set());
  if (!rawIcon) return null;

  try {
    return new URL(rawIcon, normalizedMintUrl).toString();
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// Fees are not part of NUT-06 info; the only published fee is the active
// keyset's input_fee_ppk from /v1/keysets.
export const extractActiveKeysetPpk = (
  keysetsPayload: unknown,
  unit = "sat",
): number | null => {
  if (!isRecord(keysetsPayload)) return null;
  const list = keysetsPayload.keysets;
  if (!Array.isArray(list)) return null;
  const fees = list
    .filter(isRecord)
    .filter((keyset) => keyset.active === true && keyset.unit === unit)
    .map((keyset) => keyset.input_fee_ppk ?? 0)
    .filter(
      (fee): fee is number =>
        typeof fee === "number" && Number.isInteger(fee) && fee >= 0,
    );
  return fees.length ? Math.min(...fees) : null;
};

export const parseMintInfoPayload = (
  info: unknown,
  keysetsPayload?: unknown,
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
  const ppk =
    extractActiveKeysetPpk(keysetsPayload) ??
    extractPpk(feesRaw as Parameters<typeof extractPpk>[0]) ??
    extractPpk(info as Parameters<typeof extractPpk>[0]);
  const fees = ppk !== null ? { ppk, raw: feesRaw } : feesRaw;

  return {
    supportsMpp: nut15 ? "1" : null,
    feesJson: toJson(fees),
    infoJson: toJson(info),
  };
};

interface DuplicateRow extends MintInfoRowLike {
  id: string;
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
  return [...rows].sort((a, b) => compareMintRows(b, a))[0];
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

  const applyPatch = (patch: Partial<LocalMintInfoRow> & { id: string }) => {
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

export const getMintFeePpk = (feesJson: OptionalText): number | null => {
  const text = String(feesJson ?? "").trim();
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return null;
    const ppk = parsed.ppk;
    return typeof ppk === "number" && Number.isFinite(ppk) ? ppk : null;
  } catch {
    return null;
  }
};
