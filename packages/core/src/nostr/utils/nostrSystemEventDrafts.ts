import { Schema } from "effect";
import type { ProfileMetadata } from "../../utils/ProfileMetadata";
import type { UnixTimeSeconds, WebsocketUrl } from "../../utils/schemas";
import type { NostrEventDraft } from "../domain/NostrEvent";
import { NostrTag } from "../domain/NostrTag";

const decodeTag = Schema.decodeUnknownSync(NostrTag);

const createTag = (
  name: string,
  value: string,
  ...extra: string[]
): ReturnType<typeof decodeTag> => decodeTag([name, value, ...extra]);

const dedupeRelays = (relays: ReadonlyArray<WebsocketUrl>): WebsocketUrl[] => {
  const seen = new Set<string>();
  const unique: WebsocketUrl[] = [];

  for (const relay of relays) {
    if (seen.has(relay)) continue;
    seen.add(relay);
    unique.push(relay);
  }

  return unique;
};

export const makeProfileMetadataEventDraft = (
  profileMetadata: ProfileMetadata,
  createdAt: UnixTimeSeconds,
): NostrEventDraft => ({
  content: JSON.stringify(profileMetadata),
  created_at: createdAt,
  kind: 0,
  tags: [],
});

export const makeRelayListEventDraft = (
  relayList: ReadonlyArray<WebsocketUrl>,
  createdAt: UnixTimeSeconds,
): NostrEventDraft => ({
  content: "",
  created_at: createdAt,
  kind: 10002,
  tags: dedupeRelays(relayList).map((relay) => createTag("r", relay)),
});
