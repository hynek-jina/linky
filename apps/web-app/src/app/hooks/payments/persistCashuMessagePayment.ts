import * as Evolu from "@evolu/common";
import type { ContactId } from "../../../evolu";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import { resolveCashuRowStoredOwnerLane } from "../../lib/cashuOwnerLane";
import {
  buildSparseCashuTokenPayload,
  createCashuTokenId,
  hasMatchingCashuToken,
} from "../../lib/cashuTokenIdentity";
import { isCashuTokenAcceptedState } from "../../lib/cashuTokenState";
import type {
  CashuTokenRowLike,
  LoggedPaymentEventParams,
} from "../../types/appTypes";
import type {
  CashuMessagePaymentPublishingOutcome,
  CashuMessagePaymentSwapCommit,
  SuccessfulCashuMessagePaymentSwap,
} from "./cashuMessagePaymentTypes";

const CashuTokenIdSchema = Evolu.id("CashuToken");

export type CashuTokenMutationResult =
  | { ok: true }
  | { error: unknown; ok: false };

export type CashuTokenUpsert = (
  table: "cashuToken",
  payload: ReturnType<typeof buildSparseCashuTokenPayload>,
  options?: { ownerId: Evolu.OwnerId },
) => CashuTokenMutationResult;

export type CashuTokenUpdate = (
  table: "cashuToken",
  payload: {
    id: typeof CashuTokenIdSchema.Type;
    isDeleted: typeof Evolu.sqliteTrue;
  },
  options?: { ownerId: Evolu.OwnerId },
) => CashuTokenMutationResult;

interface CashuPersistenceDependencies {
  cashuTokensAll: readonly CashuTokenRowLike[];
  cashuWriteOwnerId: Evolu.OwnerId | null;
  upsert: CashuTokenUpsert;
}

const insertCashuToken = (
  dependencies: CashuPersistenceDependencies,
  token: string,
  state: string,
) => {
  const payload = buildSparseCashuTokenPayload({
    id: createCashuTokenId(token),
    state,
    token,
  });
  if (hasMatchingCashuToken(dependencies.cashuTokensAll, payload)) {
    return { error: null, ok: true, skippedDuplicate: true };
  }

  const result = dependencies.cashuWriteOwnerId
    ? dependencies.upsert("cashuToken", payload, {
        ownerId: dependencies.cashuWriteOwnerId,
      })
    : dependencies.upsert("cashuToken", payload);

  return {
    error: result.ok ? null : getUnknownErrorMessage(result.error, "unknown"),
    ok: result.ok,
    skippedDuplicate: false,
  };
};

interface PersistCashuMessageSwapAttemptArgs extends CashuPersistenceDependencies {
  cashuTokensWithMeta: readonly CashuTokenRowLike[];
  outcome: CashuMessagePaymentSwapCommit;
  update: CashuTokenUpdate;
}

export const persistCashuMessageSwapAttempt = ({
  cashuTokensAll,
  cashuTokensWithMeta,
  cashuWriteOwnerId,
  outcome,
  update,
  upsert,
}: PersistCashuMessageSwapAttemptArgs): void => {
  const dependencies = {
    cashuTokensAll,
    cashuWriteOwnerId,
    upsert,
  };

  const deleteSpentTokens = () => {
    for (const row of cashuTokensWithMeta) {
      if (!isCashuTokenAcceptedState(row.state)) continue;
      if (String(row.mint ?? "").trim() !== outcome.selection.candidate.mint) {
        continue;
      }

      const tokenId = CashuTokenIdSchema.fromUnknown(row.id);
      if (!tokenId.ok) {
        throw new Error("Invalid Cashu token id");
      }
      const ownerId = resolveCashuRowStoredOwnerLane(row) ?? cashuWriteOwnerId;
      const result = ownerId
        ? update(
            "cashuToken",
            { id: tokenId.value, isDeleted: Evolu.sqliteTrue },
            { ownerId },
          )
        : update("cashuToken", {
            id: tokenId.value,
            isDeleted: Evolu.sqliteTrue,
          });
      if (!result.ok) throw result.error;
    }
  };

  if (outcome.kind === "recovery") {
    if (!outcome.result.remainingToken || outcome.result.remainingAmount <= 0) {
      throw new Error("Missing Cashu recovery token");
    }
    const inserted = insertCashuToken(
      dependencies,
      outcome.result.remainingToken,
      "accepted",
    );
    if (!inserted.ok) throw inserted.error ?? "unknown";
    deleteSpentTokens();
    return;
  }

  deleteSpentTokens();
  if (outcome.result.remainingToken && outcome.result.remainingAmount > 0) {
    const inserted = insertCashuToken(
      dependencies,
      outcome.result.remainingToken,
      "accepted",
    );
    if (!inserted.ok) throw inserted.error ?? "unknown";
  }
};

interface PersistCashuMessagePaymentResultArgs extends CashuPersistenceDependencies {
  contactId: ContactId;
  logCompletedOnly: boolean;
  logPaymentEvent: (event: LoggedPaymentEventParams) => void;
  paymentRequestId: string | null;
  publishing: CashuMessagePaymentPublishingOutcome;
  swap: SuccessfulCashuMessagePaymentSwap;
}

export const persistCashuMessagePaymentResult = ({
  cashuTokensAll,
  cashuWriteOwnerId,
  contactId,
  logCompletedOnly,
  logPaymentEvent,
  paymentRequestId,
  publishing,
  swap,
  upsert,
}: PersistCashuMessagePaymentResultArgs): void => {
  const dependencies = {
    cashuTokensAll,
    cashuWriteOwnerId,
    upsert,
  };

  for (const token of publishing.unpublishedTokenTexts) {
    insertCashuToken(dependencies, token, "pending");
  }

  if (logCompletedOnly && publishing.hasPendingMessages) return;

  logPaymentEvent({
    amount: swap.batch.amount,
    contactId,
    details: {
      ...(swap.gainedToken ? { gainedToken: swap.gainedToken } : {}),
      ...(paymentRequestId ? { requestId: paymentRequestId } : {}),
      usedInputTokens: swap.usedInputTokens,
    },
    direction: "out",
    error: null,
    fee: null,
    method: "cashu_chat",
    mint: swap.batch.mint,
    phase: publishing.hasPendingMessages ? "publish" : "complete",
    status: "ok",
    unit: "sat",
  });
};

interface LogCashuMessagePaymentFailureArgs {
  amountSat: number;
  contactId: ContactId;
  error: unknown;
  logCompletedOnly: boolean;
  logPaymentEvent: (event: LoggedPaymentEventParams) => void;
  mint: string | null;
  phase: "publish" | "swap";
}

const logCashuMessagePaymentFailure = ({
  amountSat,
  contactId,
  error,
  logCompletedOnly,
  logPaymentEvent,
  mint,
  phase,
}: LogCashuMessagePaymentFailureArgs): void => {
  if (logCompletedOnly) return;
  logPaymentEvent({
    amount: amountSat,
    contactId,
    direction: "out",
    error: getUnknownErrorMessage(error, "unknown"),
    fee: null,
    method: "cashu_chat",
    mint,
    phase,
    status: "error",
    unit: "sat",
  });
};

export const logCashuMessageSwapFailure = (
  args: Omit<LogCashuMessagePaymentFailureArgs, "phase">,
): void => {
  logCashuMessagePaymentFailure({ ...args, phase: "swap" });
};

export const logCashuMessagePublishFailure = (
  args: Omit<LogCashuMessagePaymentFailureArgs, "phase">,
): void => {
  logCashuMessagePaymentFailure({ ...args, phase: "publish" });
};
