import type { CollectedInspectorRow } from "../inspector/inspectorRows";
import { nostrKindLabel } from "../nostrKindNames";

// Human vocabulary for inspector rows: per-tag and per-kind explanations shown
// by the inspector UI.

const NOSTR_KIND_EXPLANATIONS: Record<number, string> = {
  0: "Profile metadata: display name, picture, and lightning address.",
  7: "Reaction to a message (emoji) — inside Linky it travels as the rumor of a gift wrap.",
  14: "Unsigned chat message rumor — normally only seen inside a decrypted gift wrap.",
  1059: "NIP-59 gift wrap: an encrypted envelope that hides sender and content. Outer timestamps are randomized up to 2 days back, so inbox sync re-queries a window and the same wraps legitimately reappear.",
  10002:
    "NIP-65 relay list: announces which relays this user writes to and reads from.",
  10050:
    "NIP-17 DM inbox relay list: tells other clients where to deliver gift-wrapped DMs for this user.",
  30315: "NIP-38 user status.",
};

const TAG_DESCRIPTIONS: Record<string, string> = {
  WirePublished:
    "Outgoing: linkstr signed a gift wrap and handed it to the listed relays; the payload includes per-relay accepted/failed results. One operation usually produces two wraps: a copy for the recipient and a copy for the sender's own devices.",
  WireSubscribed:
    "linkstr opened a live subscription with this filter at the relay; matching events stream in as WireEventReceived rows until it closes.",
  WireEventReceived:
    "An event delivered by a relay on an open subscription, before decryption or routing. Follow its wrap id to see what the inbox made of it.",
  InboxRouted:
    "The inbox decrypted an incoming gift wrap and routed it to an app-level fact (e.g. ReactionAdded) — or dropped it (WrapDropped) when the rumor could not be used, for example an unsupported kind.",
  ChatImageShared:
    "User exported a decrypted chat image through the system share sheet; the rumor link ties it to the message it came from.",
  ChatImageSaved:
    "User saved a decrypted chat image as a file download; the rumor link ties it to the message it came from.",
  ChatImageShareFailed:
    "System share of a chat image failed for a reason other than the user cancelling; the app fell back to a file download when triggered from the message menu.",
};

const describeTag = (row: CollectedInspectorRow): string => {
  const known = TAG_DESCRIPTIONS[row.tag];
  if (known) return known;
  return `An inspector event tagged "${row.tag}" on the "${row.channel}" channel. Rows sharing any of its link ids are related.`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const MAX_KIND_SCAN_DEPTH = 4;

// Payload shapes are linkstr's, not ours; a shallow key scan finds kind
// numbers wherever they sit (event.kind, wrap.kind, filter.kinds, …).
const scanForKinds = (
  value: unknown,
  depth: number,
  out: Set<number>,
): void => {
  if (depth > MAX_KIND_SCAN_DEPTH) return;
  if (Array.isArray(value)) {
    for (const entry of value) scanForKinds(entry, depth + 1, out);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "kind" && typeof entry === "number") {
      out.add(entry);
    } else if (key === "kinds" && Array.isArray(entry)) {
      for (const kind of entry) {
        if (typeof kind === "number") out.add(kind);
      }
    } else {
      scanForKinds(entry, depth + 1, out);
    }
  }
};

export const collectNostrKinds = (payload: unknown): number[] => {
  const kinds = new Set<number>();
  scanForKinds(payload, 0, kinds);
  return [...kinds].sort((left, right) => left - right);
};

export const describeInspectorRow = (row: CollectedInspectorRow): string => {
  const kindLines = (
    row.channel.startsWith("nostr.") ? collectNostrKinds(row.payload) : []
  )
    .map((kind) => {
      const explanation = NOSTR_KIND_EXPLANATIONS[kind];
      return explanation ? `${nostrKindLabel(kind)}: ${explanation}` : null;
    })
    .filter((line): line is string => line !== null);
  const kindsBlock = kindLines.length > 0 ? `\n\n${kindLines.join("\n")}` : "";
  return `${describeTag(row)}${kindsBlock}`;
};
