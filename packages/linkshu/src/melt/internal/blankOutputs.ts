/**
 * Mirrors cashu-ts `prepareMelt`: for an overpayment of `excess` (melt
 * inputs minus quote amount) it derives `ceil(log2(excess)) || 1` NUT-08
 * blank outputs, each consuming one deterministic counter slot. The count
 * must be reproduced exactly, because the counter has to advance past every
 * blank the mint saw — signed or not — before the melt response is known.
 */
export const blankOutputCount = (excess: number): number => {
  const value = Number.isFinite(excess) && excess > 0 ? Math.trunc(excess) : 0;
  if (value <= 0) return 0;
  const count = Math.ceil(Math.log2(value)) || 1;
  return count < 0 ? 0 : count;
};
