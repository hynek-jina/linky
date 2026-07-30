import * as Evolu from "@evolu/common";
import type { CashuTokenId } from "../../evolu";
import type { CashuTokenRowLike } from "../types/appTypes";

export const createCashuTokenId = (token: string): CashuTokenId =>
  Evolu.createIdFromString<"CashuToken">(token.trim());

interface SparseCashuTokenPayloadArgs {
  error?: string | null;
  id: CashuTokenId;
  state: string;
  token: string;
}

export const buildSparseCashuTokenPayload = (
  args: SparseCashuTokenPayloadArgs,
) => {
  const token = Evolu.NonEmptyString.fromUnknown(args.token);
  const state = Evolu.NonEmptyString100.fromUnknown(args.state);
  if (!token.ok || !state.ok) {
    throw new Error("Invalid Cashu token payload");
  }

  const errorText = String(args.error ?? "")
    .trim()
    .slice(0, 1000);
  if (!errorText) {
    return {
      id: args.id,
      token: token.value,
      state: state.value,
    };
  }

  const error = Evolu.NonEmptyString1000.fromUnknown(errorText);
  if (!error.ok) {
    throw new Error("Invalid Cashu token error");
  }

  return {
    id: args.id,
    token: token.value,
    state: state.value,
    error: error.value,
  };
};

interface CashuTokenIdentityLike {
  id?: unknown;
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

export const isDeletedCashuRow = (row: CashuTokenRowLike): boolean => {
  const normalized = String(row.isDeleted ?? "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true";
};

export const hasMatchingCashuToken = (
  rows: readonly CashuTokenRowLike[],
  value: CashuTokenIdentityLike | null | undefined,
): boolean => {
  const aliases = new Set(readCashuTokenAliases(value));
  if (aliases.size === 0) return false;
  const candidateIds = new Set(
    Array.from(aliases, (alias) => String(createCashuTokenId(alias))),
  );

  return rows.some((row) => {
    if (candidateIds.has(String(row.id ?? "").trim())) return true;
    if (isDeletedCashuRow(row)) return false;
    return readCashuTokenAliases(row).some((alias) => aliases.has(alias));
  });
};
