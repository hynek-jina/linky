import {
  bumpCashuDeterministicCounter,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  withCashuDeterministicCounterLock,
} from "./utils/cashuDeterministic";
import { getCashuLib } from "./utils/cashuLib";

type CashuAcceptResult = {
  amount: number;
  mint: string;
  token: string;
  unit: string | null;
};

export const acceptCashuToken = async (
  rawToken: string,
): Promise<CashuAcceptResult> => {
  const tokenText = rawToken.trim();
  if (!tokenText) throw new Error("Empty token");

  const { CashuMint, CashuWallet, getDecodedToken, getEncodedToken } =
    await getCashuLib();

  const decoded = getDecodedToken(tokenText);
  const mintUrl = decoded.mint;
  if (!mintUrl) throw new Error("Token mint missing");

  const det = getCashuDeterministicSeedFromStorage();

  const wallet = new CashuWallet(new CashuMint(mintUrl), {
    ...(decoded.unit ? { unit: decoded.unit } : {}),
    ...(det ? { bip39seed: det.bip39seed } : {}),
  });

  await wallet.loadMint();

  const unit = wallet.unit;
  const keysetId = wallet.keysetId;

  const isOutputsAlreadySignedError = (e: unknown): boolean => {
    const m = String(e ?? "").toLowerCase();
    return (
      m.includes("outputs have already been signed") ||
      m.includes("already been signed before") ||
      m.includes("keyset id already signed")
    );
  };

  const proofs = (await (det
    ? withCashuDeterministicCounterLock(
        { mintUrl, unit, keysetId },
        async () => {
          const receiveOnce = async (counter: number) =>
            await wallet.receive(decoded, { counter });

          let counter = getCashuDeterministicCounter({
            mintUrl,
            unit,
            keysetId,
          });

          // This performs a swap at the mint, returning fresh proofs.
          let proofs: unknown;
          let lastError: unknown;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
              proofs = await receiveOnce(counter);
              lastError = null;
              break;
            } catch (e) {
              lastError = e;
              if (!isOutputsAlreadySignedError(e)) throw e;
              bumpCashuDeterministicCounter({
                mintUrl,
                unit,
                keysetId,
                used: 64,
              });
              counter = getCashuDeterministicCounter({
                mintUrl,
                unit,
                keysetId,
              });
            }
          }

          if (!proofs) throw lastError ?? new Error("receive failed");

          bumpCashuDeterministicCounter({
            mintUrl,
            unit,
            keysetId,
            used: Array.isArray(proofs) ? proofs.length : 0,
          });

          return proofs as Array<{
            amount: number;
            secret: string;
            C: string;
            id: string;
          }>;
        },
      )
    : wallet.receive(decoded))) as Array<{
    amount: number;
    secret: string;
    C: string;
    id: string;
  }>;

  const amount = proofs.reduce((sum, proof) => sum + (proof.amount ?? 0), 0);

  const acceptedToken = getEncodedToken({
    mint: mintUrl,
    proofs,
    unit,
    ...(decoded.memo ? { memo: decoded.memo } : {}),
  });

  return {
    mint: mintUrl,
    unit,
    amount,
    token: acceptedToken,
  };
};
