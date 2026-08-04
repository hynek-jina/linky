import { getPublicKey } from "nostr-tools";
import { isInspectorEnabled } from "./inspectorBus";

// Purpose tags for Nostr events. Gift wraps are opaque on the wire, so the
// pool tap alone cannot say what one is for. Call sites that see the
// plaintext (wrap creation, inbox decrypt) register a human label by event
// id here; the tap attaches it to inspector summaries.

const MAX_TAGGED_EVENTS = 2000;

const intentByEventId = new Map<string, string>();

export const tagNostrEventIntent = (eventId: string, intent: string): void => {
  if (!isInspectorEnabled() || !eventId) return;
  intentByEventId.delete(eventId);
  intentByEventId.set(eventId, intent);
  if (intentByEventId.size > MAX_TAGGED_EVENTS) {
    const oldest = intentByEventId.keys().next().value;
    if (oldest !== undefined) intentByEventId.delete(oldest);
  }
};

export const getNostrEventIntent = (eventId: string): string | undefined => {
  return intentByEventId.get(eventId);
};

interface WrappedRumorLike {
  kind?: number;
  content?: string;
  tags?: string[][];
}

const hasEditedFromTag = (tags: string[][] | undefined): boolean => {
  return (tags ?? []).some((tag) => tag[0] === "edited_from");
};

const describeWrappedPayload = (rumor: WrappedRumorLike): string => {
  switch (rumor.kind) {
    case 14:
      if (String(rumor.content ?? "").startsWith("cashu")) {
        return "Cashu token payment";
      }
      return hasEditedFromTag(rumor.tags) ? "message edit" : "chat message";
    case 15:
      return "image message";
    case 7:
      return "reaction";
    case 5:
      return "deletion";
    case 24133:
      return "payment notice";
    case 24134:
      return "payment telemetry";
    default:
      return `kind ${String(rumor.kind ?? "?")} payload`;
  }
};

export const tagOutgoingWrapIntent = (args: {
  wrapId: string;
  rumor: WrappedRumorLike;
  senderPrivateKey: Uint8Array;
  recipientPublicKey: string;
}): void => {
  if (!isInspectorEnabled()) return;
  const payload = describeWrappedPayload(args.rumor);
  const recipientIsSelf =
    getPublicKey(args.senderPrivateKey) === args.recipientPublicKey;
  tagNostrEventIntent(
    args.wrapId,
    recipientIsSelf
      ? `${payload} copy for my devices`
      : `${payload} for the contact`,
  );
};

export const tagIncomingWrapIntent = (args: {
  wrapId: string;
  rumor: WrappedRumorLike & { pubkey?: string };
  myPubkey: string;
}): void => {
  if (!isInspectorEnabled()) return;
  const payload = describeWrappedPayload(args.rumor);
  tagNostrEventIntent(
    args.wrapId,
    args.rumor.pubkey === args.myPubkey
      ? `${payload} copy for my devices`
      : `${payload} from the contact`,
  );
};
