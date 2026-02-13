import type { LocalNostrMessage } from "../../types/appTypes";

export const dedupeChatMessages = (
  list: LocalNostrMessage[],
): LocalNostrMessage[] => {
  const seenWrapIds = new Set<string>();
  const seenClientIds = new Set<string>();
  const seenFallbackKeys = new Set<string>();
  const deduped: LocalNostrMessage[] = [];

  for (const message of list) {
    const wrapId = String(message.wrapId ?? "").trim();
    if (wrapId) {
      if (seenWrapIds.has(wrapId)) continue;
      seenWrapIds.add(wrapId);
    }

    const clientId = String(message.clientId ?? "").trim();
    if (clientId) {
      if (seenClientIds.has(clientId)) continue;
      seenClientIds.add(clientId);
    }

    if (!wrapId && !clientId) {
      const content = String(message.content ?? "").trim();
      const createdAtSec = Number(message.createdAtSec ?? 0) || 0;
      const direction = String(message.direction ?? "");
      const fallbackKey = `${direction}|${createdAtSec}|${content}`;

      if (content && createdAtSec > 0) {
        if (seenFallbackKeys.has(fallbackKey)) continue;
        seenFallbackKeys.add(fallbackKey);
      }
    }

    deduped.push(message);
  }

  return deduped;
};
