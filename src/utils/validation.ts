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
