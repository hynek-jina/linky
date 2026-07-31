const isUnknownRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === "object";
};

export const isTopupMintQuoteClaimableState = (
  quoteState: string,
  mintQuoteStates: unknown,
): boolean => {
  const normalizedState = String(quoteState ?? "")
    .trim()
    .toUpperCase();
  if (!normalizedState) return false;

  const states = isUnknownRecord(mintQuoteStates) ? mintQuoteStates : null;
  const paidState = String(states?.PAID ?? "")
    .trim()
    .toUpperCase();
  const issuedState = String(states?.ISSUED ?? "")
    .trim()
    .toUpperCase();

  return (
    normalizedState === "PAID" ||
    normalizedState === "ISSUED" ||
    normalizedState === paidState ||
    normalizedState === issuedState
  );
};
