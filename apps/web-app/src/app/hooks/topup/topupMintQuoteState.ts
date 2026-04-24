const readObjectField = (value: unknown, field: string): unknown => {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, field);
};

const readMintQuoteEnumValue = (
  value: unknown,
  field: "ISSUED" | "PAID",
): string | null => {
  const enumValue = readObjectField(value, field);
  if (enumValue === undefined || enumValue === null) return null;
  return String(enumValue);
};

const normalizeMintQuoteState = (value: string): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

export const readMintQuoteState = (value: unknown): string => {
  const state = readObjectField(value, "state");
  if (state !== undefined && state !== null) return String(state);

  const paid = readObjectField(value, "paid");
  if (typeof paid === "boolean") {
    return paid ? "PAID" : "UNPAID";
  }

  const status = readObjectField(value, "status");
  return String(status ?? "");
};

export const isClaimableMintQuoteState = (
  state: string,
  mintQuoteStateEnum: unknown,
): boolean => {
  const normalized = normalizeMintQuoteState(state);
  if (!normalized) return false;
  if (normalized === "paid" || normalized === "issued") return true;

  const paidState = readMintQuoteEnumValue(mintQuoteStateEnum, "PAID");
  if (normalizeMintQuoteState(paidState ?? "") === normalized) return true;

  const issuedState = readMintQuoteEnumValue(mintQuoteStateEnum, "ISSUED");
  return normalizeMintQuoteState(issuedState ?? "") === normalized;
};
