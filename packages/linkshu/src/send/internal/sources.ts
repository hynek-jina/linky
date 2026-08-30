import type { CurrencyUnit, MintUrl } from "../../domain/primitives";
import { dedupeProofs } from "../../internal/proofStates";
import type { StoredTokenRow } from "../../ports/TokenStore";
import type { Proof } from "../../token/domain";
import { collectRowProofs } from "../../token/internal/rowProofs";
import type { RowProofs } from "../../token/internal/rowProofs";

/** An `accepted` row spendable at the target mint, with its decoded proofs. */
export type SendSource = RowProofs;

export const collectSendSources = (
  rows: ReadonlyArray<StoredTokenRow>,
  mint: MintUrl,
  unit: CurrencyUnit,
  /** The mint's full keyset ids; expands short v2 ids in stored v4 tokens. */
  keysetIds: readonly string[],
): ReadonlyArray<SendSource> =>
  collectRowProofs(
    rows.filter((row) => row.state === "accepted"),
    mint,
    unit,
    keysetIds,
  );

/** One state-check candidate per distinct secret (rows may share proofs). */
export const dedupeSourceProofs = (
  sources: ReadonlyArray<SendSource>,
): ReadonlyArray<Proof> =>
  dedupeProofs(sources.flatMap((source) => source.proofs));

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
