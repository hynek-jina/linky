import type { CurrencyUnit, MintUrl } from "../../domain/primitives";
import type { StoredTokenRow } from "../../ports/TokenStore";
import { decodeTokenText } from "../codec";
import type { Proof } from "../domain";

/** A stored row paired with the proofs its token text decodes to. */
export interface RowProofs {
  readonly row: StoredTokenRow;
  readonly proofs: ReadonlyArray<Proof>;
}

/**
 * The rows that hold proofs at this mint and unit, decoded. Rows whose text
 * is undecodable or belongs elsewhere are skipped, never failed on.
 * `keysetIds` (the mint's full keyset ids) expand short v2 ids in v4 tokens.
 */
export const collectRowProofs = (
  rows: ReadonlyArray<StoredTokenRow>,
  mint: MintUrl,
  unit: CurrencyUnit,
  keysetIds: readonly string[],
): ReadonlyArray<RowProofs> =>
  rows.flatMap((row) => {
    const decoded = decodeTokenText(row.tokenText, keysetIds);
    if (decoded === null || decoded.mint !== mint || decoded.unit !== unit) {
      return [];
    }
    return [{ row, proofs: decoded.proofs }];
  });

export const totalProofAmount = (proofs: ReadonlyArray<Proof>): number =>
  proofs.reduce((sum, proof) => sum + proof.amount, 0);
