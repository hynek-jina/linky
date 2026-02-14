export type RuntimeValue =
  | bigint
  | boolean
  | number
  | string
  | symbol
  | { toString(): string }
  | null
  | undefined;

export const toAppValue = (value: unknown): RuntimeValue => {
  if (value === null || value === undefined) return value;

  const kind = typeof value;
  if (
    kind === "string" ||
    kind === "number" ||
    kind === "boolean" ||
    kind === "bigint" ||
    kind === "symbol" ||
    kind === "object" ||
    kind === "function"
  ) {
    return value;
  }

  return String(value);
};
