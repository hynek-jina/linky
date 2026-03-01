import { Context, Layer } from "effect";
import type { MasterSecret } from "./domain";

export class MasterSecretProvider extends Context.Tag("MasterSecretProvider")<
  MasterSecretProvider,
  MasterSecret
>() {
  static make(masterSecret: MasterSecret): Layer.Layer<MasterSecretProvider> {
    return Layer.succeed(MasterSecretProvider, masterSecret);
  }
}
