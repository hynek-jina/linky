import type { CashuTokenRowLike } from "../types/appTypes";

interface CashuTokenIdentityLike {
  rawToken?: unknown;
  token?: unknown;
}

export const readCashuTokenAliases = (
  value: CashuTokenIdentityLike | null | undefined,
): string[] => {
  const aliases = new Set<string>();

  for (const candidate of [value?.rawToken, value?.token]) {
    const normalized = String(candidate ?? "").trim();
    if (!normalized) continue;
    aliases.add(normalized);
  }

  return Array.from(aliases);
};

export const hasMatchingCashuToken = (
  rows: readonly CashuTokenRowLike[],
  value: CashuTokenIdentityLike | null | undefined,
): boolean => {
  const aliases = new Set(readCashuTokenAliases(value));
  if (aliases.size === 0) return false;

  return rows.some((row) => {
    return readCashuTokenAliases(row).some((alias) => aliases.has(alias));
  });
};
