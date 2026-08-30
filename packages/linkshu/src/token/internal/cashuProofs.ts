import type { Proof as CashuProof } from "@cashu/cashu-ts";
import { Amount } from "../../domain/primitives";
import type { CurrencyUnit, MintUrl, TokenText } from "../../domain/primitives";
import { encodeToken } from "../codec";
import { decodeTokenFields } from "./v3Json";

export interface EncodedCashuProofs {
  readonly tokenText: TokenText;
  readonly amount: Amount;
}

/**
 * Encodes proofs returned by a cashu-ts wallet operation as canonical token
 * text plus their total; `null` when the mint handed back malformed proofs.
 */
export const encodeCashuProofs = (args: {
  readonly mint: MintUrl;
  readonly unit: CurrencyUnit;
  readonly memo: string | null;
  readonly proofs: ReadonlyArray<CashuProof>;
}): EncodedCashuProofs | null => {
  const decoded = decodeTokenFields({
    mint: args.mint,
    unit: args.unit,
    memo: args.memo,
    proofs: args.proofs.map((proof) => ({
      id: proof.id,
      amount: proof.amount.toNumber(),
      secret: proof.secret,
      C: proof.C,
    })),
  });
  if (decoded === null) return null;
  const total = decoded.proofs.reduce((sum, proof) => sum + proof.amount, 0);
  return { tokenText: encodeToken(decoded), amount: Amount.make(total) };
};
