import * as Evolu from "@evolu/common";
import type { CashuTokenRow } from "../evolu";
import { createCashuTokenId } from "../app/lib/cashuTokenIdentity";

interface CashuTokenRowInput {
  amount?: number | null;
  createdAt?: string;
  error?: string | null;
  id?: string;
  isDeleted?: boolean;
  mint?: string | null;
  originalTokenText?: string | null;
  ownerId?: string;
  rawToken?: string | null;
  state?: string | null;
  token?: string;
  unit?: string | null;
  updatedAt?: string;
}

const nullableNonEmptyString = (
  value: string | null | undefined,
): typeof Evolu.NonEmptyString.Type | null =>
  value ? Evolu.NonEmptyString.orThrow(value) : null;

const nullableNonEmptyString100 = (
  value: string | null | undefined,
): typeof Evolu.NonEmptyString100.Type | null =>
  value ? Evolu.NonEmptyString100.orThrow(value) : null;

const nullableNonEmptyString1000 = (
  value: string | null | undefined,
): typeof Evolu.NonEmptyString1000.Type | null =>
  value ? Evolu.NonEmptyString1000.orThrow(value) : null;

export const createCashuTokenRowFixture = (
  input: CashuTokenRowInput = {},
): CashuTokenRow => {
  const token = input.token ?? "cashu-test-token";

  return {
    amount:
      input.amount === null || input.amount === undefined
        ? null
        : Evolu.PositiveInt.orThrow(input.amount),
    createdAt: Evolu.DateIso.orThrow(
      input.createdAt ?? "2026-01-01T00:00:00.000Z",
    ),
    error: nullableNonEmptyString1000(input.error),
    id: createCashuTokenId(input.id ?? token),
    isDeleted: input.isDeleted ? Evolu.sqliteTrue : null,
    mint: nullableNonEmptyString1000(input.mint),
    originalTokenText: nullableNonEmptyString(input.originalTokenText),
    ownerId: Evolu.OwnerId.orThrow(input.ownerId ?? "AAAAAAAAAAAAAAAAAAAAAA"),
    rawToken: nullableNonEmptyString(input.rawToken),
    state: nullableNonEmptyString100(input.state),
    token: Evolu.NonEmptyString.orThrow(token),
    unit: nullableNonEmptyString100(input.unit),
    updatedAt: Evolu.DateIso.orThrow(
      input.updatedAt ?? "2026-01-01T00:00:00.000Z",
    ),
  };
};
