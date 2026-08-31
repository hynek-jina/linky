import type * as Evolu from "@evolu/common";
import {
  linkshuServices,
  NonNegativeAmount,
  Receive,
  ReceiveDraft,
  Tokens,
  WalletBalances,
} from "@linky/linkshu";
import type {
  Bip39Seed,
  ReceiveError,
  ReceiveReceipt,
  WalletToken,
} from "@linky/linkshu";
import { Effect, Layer, ManagedRuntime } from "effect";
import type { Either } from "effect";
import React from "react";
import { linkshuAppInspector } from "../../../devtools/inspector/linkshuInspector";
import type { CashuTokenRow, useEvolu } from "../../../evolu";
import { evoluTokenStore } from "../../../platform/linkshu/evoluTokenStore";
import { localStorageKeyValueStore } from "../../../platform/linkshu/localStorageKeyValueStore";
import { resolveLinkshuSeed } from "../../../platform/linkshu/resolveLinkshuSeed";

type EvoluMutations = ReturnType<typeof useEvolu>;

interface UseLinkshuCompositionParams {
  /** Wallet-visible rows across cashu owner lanes, already deduped. */
  cashuTokenRows: readonly CashuTokenRow[];
  /** Seed resolution re-runs when the active identity changes. */
  currentNsec: string | null;
  update: EvoluMutations["update"];
  upsert: EvoluMutations["upsert"];
  /** Active cashu write lane; null until the owners are ready. */
  writeOwnerId: Evolu.OwnerId | null;
}

const emptyBalances = new WalletBalances({
  total: NonNegativeAmount.make(0),
  spendable: NonNegativeAmount.make(0),
  perMint: [],
});

interface LinkshuReadModel {
  readonly balances: WalletBalances;
  readonly tokens: ReadonlyArray<WalletToken>;
}

const emptyReadModel: LinkshuReadModel = {
  balances: emptyBalances,
  tokens: [],
};

const sameSeed = (a: Bip39Seed, b: Bip39Seed): boolean =>
  a.length === b.length && a.every((byte, index) => byte === b[index]);

/**
 * Runs linkshu Receive end to end (parse, dedup, swap, persist) and resolves
 * with the typed outcome; only defects reject.
 */
export type ReceiveCashuToken = (
  text: string,
) => Promise<Either.Either<ReceiveReceipt, ReceiveError>>;

/**
 * The app's linkshu composition root: resolves the seed, layers
 * `linkshuServices` over the Evolu `TokenStore` and localStorage
 * `KeyValueStore` adapters with the app inspector bridged in, and keeps a
 * `ManagedRuntime` alive for the wallet UI. The read model (token list +
 * balances) re-runs through `Tokens` whenever the underlying rows change.
 */
export const useLinkshuComposition = ({
  cashuTokenRows,
  currentNsec,
  update,
  upsert,
  writeOwnerId,
}: UseLinkshuCompositionParams) => {
  const rowsRef = React.useRef(cashuTokenRows);
  rowsRef.current = cashuTokenRows;
  const writeOwnerIdRef = React.useRef(writeOwnerId);
  writeOwnerIdRef.current = writeOwnerId;
  const updateRef = React.useRef(update);
  updateRef.current = update;
  const upsertRef = React.useRef(upsert);
  upsertRef.current = upsert;

  const [bip39Seed, setBip39Seed] = React.useState<Bip39Seed | null>(null);

  React.useEffect(() => {
    if (!currentNsec) return;
    let cancelled = false;
    void resolveLinkshuSeed()
      .then((seed) => {
        if (cancelled) return;
        setBip39Seed((previous) =>
          previous !== null && sameSeed(previous, seed) ? previous : seed,
        );
      })
      .catch((error: unknown) => {
        console.warn("[linky] linkshu seed resolution failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, [currentNsec]);

  const linkshuRuntime = React.useMemo(() => {
    if (bip39Seed === null) return null;
    return ManagedRuntime.make(
      linkshuServices({
        bip39Seed,
        keyValueStore: localStorageKeyValueStore,
        tokenStore: evoluTokenStore({
          loadTokenRows: () => Promise.resolve(rowsRef.current),
          update: (table, payload, options) =>
            updateRef.current(table, payload, options),
          upsert: (table, payload, options) =>
            upsertRef.current(table, payload, options),
          getWriteOwnerId: () => {
            const ownerId = writeOwnerIdRef.current;
            if (ownerId === null) {
              throw new Error("linkshu write before cashu owner is ready");
            }
            return ownerId;
          },
        }),
      }).pipe(Layer.provideMerge(linkshuAppInspector)),
    );
  }, [bip39Seed]);

  React.useEffect(() => {
    if (linkshuRuntime === null) return;
    return () => {
      void linkshuRuntime.dispose();
    };
  }, [linkshuRuntime]);

  const [readModel, setReadModel] =
    React.useState<LinkshuReadModel>(emptyReadModel);

  React.useEffect(() => {
    if (linkshuRuntime === null) return;
    let cancelled = false;
    void linkshuRuntime
      .runPromise(
        Effect.gen(function* () {
          const tokens = yield* Tokens;
          return {
            balances: yield* tokens.balances,
            tokens: yield* tokens.list,
          };
        }),
      )
      .then((model) => {
        if (!cancelled) setReadModel(model);
      })
      .catch((error: unknown) => {
        console.warn("[linky] linkshu wallet read failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, [cashuTokenRows, linkshuRuntime]);

  const receiveCashuToken = React.useMemo<ReceiveCashuToken | null>(() => {
    if (linkshuRuntime === null) return null;
    return (text) =>
      linkshuRuntime.runPromise(
        Receive.pipe(
          Effect.flatMap((receive) =>
            receive.receive(new ReceiveDraft({ text })),
          ),
          Effect.either,
        ),
      );
  }, [linkshuRuntime]);

  return {
    linkshuRuntime,
    receiveCashuToken,
    walletBalances: readModel.balances,
    walletTokens: readModel.tokens,
  };
};
