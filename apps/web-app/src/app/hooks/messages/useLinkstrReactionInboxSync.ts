import { UnixSeconds } from "@linky/linkstr";
import type {
  OwnReactionConfirmed,
  ReactionAdded,
  WrapInboxEvent,
} from "@linky/linkstr";
import {
  useAtomMount,
  useAtomSet,
  wrapInboxAtom,
  wrapInboxHandlerAtom,
} from "@linky/linkstr-react";
import { getPublicKey, nip19 } from "nostr-tools";
import React from "react";
import { BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY } from "../../../utils/constants";
import {
  getInitialNostrIdentitySource,
  getInitialNostrIdentitySwitchedAtSec,
  safeLocalStorageGetJson,
} from "../../../utils/storage";
import type {
  LocalNostrMessage,
  LocalNostrReaction,
  NewLocalNostrReaction,
  UpdateLocalNostrReaction,
} from "../../types/appTypes";
import { normalizePubkeyHex } from "./contactIdentity";

// Mirrors the legacy inbox backfill window; a persisted cursor replaces this
// in #243.
const INBOX_BACKFILL_SINCE_SEC = 3 * 24 * 60 * 60;

const MAX_DEFERRED_REACTIONS = 100;

type DeferrableReactionEvent = ReactionAdded | OwnReactionConfirmed;

export interface ReactionInboxSessionState {
  deferredReactions: Map<string, DeferrableReactionEvent>;
  /** reactionId → retractor. Suppression is authorship-scoped: a peer's
   * retraction must not block reactions they did not author. */
  retractedReactions: Map<string, string>;
}

export const createReactionInboxSessionState =
  (): ReactionInboxSessionState => ({
    deferredReactions: new Map(),
    retractedReactions: new Map(),
  });

export interface ReactionInboxContext {
  appendLocalNostrReaction: (reaction: NewLocalNostrReaction) => string;
  identitySinceSec: number | null;
  isBlockedPubkey: (pubkey: string) => boolean;
  /** Every stored reaction wrapId, including soft-deleted rows. */
  knownReactionWrapIds: ReadonlySet<string>;
  messages: readonly LocalNostrMessage[];
  myPubkey: string;
  /** Live (non-deleted) reaction rows. */
  reactions: readonly LocalNostrReaction[];
  softDeleteLocalNostrReactionsByWrapIds: (wrapIds: readonly string[]) => void;
  state: ReactionInboxSessionState;
  updateLocalNostrReaction: UpdateLocalNostrReaction;
}

const trimmed = (value: string | null | undefined): string =>
  (value ?? "").trim();

const reactorOf = (
  event: DeferrableReactionEvent,
  ctx: ReactionInboxContext,
): string => (event._tag === "ReactionAdded" ? event.from : ctx.myPubkey);

const applyReaction = (
  event: DeferrableReactionEvent,
  ctx: ReactionInboxContext,
): "done" | "deferred" => {
  const reactorPubkey = reactorOf(event, ctx);
  if (event._tag === "ReactionAdded" && ctx.isBlockedPubkey(event.from)) {
    return "done";
  }
  if (ctx.identitySinceSec !== null && event.sentAt < ctx.identitySinceSec) {
    return "done";
  }
  if (ctx.state.retractedReactions.get(event.reactionId) === reactorPubkey) {
    return "done";
  }

  const rowByWrapId = ctx.reactions.find(
    (row) => trimmed(row.wrapId) === event.reactionId,
  );
  if (rowByWrapId) {
    if ((rowByWrapId.status ?? "sent") === "pending") {
      ctx.updateLocalNostrReaction(rowByWrapId.id, { status: "sent" });
    }
    return "done";
  }
  // Soft-deleted rows are absent from `reactions` but keep their wrapId here.
  if (ctx.knownReactionWrapIds.has(event.reactionId)) return "done";

  const clientId =
    event._tag === "OwnReactionConfirmed" ? event.clientId : null;
  if (clientId !== null) {
    const rowByClientId = ctx.reactions.find(
      (row) => trimmed(row.clientId) === clientId,
    );
    if (rowByClientId) {
      ctx.updateLocalNostrReaction(rowByClientId.id, {
        emoji: event.emoji,
        messageId: event.target,
        reactorPubkey,
        status: "sent",
        wrapId: event.reactionId,
      });
      return "done";
    }
  }

  const isDuplicate = ctx.reactions.some(
    (row) =>
      trimmed(row.messageId) === event.target &&
      trimmed(row.reactorPubkey) === reactorPubkey &&
      trimmed(row.emoji) === event.emoji,
  );
  if (isDuplicate) return "done";

  const targetIsLocal = ctx.messages.some(
    (message) => trimmed(message.rumorId) === event.target,
  );
  if (!targetIsLocal) return "deferred";

  ctx.appendLocalNostrReaction({
    createdAtSec: event.sentAt,
    emoji: event.emoji,
    messageId: event.target,
    reactorPubkey,
    status: "sent",
    wrapId: event.reactionId,
    ...(clientId !== null ? { clientId } : {}),
  });
  return "done";
};

const deferReaction = (
  state: ReactionInboxSessionState,
  event: DeferrableReactionEvent,
): void => {
  state.deferredReactions.set(event.reactionId, event);
  if (state.deferredReactions.size <= MAX_DEFERRED_REACTIONS) return;
  const oldestReactionId = state.deferredReactions.keys().next().value;
  if (oldestReactionId !== undefined) {
    state.deferredReactions.delete(oldestReactionId);
  }
};

