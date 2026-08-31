import type * as Evolu from "@evolu/common";
import {
  Autoswap,
  AutoswapDraft,
  FeeProbe,
  FeeProbeDraft,
  linkshuServices,
  Melt,
  MeltDraft,
  NonNegativeAmount,
  Receive,
  ReceiveDraft,
  Restore,
  RestoreDraft,
  SendDraft,
  Send,
  Tokens,
  TokenRowId,
  TokenStore,
  Topup,
  TopupDraft,
  Validation,
  WalletBalances,
} from "@linky/linkshu";
import type {
  AutoswapClaimResult,
  AutoswapError,
  AutoswapReceipt,
  Bip39Seed,
  DeletedSpentToken,
  FeeProbeError,
  InvalidTokenTransition,
  IssuedClaimReport,
  LightningFeeProbeResult,
  MeltError,
  MeltReceipt,
  MintRejected,
  MintUnreachable,
  ReceiveError,
  ReceiveReceipt,
  RestoreReport,
  RowCheckResult,
  SendError,
  SendReceipt,
  TokenRowNotFound,
  TopupError,
  TopupHandle,
  TopupQuote,
  TopupReceipt,
  ValidationReport,
  WalletToken,
} from "@linky/linkshu";
import { Effect, Exit, Layer, ManagedRuntime, Schema, Scope } from "effect";
import type { Either } from "effect";
import React from "react";
import { linkshuAppInspector } from "../../../devtools/inspector/linkshuInspector";
import { migrateLegacyCashuLocalState } from "../../migrations/linkshuStorageMigration";
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

export interface SendCashuTokenArgs {
  readonly amountSat: number;
  readonly mint: string;
  /** `issued` for QR/share (claim-watched), `pending` for messenger sends. */
  readonly produceAs: "issued" | "pending";
}

/**
 * Runs linkshu Send end to end (NUT-07 pre-filter, exact-amount swap, change
 * persisted `accepted`, send row persisted in the drafted state) and resolves
 * with the typed outcome; invalid mint/amount input and defects reject.
 */
export type SendCashuToken = (
  args: SendCashuTokenArgs,
) => Promise<Either.Either<SendReceipt, SendError>>;

export interface MeltCashuInvoiceArgs {
  readonly invoice: string;
  readonly mint: string;
}

/**
 * Pays a bolt11 invoice through linkshu Melt (quote, fee-inclusive swap,
 * melt, NUT-08 change persisted `accepted`) and resolves with the typed
 * outcome; a failed melt leaves the balance intact. Invalid mint/invoice
 * input and defects reject.
 */
export type MeltCashuInvoice = (
  args: MeltCashuInvoiceArgs,
) => Promise<Either.Either<MeltReceipt, MeltError>>;

export interface ProbeLightningFeeArgs {
  readonly mint: string;
  /** A different, Lightning-backed mint that issues the probe invoice. */
  readonly probeMint: string;
}

/**
 * Reads `mint`'s Lightning fee through linkshu FeeProbe; a day-fresh cached
 * result short-circuits the two quotes a live probe costs. Invalid mint
 * input and defects reject.
 */
export type ProbeLightningFee = (
  args: ProbeLightningFeeArgs,
) => Promise<Either.Either<LightningFeeProbeResult, FeeProbeError>>;

export interface StartCashuTopupArgs {
  readonly amountSat: number;
  readonly mint: string;
}

/**
 * A running topup: `quote` carries the invoice to display immediately;
 * `completion` resolves with the typed outcome once the invoice is paid and
 * the proofs are persisted, or once the mint itself retires the quote
 * (confirmed unpaid and expired). It rejects only when the runtime shuts
 * down mid-flight — the persisted quote then resumes on the next launch.
 */
export interface CashuTopupHandle {
  readonly quote: TopupQuote;
  readonly completion: Promise<Either.Either<TopupReceipt, TopupError>>;
}

/**
 * Creates a mint quote through linkshu Topup and keeps its settlement poll
 * running for the runtime's lifetime. Invalid mint/amount input and defects
 * reject.
 */
