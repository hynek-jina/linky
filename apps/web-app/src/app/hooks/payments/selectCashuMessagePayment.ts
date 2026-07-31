import { isCashuTokenAcceptedState } from "../../lib/cashuTokenState";
import type { CashuTokenWithMeta } from "../../lib/tokenText";
import { getPaymentAmountReserveCap } from "../../lib/paymentAmountFallback";
import {
  selectSingleMintCandidateForAmount,
  type PaymentMintCandidate,
} from "../../lib/paymentMintSelection";
import type { CashuMessagePaymentSelection } from "./cashuMessagePaymentTypes";
import { buildCashuSendAmountAttempts } from "./buildCashuMessagePaymentPayload";

interface SelectCashuMessagePaymentArgs {
  amountSat: number;
  buildCandidates: (
    mintGroups: Map<string, { sum: number; tokens: string[] }>,
    preferredMint: string,
  ) => PaymentMintCandidate[];
  cashuBalance: number;
  defaultMintUrl: string | null;
  normalizeMintUrl: (mint: string) => string;
  tokens: readonly CashuTokenWithMeta[];
}

export const selectCashuMessagePayment = ({
  amountSat,
  buildCandidates,
  cashuBalance,
  defaultMintUrl,
  normalizeMintUrl,
  tokens,
}: SelectCashuMessagePaymentArgs): CashuMessagePaymentSelection => {
  const requestedAmountSat = Math.min(cashuBalance, amountSat);
  const mintGroups = new Map<string, { sum: number; tokens: string[] }>();

  for (const row of tokens) {
    if (!isCashuTokenAcceptedState(row.state)) continue;
    const mint = String(row.mint ?? "").trim();
    if (!mint) continue;
    const tokenText = String(row.token ?? row.rawToken ?? "").trim();
    if (!tokenText) continue;

    const group = mintGroups.get(mint) ?? { sum: 0, tokens: [] };
    group.tokens.push(tokenText);
    group.sum += Number(row.amount ?? 0) || 0;
    mintGroups.set(mint, group);
  }

  const preferredMint = normalizeMintUrl(defaultMintUrl ?? "");
  const candidates = buildCandidates(mintGroups, preferredMint);
  const candidate = selectSingleMintCandidateForAmount(
    candidates,
    requestedAmountSat,
  );

  if (requestedAmountSat <= 0 || !candidate) {
    return { candidates, kind: "insufficient", requestedAmountSat };
  }

  const maxReservedFeeSat = getPaymentAmountReserveCap(
    requestedAmountSat,
    candidate.sum,
  );

  return {
    amountAttempts: buildCashuSendAmountAttempts({
      availableAmountSat: candidate.sum,
      maxReservedFeeSat,
      requestedAmountSat,
      reservedFeeSat: 0,
    }),
    candidate,
    candidates,
    kind: "selected",
    requestedAmountSat,
  };
};
