import type { JsonRecord, JsonValue } from "../types/json";
import type { InspectorEvent } from "./inspectorEvents";

// Human vocabulary for inspector events: Nostr kind names used in tap
// summaries, plus per-event explanations shown by the inspector UI.

const NOSTR_KIND_NAMES: Record<number, string> = {
  0: "profile",
  1: "note",
  3: "follows",
  4: "legacy DM",
  5: "delete",
  6: "repost",
  7: "reaction",
  14: "chat message",
  1059: "gift wrap",
  9735: "zap receipt",
  10000: "mute list",
  10002: "relay list",
  10050: "DM inbox relays",
  24133: "payment notice",
  24134: "telemetry",
  27235: "auth proof",
  30315: "status",
};

export const nostrKindLabel = (kind: number): string => {
  const name = NOSTR_KIND_NAMES[kind];
  return name ? `${name} (${kind})` : `kind ${kind}`;
};

export const nostrKindsLabel = (
  kinds: readonly number[] | undefined,
): string => {
  if (!kinds || kinds.length === 0) return "any kind";
  return kinds.map(nostrKindLabel).join(", ");
};

const NOSTR_KIND_EXPLANATIONS: Record<number, string> = {
  0: "Profile metadata: display name, picture, and lightning address. Linky publishes it on onboarding/profile edits and queries it to show contact names and avatars.",
  1059: "NIP-59 gift wrap: an encrypted envelope that hides sender and content. Linky delivers chat messages, Cashu token payments, payment requests, and payment notices this way. Outer timestamps are randomized up to 2 days back, so inbox sync re-queries a 3-day window and the same wraps legitimately reappear on every refresh.",
  10000:
    "Mute list: published when the user blocks a pubkey so other clients can honor the block.",
  10002:
    "NIP-65 relay list: announces which relays this user writes to and reads from.",
  10050:
    "NIP-17 DM inbox relay list: tells other clients where to deliver gift-wrapped DMs for this user.",
  24133:
    "Linky payment notice: a notify-only wrapped event sent alongside a Cashu payment; it triggers the 'You received money' notification and is never stored as a chat message.",
  24134:
    "Linky anonymous payment telemetry, sent from a one-off ephemeral key.",
  27235:
    "HTTP auth proof used by the push service to verify pubkey ownership on subscribe/unsubscribe.",
  30315:
    "NIP-38 user status: Linky stores the exchange-currency status shown next to contact names.",
  9735: "Zap receipt: proof of a Lightning zap payment.",
  7: "Reaction to a message (emoji).",
  14: "Unsigned chat message rumor — normally only seen inside a decrypted gift wrap.",
};

const isJsonRecord = (value: JsonValue | undefined): value is JsonRecord => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const readRecord = (
  record: JsonRecord | undefined,
  key: string,
): JsonRecord | undefined => {
  const value = record?.[key];
  return isJsonRecord(value) ? value : undefined;
};

const readNumber = (
  record: JsonRecord | undefined,
  key: string,
): number | undefined => {
  const value = record?.[key];
  return typeof value === "number" ? value : undefined;
};

const readNumberArray = (
  record: JsonRecord | undefined,
  key: string,
): number[] | undefined => {
  const value = record?.[key];
  if (!Array.isArray(value)) return undefined;
  const numbers = value.filter((entry) => typeof entry === "number");
  return numbers.length > 0 ? numbers : undefined;
};

const nostrEventKind = (event: InspectorEvent): number | undefined => {
  const data = isJsonRecord(event.data) ? event.data : undefined;
  return (
    readNumber(readRecord(data, "event"), "kind") ?? readNumber(data, "kind")
  );
};

const nostrFilterKinds = (event: InspectorEvent): number[] | undefined => {
  const data = isJsonRecord(event.data) ? event.data : undefined;
  return readNumberArray(readRecord(data, "filter"), "kinds");
};