export type StartCashuTopup = (
  args: StartCashuTopupArgs,
) => Promise<Either.Either<CashuTopupHandle, MintUnreachable | MintRejected>>;

/**
 * Re-attaches every persisted pending topup (linkshu `Topup.resumePending`).
 * Records are retired only on the mint's own answer, never on local age.
 */
export type ResumePendingCashuTopups = () => Promise<
  ReadonlyArray<CashuTopupHandle>
>;

export interface AutoswapCashuArgs {
  readonly sourceMint: string;
  readonly targetMint: string;
}

/**
 * Consolidates `sourceMint`'s spendable balance into `targetMint` through
 * linkshu Autoswap: quote at the target, melt at the source, mint at the
 * target. The pending claim is persisted before the melt, so an interruption
 * anywhere after payment is recovered by `resumePendingClaims`. Invalid mint
 * input and defects reject.
 */
export type AutoswapCashu = (
  args: AutoswapCashuArgs,
) => Promise<Either.Either<AutoswapReceipt, AutoswapError>>;

/**
 * Drains every persisted pending autoswap claim (linkshu
 * `Autoswap.resumePendingClaims`). Records are retired only on the mint's
 * own answer, never on local age alone.
 */
export type ResumePendingCashuAutoswapClaims = () => Promise<
  ReadonlyArray<AutoswapClaimResult>
>;

/**
 * NUT-07 validation of every `accepted` row through linkshu `Validation`:
 * fully spent rows are marked `error` individually, partially spent rows
 * keep only their surviving proofs, and an unreachable mint leaves its rows
 * untouched (reported in `unavailableMints`). Only defects reject.
 */
export type CheckAllCashuTokens = () => Promise<ValidationReport>;

/**
 * NUT-07 check of a single stored row (`Validation.checkRow`); `unavailable`
 * means the mint gave no usable answer and nothing was changed.
 */
export type CheckCashuTokenRow = (
  rowId: string,
) => Promise<Either.Either<RowCheckResult, TokenRowNotFound>>;

/**
 * NUT-09 restore of deterministic proofs through linkshu `Restore` over the
 * given mints: restored proofs persist as `accepted` rows, and the restore
 * cursor and deterministic counter advance past the last signature found.
 * Invalid mint input and defects reject.
 */
export type RestoreCashuTokens = (
  mints: ReadonlyArray<string>,
) => Promise<RestoreReport>;

export type TokenTransitionError = TokenRowNotFound | InvalidTokenTransition;

/**
 * Lifecycle operations over stored token rows, keyed by the row id linkshu
 * reports (`String(CashuTokenId)`). Only typed failures come back as Left;
 * defects reject.
 */
export interface CashuTokenLifecycle {
  /** NUT-07 check of every `issued` row; claimed rows are removed. */
  readonly checkIssuedClaims: () => Promise<IssuedClaimReport>;
  /**
   * Removes `accepted` and `error` rows the mint confirms fully spent
   * (`Tokens.deleteSpent`) — including legacy plain-text error rows. An
   * unreachable mint keeps its rows.
   */
  readonly deleteSpent: () => Promise<ReadonlyArray<DeletedSpentToken>>;
  /**
   * Drops a row whose funds verifiably left the wallet (e.g. a `pending`
   * messenger send once the message is confirmed published). Not a state
   * transition — the handed-over encoding stays valid for its recipient.
   */
  readonly forget: (rowId: string) => Promise<void>;
  readonly markExternalized: (
    rowId: string,
  ) => Promise<Either.Either<void, TokenTransitionError>>;
  readonly markIssued: (
    rowId: string,
  ) => Promise<Either.Either<void, TokenTransitionError>>;
  readonly reserve: (
    rowId: string,
  ) => Promise<Either.Either<void, TokenTransitionError>>;
  /** Re-receives the row so any handed-out encoding dies at the mint. */
  readonly returnToWallet: (
    rowId: string,
  ) => Promise<
    Either.Either<ReceiveReceipt, ReceiveError | TokenTransitionError>
  >;
}

