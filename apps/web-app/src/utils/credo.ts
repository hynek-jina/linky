interface CredoStructuredValue {
  toString(): string;
}

type CredoAmountValue =
  | bigint
  | boolean
  | number
  | CredoStructuredValue
  | string
  | symbol
  | null
  | undefined;

interface CredoAmountRow {
  amount?: CredoAmountValue;
  settledAmount?: CredoAmountValue;
}

type CredoRowInput = CredoAmountRow | CredoAmountValue;

const isCredoAmountRow = (value: CredoRowInput): value is CredoAmountRow => {
  return typeof value === "object" && value !== null;
};

export const getCredoRemainingAmount = (row: CredoRowInput): number => {
  const source = isCredoAmountRow(row) ? row : {};
  const amount = Number(source.amount ?? 0) || 0;
  const settled = Number(source.settledAmount ?? 0) || 0;
  return Math.max(0, amount - settled);
};
