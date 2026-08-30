import type { CurrencyUnit, MintUrl } from "../../domain/primitives";
import type { StoredTokenRow } from "../../ports/TokenStore";
import { decodeTokenText } from "../../token/codec";
import type { Proof } from "../../token/domain";

/** An `accepted` row spendable at the target mint, with its decoded proofs. */
export interface SendSource {
  readonly row: StoredTokenRow;
  readonly proofs: ReadonlyArray<Proof>;
}

export const collectSendSources = (
  rows: ReadonlyArray<StoredTokenRow>,
  mint: MintUrl,
  unit: CurrencyUnit,
  /** The mint's full keyset ids; expands short v2 ids in stored v4 tokens. */
  keysetIds: readonly string[],
): ReadonlyArray<SendSource> =>
  rows.flatMap((row) => {
    if (row.state !== "accepted") return [];
    const decoded = decodeTokenText(row.tokenText, keysetIds);
    if (decoded === null || decoded.mint !== mint || decoded.unit !== unit) {
      return [];
    }
    return [{ row, proofs: decoded.proofs }];
  });

/** One state-check candidate per distinct secret (rows may share proofs). */
export const dedupeSourceProofs = (
  sources: ReadonlyArray<SendSource>,
): ReadonlyArray<Proof> => {
  const seen = new Set<string>();
  const unique: Proof[] = [];
  for (const source of sources) {
    for (const proof of source.proofs) {
      if (seen.has(proof.secret)) continue;
      seen.add(proof.secret);
      unique.push(proof);
    }
  }
  return unique;
};

export interface SpendablePartition {
  /** Rows whose every proof the mint reports spent; dead, to be marked. */
  readonly fullySpentRows: ReadonlyArray<StoredTokenRow>;
  /** Rows still holding an unspent proof; the swap consumes them. */
  readonly liveRows: ReadonlyArray<StoredTokenRow>;
  /** Unspent proofs offered to the swap, deduped by secret. */
  readonly spendable: ReadonlyArray<Proof>;
  /** Sum of `spendable`. */
  readonly available: number;
}

export const partitionBySpentSecrets = (
  sources: ReadonlyArray<SendSource>,
  spentSecrets: ReadonlySet<string>,
): SpendablePartition => {
  const fullySpentRows: StoredTokenRow[] = [];
  const liveRows: StoredTokenRow[] = [];
  const seen = new Set<string>();
  const spendable: Proof[] = [];
  let available = 0;
  for (const source of sources) {
    if (source.proofs.every((proof) => spentSecrets.has(proof.secret))) {
      fullySpentRows.push(source.row);
      continue;
    }
    liveRows.push(source.row);
    for (const proof of source.proofs) {
      if (spentSecrets.has(proof.secret) || seen.has(proof.secret)) continue;
      seen.add(proof.secret);
      spendable.push(proof);
      available += proof.amount;
    }
  }
  return { fullySpentRows, liveRows, spendable, available };
};
