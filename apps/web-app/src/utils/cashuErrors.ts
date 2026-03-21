import { getUnknownErrorMessage } from "./unknown";

export const isCashuOutputsAlreadySignedError = (error: unknown): boolean => {
  const message = getUnknownErrorMessage(error, "").toLowerCase();
  return (
    message.includes("outputs have already been signed") ||
    message.includes("already been signed before") ||
    message.includes("keyset id already signed")
  );
};
