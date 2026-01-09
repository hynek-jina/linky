import { getCashuLib } from "./utils/cashuLib";

type CashuAcceptResult = {
  mint: string;
  unit: string | null;
  amount: number;
  token: string;
};

export const acceptCashuToken = async (
  rawToken: string
): Promise<CashuAcceptResult> => {
  const tokenText = rawToken.trim();
  if (!tokenText) throw new Error("Empty token");

  const { CashuMint, CashuWallet, getDecodedToken, getEncodedToken } =
    await getCashuLib();

  const decoded = getDecodedToken(tokenText);
  const mintUrl = decoded.mint;
  if (!mintUrl) throw new Error("Token mint missing");

  const wallet = new CashuWallet(
    new CashuMint(mintUrl),
    decoded.unit ? { unit: decoded.unit } : {}
  );

  await wallet.loadMint();

  // This performs a swap at the mint, returning fresh proofs.
  const proofs = await wallet.receive(decoded);

  const amount = proofs.reduce((sum, proof) => sum + (proof.amount ?? 0), 0);

  const acceptedToken = getEncodedToken({
    mint: mintUrl,
    proofs,
    ...(decoded.unit ? { unit: decoded.unit } : {}),
    ...(decoded.memo ? { memo: decoded.memo } : {}),
  });

  return {
    mint: mintUrl,
    unit: decoded.unit ?? null,
    amount,
    token: acceptedToken,
  };
};
