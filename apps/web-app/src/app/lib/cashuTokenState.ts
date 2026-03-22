export const CASHU_TOKEN_STATE_ACCEPTED = "accepted";
export const CASHU_TOKEN_STATE_ERROR = "error";
export const CASHU_TOKEN_STATE_EXTERNALIZED = "externalized";
export const CASHU_TOKEN_STATE_PENDING = "pending";

export type CashuTokenState =
  | typeof CASHU_TOKEN_STATE_ACCEPTED
  | typeof CASHU_TOKEN_STATE_ERROR
  | typeof CASHU_TOKEN_STATE_EXTERNALIZED
  | typeof CASHU_TOKEN_STATE_PENDING;

export const normalizeCashuTokenState = (
  value: unknown,
): CashuTokenState | null => {
  const normalized = String(value ?? "").trim();

  if (
    normalized === CASHU_TOKEN_STATE_ACCEPTED ||
    normalized === CASHU_TOKEN_STATE_ERROR ||
    normalized === CASHU_TOKEN_STATE_EXTERNALIZED ||
    normalized === CASHU_TOKEN_STATE_PENDING
  ) {
    return normalized;
  }

  return null;
};

export const isCashuTokenAcceptedState = (value: unknown): boolean =>
  normalizeCashuTokenState(value) === CASHU_TOKEN_STATE_ACCEPTED;

export const isCashuTokenExternalizedState = (value: unknown): boolean =>
  normalizeCashuTokenState(value) === CASHU_TOKEN_STATE_EXTERNALIZED;
