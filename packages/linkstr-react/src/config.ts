import { Atom } from "@effect-atom/atom-react";
import type { NostrSecretKey, NostrTransport, RelayUrl } from "@linky/linkstr";
import type { Layer } from "effect";

export interface LinkstrConfig {
  readonly secretKey: NostrSecretKey;
  readonly readRelays: ReadonlyArray<RelayUrl>;
  readonly writeRelays: ReadonlyArray<RelayUrl>;
  /** Test/e2e seam: replaces the real websocket transport when provided. */
  readonly transport?: Layer.Layer<NostrTransport>;
}

/** Null while logged out; every linkstr action then fails with LinkstrNotConfigured. */
export const linkstrConfigAtom = Atom.make<LinkstrConfig | null>(null);
