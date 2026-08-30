import { Effect } from "effect";
import type { Layer } from "effect";
import { linkshuServices } from "./composition";
import type { LinkshuServices } from "./composition";
import type { Bip39Seed } from "./domain/primitives";
import type { KeyValueStore } from "./ports/KeyValueStore";
import type { TokenStore } from "./ports/TokenStore";

export interface LinkshuHeadlessConfig {
  readonly bip39Seed: Bip39Seed;
  /** Omitting the stores runs on non-durable in-memory defaults. */
  readonly keyValueStore?: Layer.Layer<KeyValueStore> | undefined;
  readonly tokenStore?: Layer.Layer<TokenStore> | undefined;
}

/**
 * Promise-facing one-shot runner for non-React/non-Effect callers (the CLI
 * wallet, scripts, tests): builds the services fresh, runs the effect, and
 * tears everything down again.
 */
export const runLinkshu = <A, E>(
  config: LinkshuHeadlessConfig,
  effect: Effect.Effect<A, E, LinkshuServices>,
): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, linkshuServices(config)));
