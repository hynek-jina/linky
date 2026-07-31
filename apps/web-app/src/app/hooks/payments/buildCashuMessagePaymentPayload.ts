import type { CashuSendResult } from "../../../cashuSend";
import { previewTokenText } from "../../../utils/formatting";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import {
  buildPaymentAmountAttempts,
  isRetryablePaymentAmountFailure,
} from "../../lib/paymentAmountFallback";
import type { PaymentLogData } from "../../types/appTypes";
import type {
  CashuMessagePaymentSwapCommit,
  CashuMessagePaymentSwapOutcome,
  SelectedCashuMessagePayment,
} from "./cashuMessagePaymentTypes";

export const buildCashuSendAmountAttempts = (args: {
  availableAmountSat: number;
  maxReservedFeeSat: number;
  requestedAmountSat: number;
  reservedFeeSat: number;
}): number[] => {
  const {
    availableAmountSat,
    maxReservedFeeSat,
    requestedAmountSat,
    reservedFeeSat,
  } = args;

  return buildPaymentAmountAttempts(
    requestedAmountSat,
    availableAmountSat,
  ).filter((attemptAmountSat) => {
    return (
      reservedFeeSat + (requestedAmountSat - attemptAmountSat) <=
      maxReservedFeeSat
    );
  });
};

interface BuildCashuMessagePaymentPayloadArgs {
  commitSwapState: (outcome: CashuMessagePaymentSwapCommit) => Promise<void>;
  createSendToken: (args: {
    amount: number;
    mint: string;
    tokens: string[];
    unit: string;
  }) => Promise<CashuSendResult>;
  logPayStep: (step: string, data?: PaymentLogData) => void;
  selection: SelectedCashuMessagePayment;
}

export const buildCashuMessagePaymentPayload = async ({
  commitSwapState,
  createSendToken,
  logPayStep,
  selection,
}: BuildCashuMessagePaymentPayloadArgs): Promise<CashuMessagePaymentSwapOutcome> => {
  let lastError = "insufficient funds";

  for (
    let attemptIndex = 0;
    attemptIndex < selection.amountAttempts.length;
    attemptIndex += 1
  ) {
    const attemptAmountSat = selection.amountAttempts[attemptIndex];
    const hasLowerAmountFallback =
      attemptIndex < selection.amountAttempts.length - 1;

    try {
      logPayStep("swap-request", {
        amount: attemptAmountSat,
        mint: selection.candidate.mint,
        requestedAmountSat: selection.requestedAmountSat,
        reservedFeeSat: 0,
        tokenCount: selection.candidate.tokens.length,
      });
      const result = await createSendToken({
        amount: attemptAmountSat,
        mint: selection.candidate.mint,
        tokens: selection.candidate.tokens,
        unit: "sat",
      });

      if (!result.ok) {
        lastError = result.error;
        if (result.remainingToken && result.remainingAmount > 0) {
          try {
            await commitSwapState({
              kind: "recovery",
              result,
              selection,
            });
          } catch (error) {
            return {
              error: getUnknownErrorMessage(error, "unknown"),
              kind: "failure",
              mint: selection.candidate.mint,
            };
          }

          logPayStep("swap-recovery", {
            error: result.error,
            mint: result.mint,
            recoveryAmount: result.remainingAmount,
            recoveryToken: previewTokenText(result.remainingToken),
            requestedAmountSat: selection.requestedAmountSat,
          });
          return {
            error: result.error,
            kind: "recovery",
            mint: result.mint,
            recoveryAmount: result.remainingAmount,
            recoveryToken: result.remainingToken,
            result,
          };
        }

        if (
          hasLowerAmountFallback &&
          isRetryablePaymentAmountFailure(result.error)
        ) {
          continue;
        }
        break;
      }

      try {
        await commitSwapState({ kind: "success", result, selection });
      } catch (error) {
        lastError = getUnknownErrorMessage(error, "unknown");
        break;
      }

      logPayStep("swap-ok", {
        mint: result.mint,
        remainingAmount: result.remainingAmount,
        remainingToken: previewTokenText(result.remainingToken),
        requestedAmountSat: selection.requestedAmountSat,
        reservedFeeDeltaSat: selection.requestedAmountSat - result.sendAmount,
        sendAmount: result.sendAmount,
        sendToken: previewTokenText(result.sendToken),
      });
      return {
        batch: {
          amount: result.sendAmount,
          mint: result.mint,
          token: result.sendToken,
          unit: result.unit ?? null,
        },
        gainedToken:
          result.remainingToken && result.remainingAmount > 0
            ? result.remainingToken
            : null,
        kind: "success",
        result,
        usedInputTokens: [...selection.candidate.tokens],
      };
    } catch (error) {
      lastError = getUnknownErrorMessage(error, "unknown");
      if (
        hasLowerAmountFallback &&
        isRetryablePaymentAmountFailure(lastError)
      ) {
        continue;
      }
      break;
    }
  }

  return {
    error: lastError,
    kind: "failure",
    mint: selection.candidate.mint,
  };
};
