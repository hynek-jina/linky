import { getCashuLib } from "./utils/cashuLib";

type CashuPayResult = {
  mint: string;
  unit: string | null;
  paidAmount: number;
  feeReserve: number;
  remainingAmount: number;
  remainingToken: string | null;
};

type Proof = {
  amount: number;
  secret: string;
  C: string;
  id: string;
};

const getProofAmountSum = (proofs: Array<{ amount: number }>) =>
  proofs.reduce((sum, proof) => sum + proof.amount, 0);

export const meltInvoiceWithTokensAtMint = async (args: {
  invoice: string;
  mint: string;
  tokens: string[];
  unit?: string | null;
}): Promise<CashuPayResult> => {
  const { invoice, mint, tokens, unit } = args;
  const { CashuMint, CashuWallet, getDecodedToken, getEncodedToken } =
    await getCashuLib();

  const allProofs: Proof[] = [];

  for (const tokenText of tokens) {
    const decoded = getDecodedToken(tokenText);
    if (!decoded?.mint) throw new Error("Token mint missing");
    if (decoded.mint !== mint) throw new Error("Mixed mints not supported");
    for (const proof of decoded.proofs ?? []) {
      allProofs.push({
        amount: Number(proof.amount ?? 0),
        secret: proof.secret,
        C: proof.C,
        id: proof.id,
      });
    }
  }

  const wallet = new CashuWallet(
    new CashuMint(mint),
    unit ? { unit } : undefined
  );
  await wallet.loadMint();

  const quote = await wallet.createMeltQuote(invoice);
  const total = (quote.amount ?? 0) + (quote.fee_reserve ?? 0);

  const have = getProofAmountSum(allProofs);
  if (have < total) {
    throw new Error(`Insufficient funds (need ${total}, have ${have})`);
  }

  // Swap to get exact proofs for amount+fees; returns keep+send proofs.
  const swapped = await wallet.swap(total, allProofs);
  const melt = await wallet.meltProofs(quote, swapped.send);

  const remainingProofs = [...(swapped.keep ?? []), ...(melt.change ?? [])];
  const remainingAmount = getProofAmountSum(remainingProofs);

  const remainingToken =
    remainingProofs.length > 0
      ? getEncodedToken({
          mint,
          proofs: remainingProofs,
          ...(unit ? { unit } : {}),
        })
      : null;

  return {
    mint,
    unit: unit ?? null,
    paidAmount: quote.amount ?? 0,
    feeReserve: quote.fee_reserve ?? 0,
    remainingAmount,
    remainingToken,
  };
};
