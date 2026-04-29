import type { Proof } from "@cashu/cashu-ts";
import {
  bumpCashuDeterministicCounter,
  ensureCashuDeterministicCounterAtLeast,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  withCashuDeterministicCounterLock,
} from "./utils/cashuDeterministic";
import {
  isCashuOutputsAlreadySignedError,
  isCashuRecoverableOutputCollisionError,
} from "./utils/cashuErrors";
import { getCashuLib } from "./utils/cashuLib";
import {
  createLoadedCashuWallet,
  decodeCashuTokenForMint,
} from "./utils/cashuWallet";

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

  const {
    CashuMint,
    CashuWallet,
    getDecodedToken,
    getEncodedToken,
    getTokenMetadata,
  } = await getCashuLib();

  const tokenMetadata = getTokenMetadata(tokenText);
  const mintUrl = String(tokenMetadata.mint ?? "").trim();
  if (!mintUrl) throw new Error("Token mint missing");

  const det = getCashuDeterministicSeedFromStorage();

  const wallet = await createLoadedCashuWallet({
    CashuMint,
    CashuWallet,
    mintUrl,
    ...(tokenMetadata.unit ? { unit: tokenMetadata.unit } : {}),
    ...(det ? { bip39seed: det.bip39seed } : {}),
  });

  const decoded = decodeCashuTokenForMint({
    tokenText,
    mintUrl,
    keysets: wallet.keysets,
    getDecodedToken,
    getTokenMetadata,
  });

  const unit = wallet.unit;
  const keysetId = wallet.keysetId;

  const proofs = await (det
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
          // OutputsAlreadySigned (already-signed B_'s in the deterministic
          // counter range, typically from melt-blank leftovers — see
          // cashuMelt.ts) used to retry with a fixed +64 bump per attempt,
          // which silently looped when the colliding range was wider than
          // 5 * 64 = 320 slots. Now we ask the mint via NUT-09 restore where
          // the last signed slot in the window actually is, and bump the
          // counter past it precisely. OutputsArePending (NUT 11004 orphan
          // c_ IS NULL rows) still uses the fixed bump because restore won't
          // surface unsigned promises.
          let receivedProofs: Proof[] | null = null;
          let lastError: unknown;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
              receivedProofs = await receiveOnce(counter);
              lastError = null;
              break;
            } catch (e) {
              lastError = e;
              if (!isCashuRecoverableOutputCollisionError(e)) throw e;

              if (isCashuOutputsAlreadySignedError(e)) {
                let lastSignedCounter: number | undefined;
                try {
                  const restored = await wallet.restore(counter, 100, {
                    keysetId,
                  });
                  if (
                    typeof restored.lastCounterWithSignature === "number" &&
                    Number.isFinite(restored.lastCounterWithSignature)
                  ) {
                    lastSignedCounter = restored.lastCounterWithSignature;
                  }
                } catch {
                  // restore failed — fall through to fixed bump
                }
                if (typeof lastSignedCounter === "number") {
                  ensureCashuDeterministicCounterAtLeast({
                    mintUrl,
                    unit,
                    keysetId,
                    atLeast: lastSignedCounter + 1,
                  });
                } else {
                  bumpCashuDeterministicCounter({
                    mintUrl,
                    unit,
                    keysetId,
                    used: 64,
                  });
                }
              } else {
                bumpCashuDeterministicCounter({
                  mintUrl,
                  unit,
                  keysetId,
                  used: 64,
                });
              }

              counter = getCashuDeterministicCounter({
                mintUrl,
                unit,
                keysetId,
              });
            }
          }

          if (!receivedProofs) throw lastError ?? new Error("receive failed");

          bumpCashuDeterministicCounter({
            mintUrl,
            unit,
            keysetId,
            used: receivedProofs.length,
          });

          return receivedProofs;
        },
      )
    : wallet.receive(decoded));

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
