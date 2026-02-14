import type { JsonRecord, JsonValue } from "../types/json";

type StringConvertible =
  | bigint
  | boolean
  | number
  | string
  | symbol
  | { toString(): string }
  | null
  | undefined;

type ValidationValue = JsonValue | StringConvertible;

const isJsonRecord = (value: ValidationValue): value is JsonRecord => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const trimString = (value: StringConvertible): string => {
  return String(value ?? "").trim();
};

export const asNonEmptyString = (value: StringConvertible): string | null => {
  const text = trimString(value);
  return text || null;
};

export const isHttpUrl = (value: StringConvertible): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const asRecord = (value: ValidationValue): JsonRecord | null => {
  if (!isJsonRecord(value)) return null;
  return value;
};

export const makeLocalId = (): string => {
  try {
    return globalThis.crypto?.randomUUID?.() ?? "";
  } catch {
    // ignore
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};
