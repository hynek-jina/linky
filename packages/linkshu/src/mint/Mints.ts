import { getTokenMetadata } from "@cashu/cashu-ts";
import { Effect } from "effect";
import type { MintRejected, MintUnreachable } from "../domain/errors";
import { CurrencyUnit, parseMintUrl } from "../domain/primitives";
import type { MintUrl } from "../domain/primitives";
import { Inspector } from "../inspector/Inspector";
import { inspectOperation } from "../internal/operations";
import { KeyValueStore } from "../ports/KeyValueStore";
import { TokenStore } from "../ports/TokenStore";
import { MintInfo } from "./domain";
import {
  SEEN_MINTS_KEY_PREFIX,
  WalletInstances,
} from "./internal/WalletInstances";
import type { LoadedWallet } from "./internal/WalletInstances";

/** Linky wallets are sat-denominated today (see README). */
const sat = CurrencyUnit.make("sat");

const nullableString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/** Fee of the keyset the wallet is bound to, as the mint published it. */
const boundKeysetInputFeePpk = (wallet: LoadedWallet): number | null => {
  const bound = wallet.keyChain
    .getKeysets()
    .find((keyset) => keyset.id === wallet.keysetId);
  return bound?.toMintKeyset().input_fee_ppk ?? null;
};

const buildMintInfo = (mint: MintUrl, wallet: LoadedWallet): MintInfo => {
  const published = wallet.getMintInfo();
  const raw = published.cache;
  return new MintInfo({
    url: mint,
    name: nullableString(raw.name),
    inputFeePpk: boundKeysetInputFeePpk(wallet),
    supportsMpp: published.isSupported(15).supported,
    iconUrl: nullableString(raw.icon_url),
  });
};

/** Undecodable stored rows carry no usable mint; they are skipped, not fatal. */
const tokenTextMint = (tokenText: string): MintUrl | null => {
  try {
    return parseMintUrl(getTokenMetadata(tokenText).mint);
  } catch {
    return null;
  }
};

/**
 * Mint knowledge. Also the home of the package's single wallet-instance
 * cache (one loaded cashu-ts wallet per mint+unit, shared by every
 * vertical) — that cache is internal and never part of this interface,
 * because raw cashu-ts types do not cross the public boundary.
 */
export class Mints extends Effect.Service<Mints>()("linkshu/Mints", {
  dependencies: [WalletInstances.Default],
  effect: Effect.gen(function* () {
    const kv = yield* KeyValueStore;
    const tokenStore = yield* TokenStore;
    const instances = yield* WalletInstances;
    const inspector = yield* Inspector.orNoop;

    /** Fetch and normalize the mint's published info and keyset fees. */
    const info = (
      mint: MintUrl,
    ): Effect.Effect<MintInfo, MintUnreachable | MintRejected> =>
      instances.get(mint, sat).pipe(
        Effect.map((wallet) => buildMintInfo(mint, wallet)),
        inspectOperation(inspector, "mints.info", { mint }),
      );

    /** Every mint the wallet has state for: stored rows plus seen mints. */
    const knownMints: Effect.Effect<ReadonlyArray<MintUrl>> = Effect.gen(
      function* () {
        const mints = new Set<MintUrl>();
        const rows = yield* tokenStore.loadAll;
        for (const row of rows) {
          const mint = tokenTextMint(row.tokenText);
          if (mint !== null) mints.add(mint);
        }
        const seenKeys = yield* kv.listKeys(SEEN_MINTS_KEY_PREFIX);
        for (const key of seenKeys) {
          const value = yield* kv.get(key);
          const mint = value === null ? null : parseMintUrl(value);
          if (mint !== null) mints.add(mint);
        }
        return [...mints].sort();
      },
    );

    return { info, knownMints } as const;
  }),
}) {}
