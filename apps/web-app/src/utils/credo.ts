export const getCredoRemainingAmount = (row: unknown): number => {
  const r = row as {
    amount?: unknown;
    settledAmount?: unknown;
  };
  const amount = Number(r.amount ?? 0) || 0;
  const settled = Number(r.settledAmount ?? 0) || 0;
  return Math.max(0, amount - settled);
};
