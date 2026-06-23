type ErrorDetailsRecord = Record<string, string | undefined>;

export const isUnknownRecord = (
  value: unknown,
): value is ErrorDetailsRecord => {
  return value !== null && typeof value === "object";
};

export const getUnknownErrorMessage = (
  value: unknown,
  fallback: string,
): string => {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "string") {
    return value || fallback;
  }

  if (value instanceof Error) {
    const message = String(value);
    return message || fallback;
  }

  if (isUnknownRecord(value) && typeof value.message === "string") {
    return value.message || fallback;
  }

  if (typeof value === "object") {
    try {
      const json = JSON.stringify(value);
      if (json && json !== "{}") return json;
    } catch {
      // Fall back to String below for circular/non-serializable values.
    }
  }

  const message = String(value);
  return message || fallback;
};
