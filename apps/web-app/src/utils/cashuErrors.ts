import { getUnknownErrorMessage } from "./unknown";

const getMintErrorCode = (error: unknown): number | null => {
  if (error && typeof error === "object" && "code" in error) {
    const raw = (error as { code?: unknown }).code;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
};

export const isCashuOutputsAlreadySignedError = (error: unknown): boolean => {
  if (getMintErrorCode(error) === 11005) return true;
  const message = getUnknownErrorMessage(error, "").toLowerCase();
  return (
    message.includes("outputs have already been signed") ||
    message.includes("outputs already signed") ||
    message.includes("already been signed before") ||
    message.includes("keyset id already signed")
  );
};

// NUT-04 / NUT-05 error code 11004 ("outputs are pending"). Surfaces when
// the mint's `promises` table contains a row with `c_ IS NULL` matching one
// of the wallet's submitted B_'s. In nutshell <= 0.20.0 this can happen
// because failed/zero-change melts leave orphan blank-output rows behind
// (see report.md). Treated identically to OutputsAlreadySigned for retry
// purposes: bump the deterministic counter past the colliding range and
// retry with fresh outputs.
export const isCashuOutputsArePendingError = (error: unknown): boolean => {
  if (getMintErrorCode(error) === 11004) return true;
  const message = getUnknownErrorMessage(error, "").toLowerCase();
  return (
    message.includes("outputs are pending") ||
    message.includes("output is pending")
  );
};

export const isCashuRecoverableOutputCollisionError = (
  error: unknown,
): boolean =>
  isCashuOutputsAlreadySignedError(error) ||
  isCashuOutputsArePendingError(error);