const applyRetraction = (
  reactionIds: readonly string[],
  retractor: string,
  ctx: ReactionInboxContext,
): void => {
  const ownedIds: string[] = [];
  for (const reactionId of reactionIds) {
    ctx.state.retractedReactions.set(reactionId, retractor);
    const deferred = ctx.state.deferredReactions.get(reactionId);
    if (deferred !== undefined && reactorOf(deferred, ctx) === retractor) {
      ctx.state.deferredReactions.delete(reactionId);
    }
    const owned = ctx.reactions.some(
      (row) =>
        trimmed(row.wrapId) === reactionId &&
        trimmed(row.reactorPubkey) === retractor,
    );
    if (owned) ownedIds.push(reactionId);
  }
  if (ownedIds.length > 0) {
    ctx.softDeleteLocalNostrReactionsByWrapIds(ownedIds);
  }
};

export const processReactionInboxEvent = (
  event: WrapInboxEvent,
  ctx: ReactionInboxContext,
): void => {
  switch (event._tag) {
    case "ReactionAdded":
    case "OwnReactionConfirmed":
      if (applyReaction(event, ctx) === "deferred") {
        deferReaction(ctx.state, event);
      }
      return;
    case "ReactionRetracted":
      applyRetraction(event.reactionIds, event.from, ctx);
      return;
    case "OwnRetractionConfirmed":
      applyRetraction(event.reactionIds, ctx.myPubkey, ctx);
      return;
    case "WrapDropped":
      return;
  }
};

export const retryDeferredReactions = (ctx: ReactionInboxContext): void => {
  if (ctx.state.deferredReactions.size === 0) return;
  const pending = [...ctx.state.deferredReactions.values()];
  ctx.state.deferredReactions.clear();
  for (const event of pending) {
    if (applyReaction(event, ctx) === "deferred") {
      deferReaction(ctx.state, event);
    }
  }
};

const isBlockedPubkey = (pubkey: string): boolean => {
  const normalizedPubkey = normalizePubkeyHex(pubkey);
  if (!normalizedPubkey) return false;
  return safeLocalStorageGetJson(BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY, [])
    .map(normalizePubkeyHex)
    .filter((entry): entry is string => Boolean(entry))
    .includes(normalizedPubkey);
};

const deriveMyPubkey = (currentNsec: string | null): string | null => {
  if (!currentNsec) return null;
  try {
    const decoded = nip19.decode(currentNsec.trim());
    if (decoded.type !== "nsec") return null;
    return getPublicKey(decoded.data);
  } catch {
    return null;
  }
};

interface UseLinkstrReactionInboxSyncParams {
  appendLocalNostrReaction: (reaction: NewLocalNostrReaction) => string;
  currentNsec: string | null;
  enabled: boolean;
  nostrMessagesLocal: readonly LocalNostrMessage[];
  nostrReactionWrapIdsRef: React.MutableRefObject<Set<string>>;
  nostrReactionsLocal: readonly LocalNostrReaction[];
  softDeleteLocalNostrReactionsByWrapIds: (wrapIds: readonly string[]) => void;
  updateLocalNostrReaction: UpdateLocalNostrReaction;
}

/** Applies typed reaction inbox events from the linkstr `WrapInbox` to the
 * local reaction rows. */
export const useLinkstrReactionInboxSync = ({
  appendLocalNostrReaction,
  currentNsec,
  enabled,
  nostrMessagesLocal,
  nostrReactionWrapIdsRef,
  nostrReactionsLocal,
  softDeleteLocalNostrReactionsByWrapIds,
  updateLocalNostrReaction,
}: UseLinkstrReactionInboxSyncParams) => {
  const setWrapInboxHandler = useAtomSet(wrapInboxHandlerAtom);
  useAtomMount(wrapInboxAtom);

  const myPubkey = React.useMemo(
    () => deriveMyPubkey(currentNsec),
    [currentNsec],
  );

  const sessionStateRef = React.useRef(createReactionInboxSessionState());
  const identitySinceSecRef = React.useRef<number | null>(null);

  const buildContext = (): ReactionInboxContext | null =>
    myPubkey === null
      ? null
      : {
          appendLocalNostrReaction,
          identitySinceSec: identitySinceSecRef.current,
          isBlockedPubkey,
          knownReactionWrapIds: nostrReactionWrapIdsRef.current,
          messages: nostrMessagesLocal,
          myPubkey,
          reactions: nostrReactionsLocal,
          softDeleteLocalNostrReactionsByWrapIds,
          state: sessionStateRef.current,
          updateLocalNostrReaction,
        };
  const buildContextRef = React.useRef(buildContext);
  React.useEffect(() => {
    buildContextRef.current = buildContext;
  });

  React.useEffect(() => {
    if (!enabled || !currentNsec || myPubkey === null) return;
    sessionStateRef.current = createReactionInboxSessionState();
    identitySinceSecRef.current =
      getInitialNostrIdentitySource() === "custom"
        ? getInitialNostrIdentitySwitchedAtSec()
        : null;
    // One handler object per identity session: a handler swap reopens the
    // relay subscriptions, so per-render state is reached through a ref.
    setWrapInboxHandler({
      since: UnixSeconds.make(
        Math.floor(Date.now() / 1e3) - INBOX_BACKFILL_SINCE_SEC,
      ),
      onEvent: (event) => {
        const ctx = buildContextRef.current();
        if (ctx) processReactionInboxEvent(event, ctx);
      },
    });
    return () => setWrapInboxHandler(null);
  }, [currentNsec, enabled, myPubkey, setWrapInboxHandler]);

  React.useEffect(() => {
    const ctx = buildContextRef.current();
    if (ctx) retryDeferredReactions(ctx);
  }, [nostrMessagesLocal]);
};
