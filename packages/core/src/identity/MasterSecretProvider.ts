import { Context, Effect, Layer } from "effect";
import type { MasterSecret, Slip39Passphrase, Slip39Share } from "./domain";
import {
  IdentityUtilsError,
  parseSlip39Passphrase,
  parseSlip39Share,
  recoverMasterSecretFromSlip39Share,
  recoverMasterSecretFromSlip39Shares,
} from "./utils";

export class MasterSecretProvider extends Context.Tag("MasterSecretProvider")<
  MasterSecretProvider,
  MasterSecret
>() {
  static make(masterSecret: MasterSecret): Layer.Layer<MasterSecretProvider> {
    return Layer.succeed(MasterSecretProvider, masterSecret);
  }

  static fromSlip39Share(
    share: Slip39Share,
    passphrase?: Slip39Passphrase,
  ): Layer.Layer<MasterSecretProvider, IdentityUtilsError> {
    return Layer.effect(
      MasterSecretProvider,
      recoverMasterSecretFromSlip39Share(share, passphrase),
    );
  }

  static fromSlip39Shares(
    shares: ReadonlyArray<Slip39Share>,
    passphrase?: Slip39Passphrase,
  ): Layer.Layer<MasterSecretProvider, IdentityUtilsError> {
    return Layer.effect(
      MasterSecretProvider,
      recoverMasterSecretFromSlip39Shares(shares, passphrase),
    );
  }

  static fromSlip39RawShare(
    share: string,
    passphrase = "",
  ): Layer.Layer<MasterSecretProvider, IdentityUtilsError> {
    return Layer.effect(
      MasterSecretProvider,
      Effect.gen(function* () {
        const parsedShare = yield* parseSlip39Share(share);
        const parsedPassphrase = yield* parseSlip39Passphrase(passphrase);
        return yield* recoverMasterSecretFromSlip39Share(
          parsedShare,
          parsedPassphrase,
        );
      }),
    );
  }
}
