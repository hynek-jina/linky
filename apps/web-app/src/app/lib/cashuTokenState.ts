export const CASHU_TOKEN_STATE_ACCEPTED = "accepted";
export const CASHU_TOKEN_STATE_ERROR = "error";
export const CASHU_TOKEN_STATE_EXTERNALIZED = "externalized";
export const CASHU_TOKEN_STATE_ISSUED = "issued";
export const CASHU_TOKEN_STATE_PENDING = "pending";
export const CASHU_TOKEN_STATE_RESERVED = "reserved";

export type CashuTokenState =
  | typeof CASHU_TOKEN_STATE_ACCEPTED
  | typeof CASHU_TOKEN_STATE_ERROR
  | typeof CASHU_TOKEN_STATE_EXTERNALIZED
  | typeof CASHU_TOKEN_STATE_ISSUED
  | typeof CASHU_TOKEN_STATE_PENDING
  | typeof CASHU_TOKEN_STATE_RESERVED;

export const normalizeCashuTokenState = (
  value: unknown,
): CashuTokenState | null => {
  const normalized = String(value ?? "").trim();

  if (
    normalized === CASHU_TOKEN_STATE_ACCEPTED ||
    normalized === CASHU_TOKEN_STATE_ERROR ||
    normalized === CASHU_TOKEN_STATE_EXTERNALIZED ||
    normalized === CASHU_TOKEN_STATE_ISSUED ||
    normalized === CASHU_TOKEN_STATE_PENDING ||
    normalized === CASHU_TOKEN_STATE_RESERVED
  ) {
    return normalized;
  }

  return null;
};

export const isCashuTokenAcceptedState = (value: unknown): boolean =>
  normalizeCashuTokenState(value) === CASHU_TOKEN_STATE_ACCEPTED;

export const isCashuTokenExternalizedState = (value: unknown): boolean =>
  normalizeCashuTokenState(value) === CASHU_TOKEN_STATE_EXTERNALIZED;

export const isCashuTokenIssuedState = (value: unknown): boolean =>
  normalizeCashuTokenState(value) === CASHU_TOKEN_STATE_ISSUED;

export const isCashuTokenReservedState = (value: unknown): boolean =>
  normalizeCashuTokenState(value) === CASHU_TOKEN_STATE_RESERVED;

export const isCashuTokenEmittedState = (value: unknown): boolean => {
  const state = normalizeCashuTokenState(value);
  return (
    state === CASHU_TOKEN_STATE_EXTERNALIZED ||
    state === CASHU_TOKEN_STATE_ISSUED ||
    state === CASHU_TOKEN_STATE_PENDING
  );
};

export const isCashuTokenUnavailableState = (value: unknown): boolean =>
  isCashuTokenEmittedState(value) || isCashuTokenReservedState(value);
