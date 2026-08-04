import type { Wallet } from "@cashu/cashu-ts";
import { emitInspectorEvent, isInspectorEnabled } from "./inspectorBus";

// The bolt11/bolt12/onchain variants all funnel through these base methods on
// the Wallet instance, so shadowing them with own-property wrappers captures
// every mint API operation.
const INSTRUMENTED_WALLET_METHODS = [
  "receive",
  "send",
  "sendOffline",
  "restore",
  "batchRestore",
  "checkProofsStates",
  "createMintQuote",
  "checkMintQuote",
  "mintProofs",
  "createMeltQuote",
  "checkMeltQuote",
  "meltProofs",
];

let nextCallId = 1;

const emitCallResult = (args: {
  callId: number;
  method: string;
  mintUrl: string;
  startedAtMs: number;
  outcome: "ok" | "FAILED";
  payload: Record<string, unknown>;
}): void => {
  emitInspectorEvent({
    channel: "cashu",
    type: `wallet.${args.method}.result`,
    direction: "in",
    summary: `${args.method} ${args.outcome} ← ${args.mintUrl} (${Date.now() - args.startedAtMs} ms)`,
    data: { callId: args.callId, mintUrl: args.mintUrl, ...args.payload },
  });
};

const wrapWalletMethod = (
  wallet: Wallet,
  method: string,
  mintUrl: string,
): void => {
  const original: unknown = Reflect.get(wallet, method);
  if (typeof original !== "function") return;

  // Reflection boundary: forwards whatever arity the wallet method has.
  // eslint-disable-next-line no-restricted-syntax
  const wrapped = (...args: unknown[]): unknown => {
    const callId = nextCallId++;
    const startedAtMs = Date.now();
    emitInspectorEvent({
      channel: "cashu",
      type: `wallet.${method}`,
      direction: "out",
      summary: `${method} → ${mintUrl}`,
      data: { callId, mintUrl, args },
    });

    let result: unknown;
    try {
      result = Reflect.apply(original, wallet, args);
    } catch (error) {
      emitCallResult({
        callId,
        method,
        mintUrl,
        startedAtMs,
        outcome: "FAILED",
        payload: { error },
      });
      throw error;
    }

    if (result instanceof Promise) {
      return result.then(
        (value: unknown) => {
          emitCallResult({
            callId,
            method,
            mintUrl,
            startedAtMs,
            outcome: "ok",
            payload: { result: value },
          });
          return value;
        },
        (error: unknown) => {
          emitCallResult({
            callId,
            method,
            mintUrl,
            startedAtMs,
            outcome: "FAILED",
            payload: { error },
          });
          throw error;
        },
      );
    }

    emitCallResult({
      callId,
      method,
      mintUrl,
      startedAtMs,
      outcome: "ok",
      payload: { result },
    });
    return result;
  };

  Reflect.set(wallet, method, wrapped);
};

export const instrumentCashuWallet = (
  wallet: Wallet,
  mintUrl: string,
): Wallet => {
  if (!isInspectorEnabled()) return wallet;
  for (const method of INSTRUMENTED_WALLET_METHODS) {
    wrapWalletMethod(wallet, method, mintUrl);
  }
  return wallet;
};
