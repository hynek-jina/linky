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

export const shouldKeepTopupQuoteAfterClaimError = (
  error: unknown,
  isOutputsAlreadySignedError: (error: unknown) => boolean,
): boolean => {
  void error;
  void isOutputsAlreadySignedError;
  // mintTopupProofs already runs the deterministic restore loop on OAS.
  // If we land in the receive-effect catch with OAS, recovery has exhausted
  // every counter offset it knows about — retrying every 5s will keep
  // failing. The proofs were minted by some other path (autoswap, another
  // tab, another device); Evolu sync will bring the resulting token row.
  return false;
};