const describeNostr = (event: InspectorEvent): string => {
  const kindLines = (kinds: readonly number[] | undefined): string => {
    if (!kinds) return "";
    const explanations = [...new Set(kinds)]
      .map((kind) => {
        const explanation = NOSTR_KIND_EXPLANATIONS[kind];
        return explanation ? `${nostrKindLabel(kind)}: ${explanation}` : null;
      })
      .filter((line): line is string => line !== null);
    return explanations.length > 0 ? `\n\n${explanations.join("\n")}` : "";
  };

  const eventKind = nostrEventKind(event);
  const eventKinds = eventKind === undefined ? undefined : [eventKind];

  switch (event.type) {
    case "publish":
      return `Outgoing: the app signed this event and handed it to the listed relays.${kindLines(eventKinds)}`;
    case "publish.result":
      return "Per-relay acknowledgement (ok/failed) for the publish with the same event id.";
    case "query":
      return `One-off fetch of stored events matching a filter; relays return what they have, then the query ends. Repeated backfills often return the same events again — that is expected, dedupe happens in the app.${kindLines(nostrFilterKinds(event))}`;
    case "subscribe":
      return `Opened a live subscription; matching events stream in as "event" rows until it closes.${kindLines(nostrFilterKinds(event))}`;
    case "subscribe.closed":
      return "A live subscription ended (navigation, cleanup, or relay disconnect).";
    case "event":
      return `Delivered live by an open subscription.${kindLines(eventKinds)}`;
    case "inspector.dropped":
      return "The inspector bus dropped events under backpressure — the stream has a gap here.";
    default:
      return "Nostr relay traffic.";
  }
};

const WALLET_METHOD_EXPLANATIONS: Record<string, string> = {
  receive:
    "Redeem a Cashu token: its proofs are swapped at the mint for fresh proofs owned by this wallet.",
  send: "Select and split proofs so an exact amount can be handed over; usually involves a swap at the mint.",
  sendOffline: "Select proofs for an exact amount without contacting the mint.",
  restore:
    "Recover deterministically derived proofs from the mint for a counter range (wallet restore).",
  batchRestore:
    "Scan the mint for recoverable deterministic proofs in batches (wallet restore).",
  checkProofsStates:
    "Ask the mint whether proofs are unspent, pending, or spent — used by token validation sweeps.",
  createMintQuote:
    "Ask the mint for a Lightning invoice to buy new tokens (wallet top-up).",
  checkMintQuote:
    "Poll whether a top-up invoice was paid so the tokens can be claimed.",
  mintProofs:
    "Claim the newly minted proofs after the top-up invoice was paid.",
  createMeltQuote:
    "Ask the mint for a quote to pay a Lightning invoice with tokens (melt).",
  checkMeltQuote: "Poll the state of a pending melt (Lightning payment).",
  meltProofs:
    "Pay the Lightning invoice: hand proofs to the mint, receive change proofs back.",
};

const describeCashu = (event: InspectorEvent): string => {
  const method = event.type.replace(/^wallet\./, "").replace(/\.result$/, "");
  const explanation =
    WALLET_METHOD_EXPLANATIONS[method] ?? "Cashu wallet operation.";
  return event.type.endsWith(".result")
    ? `Result of the ${method} call with the same callId. ${explanation}`
    : explanation;
};

const describeEvolu = (event: InspectorEvent): string => {
  if (event.type === "history.changed") {
    return "The local CRDT history changed: either a mutation shown above, or changes applied from another device via Evolu sync (this tick is the only signal for synced-in writes).";
  }
  const data = isJsonRecord(event.data) ? event.data : undefined;
  const table = typeof data?.table === "string" ? data.table : "a table";
  const verb = event.type.replace(/^mutation\./, "");
  return `Local-first ${verb} into the Evolu SQLite table "${table}". Written locally first, then synced to the user's other devices via the Evolu relay. The result contains the row id; an ownerId option means the write targets a specific owner lane.`;
};

export const describeInspectorEvent = (event: InspectorEvent): string => {
  switch (event.channel) {
    case "nostr":
      return describeNostr(event);
    case "cashu":
      return describeCashu(event);
    case "evolu":
      return describeEvolu(event);
  }
};
