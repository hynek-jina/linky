import { Atom } from "@effect-atom/atom-react";
import {
  LinkstrIdentity,
  NostrTransportSimplePool,
  Reactions,
  RelayPolicy,
} from "@linky/linkstr";
import { Layer } from "effect";
import type { LinkstrConfig } from "./config";
import { linkstrConfigAtom } from "./config";
import { LinkstrNotConfigured } from "./errors";

const baseServices = (config: LinkstrConfig) =>
  Layer.mergeAll(
    LinkstrIdentity.fromSecretKey(config.secretKey),
    RelayPolicy.fixed({
      readRelays: config.readRelays,
      writeRelays: config.writeRelays,
    }),
    config.transport ?? NostrTransportSimplePool,
  );

/**
 * Rebuilds whenever `linkstrConfigAtom` changes, finalizing the previous
 * runtime's scope (and with it the relay pool). Base services stay merged in
 * so future verticals can hang their fn atoms off this runtime too.
 */
export const linkstrRuntimeAtom = Atom.runtime((get) => {
  const config = get(linkstrConfigAtom);
  return config === null
    ? Layer.fail(new LinkstrNotConfigured())
    : Reactions.Default.pipe(Layer.provideMerge(baseServices(config)));
});
