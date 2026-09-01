/** The cashu-ts `Amount` field of a mint response, as a plain finite number. */
export const cashuAmountToNumber = (value: {
  toNumber(): number;
}): number | null => {
  try {
    const numeric = value.toNumber();
    return Number.isFinite(numeric) ? numeric : null;
  } catch {
    return null;
  }
};