const decodeAutoswapDraft = Schema.decodeUnknownSync(AutoswapDraft);
const decodeSendDraft = Schema.decodeUnknownSync(SendDraft);
const decodeMeltDraft = Schema.decodeUnknownSync(MeltDraft);
const decodeFeeProbeDraft = Schema.decodeUnknownSync(FeeProbeDraft);
const decodeRestoreDraft = Schema.decodeUnknownSync(RestoreDraft);
const decodeTopupDraft = Schema.decodeUnknownSync(TopupDraft);

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
    // ONE-TIME MIGRATION — DELETE ME EVENTUALLY (see linkshuStorageMigration
    // .ts): runs before seed resolution, and the runtime only exists after
    // the resolved seed lands, so linkshu can never read a counter that
    // still lives under a legacy key.
    migrateLegacyCashuLocalState();
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

  /**
   * Topup polling fibers outlive the effect that started them but must die
   * with the runtime, so they run in one scope closed just before dispose.
   */
  const topupScope = React.useMemo(
    () => (linkshuRuntime === null ? null : Effect.runSync(Scope.make())),
    [linkshuRuntime],
  );

  React.useEffect(() => {
    if (linkshuRuntime === null || topupScope === null) return;
    return () => {
      void Effect.runPromise(Scope.close(topupScope, Exit.void)).then(() =>
        linkshuRuntime.dispose(),
      );
    };
  }, [linkshuRuntime, topupScope]);

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

  const sendCashuToken = React.useMemo<SendCashuToken | null>(() => {
    if (linkshuRuntime === null) return null;
    return ({ amountSat, mint, produceAs }) =>
      linkshuRuntime.runPromise(
        Effect.suspend(() => {
          const draft = decodeSendDraft({ amount: amountSat, mint, produceAs });
          return Effect.flatMap(Send, (send) => send.send(draft));
        }).pipe(Effect.either),
      );
  }, [linkshuRuntime]);

  const meltCashuInvoice = React.useMemo<MeltCashuInvoice | null>(() => {
    if (linkshuRuntime === null) return null;
    return ({ invoice, mint }) =>
      linkshuRuntime.runPromise(
        Effect.suspend(() => {
          const draft = decodeMeltDraft({ invoice, mint });
          return Effect.flatMap(Melt, (melt) => melt.melt(draft));
        }).pipe(Effect.either),
      );
  }, [linkshuRuntime]);

  const topupApi = React.useMemo(() => {
    if (linkshuRuntime === null || topupScope === null) return null;

    const toHandle = (handle: TopupHandle): CashuTopupHandle => {
      const completion = linkshuRuntime.runPromise(
        Effect.either(handle.result),
      );
      // Rejection means the runtime shut down mid-poll; an unwatched handle
      // must not surface that as an unhandled rejection.
      completion.catch(() => {});
      return { quote: handle.quote, completion };
    };

    const start: StartCashuTopup = ({ amountSat, mint }) =>
      linkshuRuntime.runPromise(
        Effect.suspend(() => {
          const draft = decodeTopupDraft({ mint, amount: amountSat });
          return Effect.flatMap(Topup, (topup) =>
            Scope.extend(topup.start(draft), topupScope),
          );
        }).pipe(Effect.map(toHandle), Effect.either),
      );

    const resumePending: ResumePendingCashuTopups = () =>
      linkshuRuntime.runPromise(
        Effect.flatMap(Topup, (topup) =>
          Scope.extend(topup.resumePending, topupScope),
        ).pipe(Effect.map((handles) => handles.map(toHandle))),
      );

    return { start, resumePending };
  }, [linkshuRuntime, topupScope]);

  const autoswapApi = React.useMemo(() => {
    if (linkshuRuntime === null) return null;

    const claim: AutoswapCashu = ({ sourceMint, targetMint }) =>
      linkshuRuntime.runPromise(
        Effect.suspend(() => {
          const draft = decodeAutoswapDraft({ sourceMint, targetMint });
          return Effect.flatMap(Autoswap, (autoswap) => autoswap.claim(draft));
        }).pipe(Effect.either),
      );

    const resumePendingClaims: ResumePendingCashuAutoswapClaims = () =>
      linkshuRuntime.runPromise(
        Effect.flatMap(Autoswap, (autoswap) => autoswap.resumePendingClaims),
      );

    return { claim, resumePendingClaims };
  }, [linkshuRuntime]);

  const probeLightningFee = React.useMemo<ProbeLightningFee | null>(() => {
    if (linkshuRuntime === null) return null;
    return ({ mint, probeMint }) =>
      linkshuRuntime.runPromise(
        Effect.suspend(() => {
          const draft = decodeFeeProbeDraft({ mint, probeMint });
          return Effect.flatMap(FeeProbe, (feeProbe) =>
            feeProbe.probeLightningFee(draft),
          );
        }).pipe(Effect.either),
      );
  }, [linkshuRuntime]);

  const checkAllCashuTokens = React.useMemo<CheckAllCashuTokens | null>(() => {
    if (linkshuRuntime === null) return null;
    return () =>
      linkshuRuntime.runPromise(
        Effect.flatMap(Validation, (validation) => validation.checkAll),
      );
  }, [linkshuRuntime]);

  const checkCashuTokenRow = React.useMemo<CheckCashuTokenRow | null>(() => {
    if (linkshuRuntime === null) return null;
    return (rowId) =>
      linkshuRuntime.runPromise(
        Effect.flatMap(Validation, (validation) =>
          validation.checkRow(TokenRowId.make(rowId)),
        ).pipe(Effect.either),
      );
  }, [linkshuRuntime]);

  const restoreCashuTokens = React.useMemo<RestoreCashuTokens | null>(() => {
    if (linkshuRuntime === null) return null;
    return (mints) =>
      linkshuRuntime.runPromise(
        Effect.suspend(() => {
          const draft = decodeRestoreDraft({ mints });
          return Effect.flatMap(Restore, (restore) => restore.restore(draft));
        }),
      );
  }, [linkshuRuntime]);

  const cashuTokenLifecycle = React.useMemo<CashuTokenLifecycle | null>(() => {
    if (linkshuRuntime === null) return null;
    const rowId = (id: string) => TokenRowId.make(id);
    return {
      checkIssuedClaims: () =>
        linkshuRuntime.runPromise(
          Effect.flatMap(Validation, (validation) => validation.checkIssued),
        ),
      deleteSpent: () =>
        linkshuRuntime.runPromise(
          Effect.flatMap(Tokens, (tokens) => tokens.deleteSpent),
        ),
      forget: (id) =>
        linkshuRuntime.runPromise(
          Effect.flatMap(TokenStore, (store) => store.remove(rowId(id))),
        ),
      markExternalized: (id) =>
        linkshuRuntime.runPromise(
          Effect.flatMap(Tokens, (tokens) =>
            tokens.markExternalized(rowId(id)),
          ).pipe(Effect.either),
        ),
      markIssued: (id) =>
        linkshuRuntime.runPromise(
          Effect.flatMap(Tokens, (tokens) => tokens.markIssued(rowId(id))).pipe(
            Effect.either,
          ),
        ),
      reserve: (id) =>
        linkshuRuntime.runPromise(
          Effect.flatMap(Tokens, (tokens) => tokens.reserve(rowId(id))).pipe(
            Effect.either,
          ),
        ),
      returnToWallet: (id) =>
        linkshuRuntime.runPromise(
          Effect.flatMap(Tokens, (tokens) =>
            tokens.returnToWallet(rowId(id)),
          ).pipe(Effect.either),
        ),
    };
  }, [linkshuRuntime]);

  return {
    autoswapCashu: autoswapApi?.claim ?? null,
    cashuTokenLifecycle,
    checkAllCashuTokens,
    checkCashuTokenRow,
    linkshuRuntime,
    meltCashuInvoice,
    probeLightningFee,
    receiveCashuToken,
    restoreCashuTokens,
    resumePendingCashuAutoswapClaims: autoswapApi?.resumePendingClaims ?? null,
    resumePendingCashuTopups: topupApi?.resumePending ?? null,
    sendCashuToken,
    startCashuTopup: topupApi?.start ?? null,
    walletBalances: readModel.balances,
    walletTokens: readModel.tokens,
  };
};
