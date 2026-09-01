import type { LoadedWallet } from "./WalletInstances";

/** Fee of the keyset the wallet is bound to, as the mint published it. */
export const boundKeysetInputFeePpk = (wallet: LoadedWallet): number | null => {
  const bound = wallet.keyChain
    .getKeysets()
    .find((keyset) => keyset.id === wallet.keysetId);
  return bound?.toMintKeyset().input_fee_ppk ?? null;
};

/**
 * Upper bound on the cashu input fee a swap over `proofCount` proofs pays
 * (NUT-02: `ceil(ppk * inputs / 1000)`). Sizing an amount down by it keeps the
 * swap that follows from coming up short.
 */
export const inputFeeAllowance = (
  wallet: LoadedWallet,
  proofCount: number,
): number => {
  const ppk = boundKeysetInputFeePpk(wallet);
  return ppk === null || ppk <= 0 ? 0 : Math.ceil((ppk * proofCount) / 1000);
};
