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
  ChatFileShared:
    "User exported a decrypted chat PDF through the system share sheet; the rumor link ties it to the message it came from.",
  ChatFileSaved:
    "User saved a decrypted chat PDF as a file download; the rumor link ties it to the message it came from.",
  ChatFileShareFailed:
    "System share of a chat PDF failed for a reason other than the user cancelling; the app fell back to a file download when triggered from the message menu.",
  "profiles.searchProfiles":
    "Add-contact text search: a NIP-50 kind-0 query fanned out to the read relays plus the configured search relays; relays without NIP-50 answer with unrelated profiles, so only hits that match the query locally are returned (the params carry the query and limit).",
  "contacts.addToGroup":
    "User assigned the contacts just saved from a chat message to a group; the payload lists the contact ids and the group name.",
  ChatImageShareFailed:
    "System share of a chat image failed for a reason other than the user cancelling; the app fell back to a file download when triggered from the message menu.",
  TokenLifecycleChanged:
    "A stored cashu token row moved to a new lifecycle state inside linkshu (e.g. accepted → issued); the reason names the operation that caused it. Follow the row link to the operation rows around it.",
  CounterAdvanced:
    "linkshu moved a deterministic derivation counter (NUT-13) for one mint/unit/keyset — the audit trail for output derivation and collision recovery.",
  QuoteStateChanged:
    "A mint or melt quote was observed in a new state while a linkshu flow (topup, autoswap, melt) polled it; the quote link ties the poll sequence together.",
  LightningFeeProbed:
    "linkshu measured a mint's Lightning fee by pricing another mint's unpaid invoice as a melt quote. Nothing is paid; links carry both quote ids.",
  "send.rowForgotten":
    "The app dropped a pending send row because its token verifiably reached the recipient (chat message published, or payment request POSTed). Follow the row link back to the send.send operation that produced it.",
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
