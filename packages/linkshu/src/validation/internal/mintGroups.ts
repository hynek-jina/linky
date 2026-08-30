import { CurrencyUnit } from "../../domain/primitives";
import type { MintUrl } from "../../domain/primitives";
import type { StoredTokenRow } from "../../ports/TokenStore";
import { parseTokenText } from "../../token/codec";

const sat = CurrencyUnit.make("sat");

/** Rows that share a mint and unit, and therefore one checkstate call. */
export interface MintRowGroup {
  readonly mint: MintUrl;
  readonly unit: CurrencyUnit;
  readonly rows: ReadonlyArray<StoredTokenRow>;
}

/**
 * Buckets rows by the mint and unit their token text states. Grouping reads
 * metadata only — no keysets, so no wallet has to be loaded to decide which
 * mint to ask. Rows stating no mint are dropped: nobody can be asked about
 * them.
 */
export const groupRowsByMint = (
  rows: ReadonlyArray<StoredTokenRow>,
): ReadonlyArray<MintRowGroup> => {
  const groups = new Map<
    string,
    { mint: MintUrl; unit: CurrencyUnit; rows: StoredTokenRow[] }
  >();
  for (const row of rows) {
    const parsed = parseTokenText(row.tokenText);
    if (parsed === null || parsed.mint === null) continue;
    const unit = parsed.unit ?? sat;
    const key = `${parsed.mint}|${unit}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { mint: parsed.mint, unit, rows: [row] });
      continue;
    }
    existing.rows.push(row);
  }
  return [...groups.values()];
};
