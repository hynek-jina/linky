import { getTokenMetadata } from "@cashu/cashu-ts";
import { Effect } from "effect";
import { parseMintUrl } from "../../domain/primitives";
import type { MintUrl } from "../../domain/primitives";
import type { KeyValueStoreService } from "../../ports/KeyValueStore";
import type { TokenStoreService } from "../../ports/TokenStore";
import { SEEN_MINTS_KEY_PREFIX } from "./WalletInstances";

/** Undecodable stored rows carry no usable mint; they are skipped, not fatal. */
const tokenTextMint = (tokenText: string): MintUrl | null => {
  try {
    return parseMintUrl(getTokenMetadata(tokenText).mint);
  } catch {
    return null;
  }
};

/**
 * Every mint the wallet has state for: the mints of stored rows plus the
 * mints any wallet load has seen. Restore scans these when the caller names
 * none.
 */
export const collectKnownMints = (
  kv: KeyValueStoreService,
  tokenStore: TokenStoreService,
): Effect.Effect<ReadonlyArray<MintUrl>> =>
  Effect.gen(function* () {
    const mints = new Set<MintUrl>();
    for (const row of yield* tokenStore.loadAll) {
      const mint = tokenTextMint(row.tokenText);
      if (mint !== null) mints.add(mint);
    }
    for (const key of yield* kv.listKeys(SEEN_MINTS_KEY_PREFIX)) {
      const value = yield* kv.get(key);
      const mint = value === null ? null : parseMintUrl(value);
      if (mint !== null) mints.add(mint);
    }
    return [...mints].sort();
  });
