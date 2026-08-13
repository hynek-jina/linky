import { Atom } from "@effect-atom/atom-react";
import {
  Inspector,
  inspectTransport,
  LinkstrIdentity,
  NostrTransportSimplePool,
  Reactions,
  RelayPolicy,
  WrapInbox,
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
    inspectTransport(config.transport ?? NostrTransportSimplePool),
  );

/**
 * Rebuilds whenever `linkstrConfigAtom` changes, finalizing the previous
 * runtime's scope (and with it the relay pool). Base services stay merged in
 * so future verticals can hang their fn atoms off this runtime too.
 *
 * `Layer.fresh` is load-bearing: the service layers are stable references,
 * and Atom.runtime's shared memo map would otherwise reuse instances built
 * for a previous config (a race on identity switch).
 */
export const linkstrRuntimeAtom = Atom.runtime((get) => {
  const config = get(linkstrConfigAtom);
  return config === null
    ? Layer.fail(new LinkstrNotConfigured())
    : Layer.fresh(
        Layer.mergeAll(Reactions.Default, WrapInbox.Default).pipe(
          Layer.provideMerge(baseServices(config)),
          Layer.provideMerge(
            config.inspector === true ? Inspector.live : Inspector.disabled,
          ),
        ),
      );
});
