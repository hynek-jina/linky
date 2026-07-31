import type { CashuSendResult } from "../../../cashuSend";
import type { PaymentMintCandidate } from "../../lib/paymentMintSelection";

export interface CashuMessagePaymentSendBatch {
  amount: number;
  mint: string;
  token: string;
  unit: string | null;
}

export interface SelectedCashuMessagePayment {
  amountAttempts: number[];
  candidate: PaymentMintCandidate;
  candidates: PaymentMintCandidate[];
  kind: "selected";
  requestedAmountSat: number;
}

export interface InsufficientCashuMessagePayment {
  candidates: PaymentMintCandidate[];
  kind: "insufficient";
  requestedAmountSat: number;
}

export type CashuMessagePaymentSelection =
  | SelectedCashuMessagePayment
  | InsufficientCashuMessagePayment;

export type SuccessfulCashuSendResult = Extract<CashuSendResult, { ok: true }>;

export type FailedCashuSendResult = Extract<CashuSendResult, { ok: false }>;

export interface SuccessfulCashuMessagePaymentSwap {
  batch: CashuMessagePaymentSendBatch;
  gainedToken: string | null;
  kind: "success";
  result: SuccessfulCashuSendResult;
  usedInputTokens: string[];
}

export interface FailedCashuMessagePaymentSwap {
  error: string;
  kind: "failure";
  mint: string | null;
}

export interface RecoveryCashuMessagePaymentSwap {
  error: string;
  kind: "recovery";
  mint: string;
  recoveryAmount: number;
  recoveryToken: string;
  result: FailedCashuSendResult;
}

export type CashuMessagePaymentSwapOutcome =
  | SuccessfulCashuMessagePaymentSwap
  | FailedCashuMessagePaymentSwap
  | RecoveryCashuMessagePaymentSwap;

export type CashuMessagePaymentSwapCommit =
  | {
      kind: "success";
      result: SuccessfulCashuSendResult;
      selection: SelectedCashuMessagePayment;
    }
  | {
      kind: "recovery";
      result: FailedCashuSendResult;
      selection: SelectedCashuMessagePayment;
    };

export interface CashuMessagePaymentPublishError {
  clientId: string;
  error: string;
  token: string;
}

export interface CashuMessagePaymentPublishingOutcome {
  hasPendingMessages: boolean;
  paymentNoticeError: string | null;
  publishErrors: CashuMessagePaymentPublishError[];
  publishedTokenTexts: string[];
  unpublishedTokenTexts: string[];
}

export interface CashuMessagePaymentHookResult {
  error?: string;
  ok: boolean;
  queued: boolean;
}
