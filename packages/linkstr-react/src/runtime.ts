import { Atom } from "@effect-atom/atom-react";
import {
  BankOffers,
  Chat,
  Inspector,
  inspectTransport,
  LinkstrIdentity,
  MuteList,
  NostrTransportSimplePool,
  observeTransport,
  Outbox,
  OutboxStore,
  PaymentNotices,
  Profiles,
  ProfileWatch,
  Reactions,
  RelayHealth,
  RelayLists,
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
    // Both decorators are transparent taps over the same raw transport:
    // health folds connection state, the inspector streams diagnostics.
    inspectTransport(
      observeTransport(config.transport ?? NostrTransportSimplePool),
    ),
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
        Layer.mergeAll(
          BankOffers.Default,
          Chat.Default,
          Outbox.Default.pipe(
            Layer.provide([
              Chat.Default,
              Reactions.Default,
              config.outboxStore ?? OutboxStore.inMemory,
            ]),
          ),
          PaymentNotices.Default,
          Reactions.Default,
          WrapInbox.Default,
          Profiles.Default,
          ProfileWatch.Default,
          RelayLists.Default,
          MuteList.Default,
        ).pipe(
          Layer.provideMerge(baseServices(config)),
          Layer.provideMerge(
            config.inspector === true ? Inspector.live : Inspector.disabled,
          ),
          // Unlike the inspector, relay health is not dev-gated: it is the
          // production source of the relay settings status UI.
          Layer.provideMerge(RelayHealth.live),
        ),
      );
});
