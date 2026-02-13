export const trimString = (value: unknown): string => {
  return String(value ?? "").trim();
};

export const asNonEmptyString = (value: unknown): string | null => {
  const text = trimString(value);
  return text || null;
};

export const isHttpUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

export const makeLocalId = (): string => {
  try {
    return globalThis.crypto?.randomUUID?.() ?? "";
  } catch {
    // ignore
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};
