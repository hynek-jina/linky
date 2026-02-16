import * as Evolu from "@evolu/common";
import type { OwnerId } from "@evolu/common";
import { useQuery } from "@evolu/react";
import React from "react";
import type { ContactId } from "../../evolu";
import { evolu, useEvolu } from "../../evolu";
import type { Route } from "../../types/route";
import {
  LOCAL_NOSTR_MESSAGES_STORAGE_KEY_PREFIX,
  LOCAL_PENDING_PAYMENTS_STORAGE_KEY_PREFIX,
} from "../../utils/constants";
import {
  safeLocalStorageGetJson,
  safeLocalStorageSetJson,
} from "../../utils/storage";
import { makeLocalId } from "../../utils/validation";
import type {
  LocalNostrMessage,
  LocalNostrReaction,
  LocalPendingPayment,
  NewLocalNostrMessage,
  NewLocalNostrReaction,
  UpdateLocalNostrMessage,
  UpdateLocalNostrReaction,
} from "../types/appTypes";
import {
  dedupeChatMessages,
  dedupeNostrMessagesByPriority,
  getLocalNostrMessageRumorKey,
} from "./messages/messageHelpers";

interface UseMessagesDomainParams {
  appOwnerId: OwnerId | null;
  appOwnerIdRef: React.MutableRefObject<OwnerId | null>;
  chatForceScrollToBottomRef: React.MutableRefObject<boolean>;
  chatMessagesRef: React.RefObject<HTMLDivElement | null>;
  route: Route;
}

const MESSAGE_MIGRATION_VERSION = 1;
const MESSAGE_RETENTION_PER_CONTACT = 500;
const MESSAGE_RETENTION_GLOBAL = 3000;
const REACTION_RETENTION_GLOBAL = 5000;
const RETENTION_PRUNE_THROTTLE_MS = 900;

const toText = (value: unknown): string => String(value ?? "");

const toTrimmedText = (value: unknown): string => toText(value).trim();

const toOptionalText = (value: unknown): string | null => {
  const next = toTrimmedText(value);
  return next ? next : null;
};

const toMessageStatus = (value: unknown): "pending" | "sent" => {
  const normalized = toTrimmedText(value);
  return normalized === "pending" ? "pending" : "sent";
};

const toReactionStatus = (value: unknown): "pending" | "sent" => {
  const normalized = toTrimmedText(value);
  return normalized === "pending" ? "pending" : "sent";
};

const toPositiveInt = (value: unknown, fallback: number): number => {
  const asNumber = Number(value ?? 0);
  if (!Number.isFinite(asNumber)) return fallback;
  const rounded = Math.trunc(asNumber);
  return rounded > 0 ? rounded : fallback;
};

const isSqliteTrueish = (value: unknown): boolean => {
  if (value === true || value === 1 || value === "1") return true;
  const normalized = toTrimmedText(value).toLowerCase();
  return normalized === "true";
};

const parseCreatedAtSec = (value: unknown): number =>
  toPositiveInt(value, Math.ceil(Date.now() / 1000));

const toLocalNostrMessage = (
  row: Record<string, unknown>,
): LocalNostrMessage | null => {
  const id = toTrimmedText(row.id);
  const contactId = toTrimmedText(row.contactId);
  const directionRaw = toTrimmedText(row.direction);
  const direction =
    directionRaw === "in" || directionRaw === "out" ? directionRaw : null;
  const content = toText(row.content);
  const wrapId = toTrimmedText(row.wrapId);

  if (!id || !contactId || !direction || !content.trim() || !wrapId) {
    return null;
  }

  const clientId = toOptionalText(row.clientId);
  const message: LocalNostrMessage = {
    id,
    contactId,
    direction,
    content,
    wrapId,
    rumorId: toOptionalText(row.rumorId),
    pubkey: toTrimmedText(row.pubkey),
    createdAtSec: parseCreatedAtSec(row.createdAtSec),
    status: toMessageStatus(row.status),
    localOnly: isSqliteTrueish(row.localOnly),
    replyToId: toOptionalText(row.replyToId),
    replyToContent: toOptionalText(row.replyToContent),
    rootMessageId: toOptionalText(row.rootMessageId),
    editedAtSec: toOptionalText(row.editedAtSec)
      ? parseCreatedAtSec(row.editedAtSec)
      : null,
    editedFromId: toOptionalText(row.editedFromId),
    isEdited: isSqliteTrueish(row.isEdited),
    originalContent: toOptionalText(row.originalContent),
    ...(clientId ? { clientId } : {}),
  };

  return message;
};

const toLocalNostrReaction = (
  row: Record<string, unknown>,
): LocalNostrReaction | null => {
  const id = toTrimmedText(row.id);
  const messageId = toTrimmedText(row.messageId);
  const reactorPubkey = toTrimmedText(row.reactorPubkey);
  const emoji = toText(row.emoji).trim();
  const wrapId = toTrimmedText(row.wrapId);

  if (!id || !messageId || !reactorPubkey || !emoji || !wrapId) return null;

  const clientId = toOptionalText(row.clientId);
  return {
    id,
    messageId,
    reactorPubkey,
    emoji,
    wrapId,
    createdAtSec: parseCreatedAtSec(row.createdAtSec),
    status: toReactionStatus(row.status),
    ...(clientId ? { clientId } : {}),
  };
};

const normalizeLegacyLocalMessage = (
  row: LocalNostrMessage,
): LocalNostrMessage | null => {
  const contactId = toTrimmedText(row.contactId);
  const directionRaw = toTrimmedText(row.direction);
  const direction =
    directionRaw === "in" || directionRaw === "out" ? directionRaw : null;
  const content = toText(row.content);
  const wrapId = toTrimmedText(row.wrapId) || `legacy:${makeLocalId()}`;

  if (!contactId || !direction || !content.trim()) return null;

  const clientId = toOptionalText(row.clientId);
  return {
    id: toTrimmedText(row.id) || makeLocalId(),
    contactId,
    direction,
    content,
    wrapId,
    rumorId: toOptionalText(row.rumorId),
    pubkey: toTrimmedText(row.pubkey),
    createdAtSec: toPositiveInt(row.createdAtSec, Math.ceil(Date.now() / 1000)),
    status: toMessageStatus(row.status),
    localOnly: Boolean(row.localOnly),
    replyToId: toOptionalText(row.replyToId),
    replyToContent: toOptionalText(row.replyToContent),
    rootMessageId: toOptionalText(row.rootMessageId),
    editedAtSec: row.editedAtSec
      ? toPositiveInt(row.editedAtSec, Math.ceil(Date.now() / 1000))
      : null,
    editedFromId: toOptionalText(row.editedFromId),
    isEdited: Boolean(row.isEdited),
    originalContent: toOptionalText(row.originalContent),
    ...(clientId ? { clientId } : {}),
  };
};

const buildMessageInsertPayload = (
  message: NewLocalNostrMessage,
): {
  clientId: string | null;
  contactId: string;
  content: string;
  createdAtSec: number;
  direction: "in" | "out";
  editedAtSec: number | null;
  editedFromId: string | null;
  isEdited: string | null;
  localOnly: string | null;
  originalContent: string | null;
  pubkey: string | null;
  replyToContent: string | null;
  replyToId: string | null;
  rootMessageId: string | null;
  rumorId: string | null;
  status: "pending" | "sent";
  wrapId: string;
} | null => {
  const contactId = toTrimmedText(message.contactId);
  const directionRaw = toTrimmedText(message.direction);
  const direction =
    directionRaw === "in" || directionRaw === "out" ? directionRaw : null;
  const content = toText(message.content);
  if (!contactId || !direction || !content.trim()) return null;

  const wrapId = toTrimmedText(message.wrapId) || `pending:${makeLocalId()}`;
  const createdAtSec = toPositiveInt(
    message.createdAtSec,
    Math.ceil(Date.now() / 1000),
  );
  const editedAtSec = message.editedAtSec
    ? toPositiveInt(message.editedAtSec, createdAtSec)
    : null;

  return {
    contactId,
    direction,
    content,
    wrapId,
    rumorId: toOptionalText(message.rumorId),
    pubkey: toOptionalText(message.pubkey),
    createdAtSec,
    clientId: toOptionalText(message.clientId),
    status: toMessageStatus(message.status),
    localOnly: message.localOnly ? "1" : null,
    replyToId: toOptionalText(message.replyToId),
    replyToContent: toOptionalText(message.replyToContent),
    rootMessageId: toOptionalText(message.rootMessageId),
    editedAtSec,
    editedFromId: toOptionalText(message.editedFromId),
    isEdited: message.isEdited ? "1" : null,
    originalContent: toOptionalText(message.originalContent),
  };
};

const buildReactionInsertPayload = (
  reaction: NewLocalNostrReaction,
): {
  clientId: string | null;
  createdAtSec: number;
  emoji: string;
  messageId: string;
  reactorPubkey: string;
  status: "pending" | "sent";
  wrapId: string;
} | null => {
  const messageId = toTrimmedText(reaction.messageId);
  const reactorPubkey = toTrimmedText(reaction.reactorPubkey);
  const emoji = toText(reaction.emoji).trim();
  if (!messageId || !reactorPubkey || !emoji) return null;

  const wrapId = toTrimmedText(reaction.wrapId) || `pending:${makeLocalId()}`;

  return {
    messageId,
    reactorPubkey,
    emoji,
    createdAtSec: toPositiveInt(
      reaction.createdAtSec,
      Math.ceil(Date.now() / 1000),
    ),
    wrapId,
    clientId: toOptionalText(reaction.clientId),
    status: toReactionStatus(reaction.status),
  };
};

const migrationKeyForOwner = (ownerId: string): string =>
  `linky.messages_evolu_migrated_v${MESSAGE_MIGRATION_VERSION}:${ownerId}`;

interface NostrMessageUpdatePayload {
  clientId?: string | null;
  content?: string;
  editedAtSec?: number | null;
  editedFromId?: string | null;
  id: string;
  isEdited?: string | null;
  localOnly?: string | null;
  originalContent?: string | null;
  pubkey?: string | null;
  replyToContent?: string | null;
  replyToId?: string | null;
  rootMessageId?: string | null;
  rumorId?: string | null;
  status?: "pending" | "sent";
  wrapId?: string;
}

interface NostrReactionUpdatePayload {
  clientId?: string | null;
  emoji?: string;
  id: string;
  messageId?: string;
  reactorPubkey?: string;
  status?: "pending" | "sent";
  wrapId?: string;
}

export const useMessagesDomain = ({
  appOwnerId,
  appOwnerIdRef,
  chatForceScrollToBottomRef,
  chatMessagesRef,
  route,
}: UseMessagesDomainParams) => {
  const { insert, update } = useEvolu();
  const activeChatRouteId = route.kind === "chat" ? route.id : null;

  const nostrMessagesQuery = React.useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("nostrMessage")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("createdAtSec", "asc")
          .orderBy("createdAt", "asc"),
      ),
    [],
  );

  const nostrReactionsQuery = React.useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("nostrReaction")
          .selectAll()
          .orderBy("createdAtSec", "asc")
          .orderBy("createdAt", "asc"),
      ),
    [],
  );

  const nostrMessageRows = useQuery(nostrMessagesQuery);
  const nostrReactionRows = useQuery(nostrReactionsQuery);

  const nostrReactionDeletedWrapIds = React.useMemo(() => {
    const deletedWrapIds = new Set<string>();
    for (const row of nostrReactionRows) {
      if (!isSqliteTrueish(row.isDeleted)) continue;
      const wrapId = toTrimmedText(row.wrapId);
      if (!wrapId) continue;
      deletedWrapIds.add(wrapId);
    }
    return deletedWrapIds;
  }, [nostrReactionRows]);

  const nostrReactionSeenWrapIds = React.useMemo(() => {
    const seenWrapIds = new Set<string>();
    for (const row of nostrReactionRows) {
      const wrapId = toTrimmedText(row.wrapId);
      if (!wrapId) continue;
      seenWrapIds.add(wrapId);
    }
    return seenWrapIds;
  }, [nostrReactionRows]);

  const nostrMessagesLocal = React.useMemo(() => {
    const parsed: LocalNostrMessage[] = [];
    for (const row of nostrMessageRows) {
      const normalized = toLocalNostrMessage(row);
      if (normalized) parsed.push(normalized);
    }
    const deduped = dedupeNostrMessagesByPriority(parsed);
    return deduped.sort((a, b) => a.createdAtSec - b.createdAtSec);
  }, [nostrMessageRows]);

  const nostrReactionsLocal = React.useMemo(() => {
    const parsed: LocalNostrReaction[] = [];
    const seenWrapIds = new Set<string>();
    const seenClientIds = new Set<string>();
    for (const row of nostrReactionRows) {
      if (isSqliteTrueish(row.isDeleted)) continue;
      const normalized = toLocalNostrReaction(row);
      if (!normalized) continue;

      const wrapId = toTrimmedText(normalized.wrapId);
      if (wrapId && nostrReactionDeletedWrapIds.has(wrapId)) continue;
      if (wrapId && seenWrapIds.has(wrapId)) continue;
      if (wrapId) seenWrapIds.add(wrapId);

      const clientId = toTrimmedText(normalized.clientId);
      if (clientId && seenClientIds.has(clientId)) continue;
      if (clientId) seenClientIds.add(clientId);

      parsed.push(normalized);
    }
    parsed.sort((a, b) => a.createdAtSec - b.createdAtSec);
    return parsed;
  }, [nostrReactionDeletedWrapIds, nostrReactionRows]);

  const nostrMessageWrapIdsRef = React.useRef<Set<string>>(new Set());
  const nostrMessagesLatestRef = React.useRef<LocalNostrMessage[]>([]);
  const nostrReactionWrapIdsRef = React.useRef<Set<string>>(new Set());
  const nostrReactionsLatestRef = React.useRef<LocalNostrReaction[]>([]);

  React.useEffect(() => {
    nostrMessagesLatestRef.current = nostrMessagesLocal;
    nostrMessageWrapIdsRef.current = new Set(
      nostrMessagesLocal
        .map(
          (message) =>
            toTrimmedText(message.wrapId) || toTrimmedText(message.id),
        )
        .filter(Boolean),
    );
  }, [nostrMessagesLocal]);

  React.useEffect(() => {
    nostrReactionsLatestRef.current = nostrReactionsLocal;
    nostrReactionWrapIdsRef.current = new Set(nostrReactionSeenWrapIds);
  }, [nostrReactionSeenWrapIds, nostrReactionsLocal]);

  const [pendingPayments, setPendingPayments] = React.useState<
    LocalPendingPayment[]
  >(() => []);

  const migrationRunningRef = React.useRef(false);
  const migrationDoneForOwnerRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!appOwnerId) return;
    const ownerKey = toTrimmedText(appOwnerId);
    if (!ownerKey) return;
    if (migrationRunningRef.current) return;
    if (migrationDoneForOwnerRef.current === ownerKey) return;

    const migrationKey = migrationKeyForOwner(ownerKey);
    try {
      if (localStorage.getItem(migrationKey) === "1") {
        migrationDoneForOwnerRef.current = ownerKey;
        return;
      }
    } catch {
      // ignore localStorage read failures
    }

    migrationRunningRef.current = true;
    try {
      const legacy = safeLocalStorageGetJson(
        `${LOCAL_NOSTR_MESSAGES_STORAGE_KEY_PREFIX}.${ownerKey}`,
        [] as LocalNostrMessage[],
      );

      const normalizedLegacy = Array.isArray(legacy)
        ? legacy
            .map((message) => normalizeLegacyLocalMessage(message))
            .filter((message): message is LocalNostrMessage => Boolean(message))
        : [];

      const dedupedLegacy = dedupeNostrMessagesByPriority(normalizedLegacy);
      const existingMessages =
        dedupeNostrMessagesByPriority(nostrMessagesLocal);

      const seenWrapIds = new Set<string>();
      const seenClientIds = new Set<string>();
      const seenRumorKeys = new Set<string>();

      for (const existingMessage of existingMessages) {
        const wrapId = toTrimmedText(existingMessage.wrapId);
        if (wrapId) seenWrapIds.add(wrapId);

        const clientId = toTrimmedText(existingMessage.clientId);
        if (clientId) seenClientIds.add(clientId);

        const rumorKey = getLocalNostrMessageRumorKey(existingMessage);
        if (rumorKey) seenRumorKeys.add(rumorKey);
      }

      for (const legacyMessage of dedupedLegacy) {
        const wrapId = toTrimmedText(legacyMessage.wrapId);
        const clientId = toTrimmedText(legacyMessage.clientId);
        const rumorKey = getLocalNostrMessageRumorKey(legacyMessage);

        if (wrapId && seenWrapIds.has(wrapId)) continue;
        if (clientId && seenClientIds.has(clientId)) continue;
        if (rumorKey && seenRumorKeys.has(rumorKey)) continue;

        const payload = buildMessageInsertPayload({
          ...legacyMessage,
          status: toMessageStatus(legacyMessage.status),
        });
        if (!payload) continue;

        const result = insert("nostrMessage", payload, { ownerId: appOwnerId });
        if (!result.ok) continue;

        if (wrapId) seenWrapIds.add(wrapId);
        if (clientId) seenClientIds.add(clientId);
        if (rumorKey) seenRumorKeys.add(rumorKey);
      }

      try {
        localStorage.setItem(migrationKey, "1");
        localStorage.removeItem(
          `${LOCAL_NOSTR_MESSAGES_STORAGE_KEY_PREFIX}.${ownerKey}`,
        );
      } catch {
        // ignore localStorage write failures
      }
      migrationDoneForOwnerRef.current = ownerKey;
    } finally {
      migrationRunningRef.current = false;
    }
  }, [appOwnerId, insert, nostrMessagesLocal]);

  const appendLocalNostrMessage = React.useCallback(
    (message: NewLocalNostrMessage): string => {
      const payload = buildMessageInsertPayload(message);
      if (!payload) return "";

      const result = appOwnerId
        ? insert("nostrMessage", payload, { ownerId: appOwnerId })
        : insert("nostrMessage", payload);
      if (!result.ok) return "";

      const messageId = toText(result.value.id);
      if (
        activeChatRouteId &&
        toTrimmedText(message.contactId) === toTrimmedText(activeChatRouteId)
      ) {
        chatForceScrollToBottomRef.current = true;
        requestAnimationFrame(() => {
          const container = chatMessagesRef.current;
          if (container) container.scrollTop = container.scrollHeight;
        });
      }

      return messageId;
    },
    [
      appOwnerId,
      activeChatRouteId,
      chatForceScrollToBottomRef,
      chatMessagesRef,
      insert,
    ],
  );

  const updateLocalNostrMessage = React.useCallback<UpdateLocalNostrMessage>(
    (id, updates) => {
      const normalizedId = toTrimmedText(id);
      if (!normalizedId) return;

      const payload: NostrMessageUpdatePayload = {
        id: normalizedId,
      };
      let hasChanges = false;

      if (updates.wrapId !== undefined) {
        payload.wrapId =
          toTrimmedText(updates.wrapId) || `pending:${makeLocalId()}`;
        hasChanges = true;
      }
      if (updates.status !== undefined) {
        payload.status = toMessageStatus(updates.status);
        hasChanges = true;
      }
      if (updates.pubkey !== undefined) {
        payload.pubkey = toOptionalText(updates.pubkey);
        hasChanges = true;
      }
      if (updates.content !== undefined) {
        const content = toText(updates.content);
        if (content.trim()) {
          payload.content = content;
          hasChanges = true;
        }
      }
      if (updates.clientId !== undefined) {
        payload.clientId = toOptionalText(updates.clientId);
        hasChanges = true;
      }
      if (updates.localOnly !== undefined) {
        payload.localOnly = updates.localOnly ? "1" : null;
        hasChanges = true;
      }
      if (updates.rumorId !== undefined) {
        payload.rumorId = toOptionalText(updates.rumorId);
        hasChanges = true;
      }
      if (updates.replyToId !== undefined) {
        payload.replyToId = toOptionalText(updates.replyToId);
        hasChanges = true;
      }
      if (updates.replyToContent !== undefined) {
        payload.replyToContent = toOptionalText(updates.replyToContent);
        hasChanges = true;
      }
      if (updates.rootMessageId !== undefined) {
        payload.rootMessageId = toOptionalText(updates.rootMessageId);
        hasChanges = true;
      }
      if (updates.editedAtSec !== undefined) {
        payload.editedAtSec = updates.editedAtSec
          ? toPositiveInt(updates.editedAtSec, Math.ceil(Date.now() / 1000))
          : null;
        hasChanges = true;
      }
      if (updates.editedFromId !== undefined) {
        payload.editedFromId = toOptionalText(updates.editedFromId);
        hasChanges = true;
      }
      if (updates.isEdited !== undefined) {
        payload.isEdited = updates.isEdited ? "1" : null;
        hasChanges = true;
      }
      if (updates.originalContent !== undefined) {
        payload.originalContent = toOptionalText(updates.originalContent);
        hasChanges = true;
      }

      if (!hasChanges) return;

      if (appOwnerId) {
        update("nostrMessage", payload, { ownerId: appOwnerId });
      } else {
        update("nostrMessage", payload);
      }
    },
    [appOwnerId, update],
  );

  const appendLocalNostrReaction = React.useCallback(
    (reaction: NewLocalNostrReaction): string => {
      const payload = buildReactionInsertPayload(reaction);
      if (!payload) return "";

      const result = appOwnerId
        ? insert("nostrReaction", payload, { ownerId: appOwnerId })
        : insert("nostrReaction", payload);
      if (!result.ok) return "";
      return toText(result.value.id);
    },
    [appOwnerId, insert],
  );

  const updateLocalNostrReaction = React.useCallback<UpdateLocalNostrReaction>(
    (id, updates) => {
      const normalizedId = toTrimmedText(id);
      if (!normalizedId) return;

      const payload: NostrReactionUpdatePayload = {
        id: normalizedId,
      };
      let hasChanges = false;

      if (updates.messageId !== undefined) {
        const messageId = toOptionalText(updates.messageId);
        if (messageId) {
          payload.messageId = messageId;
          hasChanges = true;
        }
      }
      if (updates.reactorPubkey !== undefined) {
        const reactorPubkey = toOptionalText(updates.reactorPubkey);
        if (reactorPubkey) {
          payload.reactorPubkey = reactorPubkey;
          hasChanges = true;
        }
      }
      if (updates.emoji !== undefined) {
        const emoji = toOptionalText(updates.emoji);
        if (emoji) {
          payload.emoji = emoji;
          hasChanges = true;
        }
      }
      if (updates.wrapId !== undefined) {
        payload.wrapId =
          toTrimmedText(updates.wrapId) || `pending:${makeLocalId()}`;
        hasChanges = true;
      }
      if (updates.clientId !== undefined) {
        payload.clientId = toOptionalText(updates.clientId);
        hasChanges = true;
      }
      if (updates.status !== undefined) {
        payload.status = toReactionStatus(updates.status);
        hasChanges = true;
      }

      if (!hasChanges) return;

      if (appOwnerId) {
        update("nostrReaction", payload, { ownerId: appOwnerId });
      } else {
        update("nostrReaction", payload);
      }
    },
    [appOwnerId, update],
  );

  const softDeleteLocalNostrReaction = React.useCallback(
    (id: string) => {
      const normalizedId = toTrimmedText(id);
      if (!normalizedId) return;
      if (appOwnerId) {
        update(
          "nostrReaction",
          { id: normalizedId, isDeleted: Evolu.sqliteTrue },
          { ownerId: appOwnerId },
        );
      } else {
        update("nostrReaction", {
          id: normalizedId,
          isDeleted: Evolu.sqliteTrue,
        });
      }
    },
    [appOwnerId, update],
  );

  const softDeleteLocalNostrReactionsByWrapIds = React.useCallback(
    (wrapIds: readonly string[]) => {
      const targetWrapIds = new Set(
        wrapIds.map((value) => toTrimmedText(value)).filter(Boolean),
      );
      if (targetWrapIds.size === 0) return;

      for (const wrapId of targetWrapIds) {
        nostrReactionWrapIdsRef.current.add(wrapId);
      }

      for (const reaction of nostrReactionsLatestRef.current) {
        if (!targetWrapIds.has(toTrimmedText(reaction.wrapId))) continue;
        if (appOwnerId) {
          update(
            "nostrReaction",
            { id: reaction.id, isDeleted: Evolu.sqliteTrue },
            { ownerId: appOwnerId },
          );
        } else {
          update("nostrReaction", {
            id: reaction.id,
            isDeleted: Evolu.sqliteTrue,
          });
        }
      }
    },
    [appOwnerId, update],
  );

  const refreshLocalNostrMessages = React.useCallback(() => {
    // Data is query-driven from Evolu; kept for backwards-compatible call sites.
  }, []);

  const retentionPruneTimerRef = React.useRef<number | null>(null);
  const retentionPruneInFlightRef = React.useRef(false);

  const pruneRetention = React.useCallback(() => {
    if (retentionPruneInFlightRef.current) return;

    retentionPruneInFlightRef.current = true;
    try {
      const byContact = new Map<string, LocalNostrMessage[]>();
      for (const message of nostrMessagesLocal) {
        const contactId = toTrimmedText(message.contactId);
        if (!contactId) continue;
        const list = byContact.get(contactId);
        if (list) list.push(message);
        else byContact.set(contactId, [message]);
      }

      const keepIds = new Set<string>();
      for (const list of byContact.values()) {
        const sorted = [...list].sort(
          (a, b) => a.createdAtSec - b.createdAtSec,
        );
        for (const message of sorted.slice(-MESSAGE_RETENTION_PER_CONTACT)) {
          keepIds.add(toTrimmedText(message.id));
        }
      }

      const keptMessagesSorted = nostrMessagesLocal
        .filter((message) => keepIds.has(toTrimmedText(message.id)))
        .sort((a, b) => a.createdAtSec - b.createdAtSec);

      if (keptMessagesSorted.length > MESSAGE_RETENTION_GLOBAL) {
        const limited = keptMessagesSorted.slice(-MESSAGE_RETENTION_GLOBAL);
        keepIds.clear();
        for (const message of limited) {
          keepIds.add(toTrimmedText(message.id));
        }
      }

      for (const message of nostrMessagesLocal) {
        const messageId = toTrimmedText(message.id);
        if (!messageId || keepIds.has(messageId)) continue;
        if (appOwnerId) {
          update(
            "nostrMessage",
            { id: messageId, isDeleted: Evolu.sqliteTrue },
            { ownerId: appOwnerId },
          );
        } else {
          update("nostrMessage", {
            id: messageId,
            isDeleted: Evolu.sqliteTrue,
          });
        }
      }

      const keptRumorIds = new Set<string>();
      for (const message of nostrMessagesLocal) {
        if (!keepIds.has(toTrimmedText(message.id))) continue;
        const rumorId = toTrimmedText(message.rumorId);
        if (rumorId) keptRumorIds.add(rumorId);
      }

      const validReactions = nostrReactionsLocal
        .filter((reaction) =>
          keptRumorIds.has(toTrimmedText(reaction.messageId)),
        )
        .sort((a, b) => a.createdAtSec - b.createdAtSec);

      const keepReactionIds = new Set<string>(
        validReactions
          .slice(-REACTION_RETENTION_GLOBAL)
          .map((reaction) => toTrimmedText(reaction.id))
          .filter(Boolean),
      );

      for (const reaction of nostrReactionsLocal) {
        const reactionId = toTrimmedText(reaction.id);
        if (!reactionId || keepReactionIds.has(reactionId)) continue;
        if (appOwnerId) {
          update(
            "nostrReaction",
            { id: reactionId, isDeleted: Evolu.sqliteTrue },
            { ownerId: appOwnerId },
          );
        } else {
          update("nostrReaction", {
            id: reactionId,
            isDeleted: Evolu.sqliteTrue,
          });
        }
      }
    } finally {
      retentionPruneInFlightRef.current = false;
    }
  }, [appOwnerId, nostrMessagesLocal, nostrReactionsLocal, update]);

  React.useEffect(() => {
    const messageCountsByContact = new Map<string, number>();
    for (const message of nostrMessagesLocal) {
      const contactId = toTrimmedText(message.contactId);
      if (!contactId) continue;
      messageCountsByContact.set(
        contactId,
        (messageCountsByContact.get(contactId) ?? 0) + 1,
      );
    }
    const hasContactOverflow = [...messageCountsByContact.values()].some(
      (count) => count > MESSAGE_RETENTION_PER_CONTACT,
    );
    const hasMessageOverflow =
      nostrMessagesLocal.length > MESSAGE_RETENTION_GLOBAL;
    const messageRumorIds = new Set(
      nostrMessagesLocal
        .map((message) => toTrimmedText(message.rumorId))
        .filter(Boolean),
    );
    const hasOrphanReaction = nostrReactionsLocal.some(
      (reaction) => !messageRumorIds.has(toTrimmedText(reaction.messageId)),
    );
    const hasReactionOverflow =
      nostrReactionsLocal.length > REACTION_RETENTION_GLOBAL;

    if (
      !hasContactOverflow &&
      !hasMessageOverflow &&
      !hasOrphanReaction &&
      !hasReactionOverflow
    ) {
      return;
    }

    if (retentionPruneTimerRef.current != null) return;
    retentionPruneTimerRef.current = window.setTimeout(() => {
      retentionPruneTimerRef.current = null;
      pruneRetention();
    }, RETENTION_PRUNE_THROTTLE_MS);
  }, [nostrMessagesLocal, nostrReactionsLocal, pruneRetention]);

  React.useEffect(() => {
    return () => {
      if (retentionPruneTimerRef.current != null) {
        window.clearTimeout(retentionPruneTimerRef.current);
        retentionPruneTimerRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    const ownerId = appOwnerIdRef.current;
    if (!ownerId) {
      setPendingPayments([]);
      return;
    }

    const raw = safeLocalStorageGetJson(
      `${LOCAL_PENDING_PAYMENTS_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
      [] as LocalPendingPayment[],
    );

    const normalized = Array.isArray(raw)
      ? raw
          .map((pendingPayment) => ({
            id: toTrimmedText(pendingPayment.id),
            contactId: toTrimmedText(pendingPayment.contactId),
            amountSat: Math.max(
              0,
              Math.trunc(Number(pendingPayment.amountSat ?? 0) || 0),
            ),
            createdAtSec: Math.max(
              0,
              Math.trunc(Number(pendingPayment.createdAtSec ?? 0) || 0),
            ),
            ...(pendingPayment.messageId
              ? { messageId: toText(pendingPayment.messageId) }
              : {}),
          }))
          .filter(
            (pendingPayment) =>
              pendingPayment.id &&
              pendingPayment.contactId &&
              pendingPayment.amountSat > 0,
          )
      : [];

    setPendingPayments(normalized);
  }, [appOwnerId, appOwnerIdRef]);

  const enqueuePendingPayment = React.useCallback(
    (payload: {
      amountSat: number;
      contactId: ContactId;
      messageId?: string;
    }) => {
      const ownerId = appOwnerIdRef.current;
      if (!ownerId) return;

      const amountSat =
        Number.isFinite(payload.amountSat) && payload.amountSat > 0
          ? Math.trunc(payload.amountSat)
          : 0;
      if (amountSat <= 0) return;

      const entry: LocalPendingPayment = {
        id: makeLocalId(),
        contactId: toText(payload.contactId),
        amountSat,
        createdAtSec: Math.floor(Date.now() / 1000),
        ...(payload.messageId ? { messageId: payload.messageId } : {}),
      };

      setPendingPayments((prev) => {
        const next = [...prev, entry].slice(-200);
        safeLocalStorageSetJson(
          `${LOCAL_PENDING_PAYMENTS_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
          next,
        );
        return next;
      });
    },
    [appOwnerIdRef],
  );

  const removePendingPayment = React.useCallback(
    (id: string) => {
      const ownerId = appOwnerIdRef.current;
      const normalizedId = toTrimmedText(id);
      if (!ownerId || !normalizedId) return;

      setPendingPayments((prev) => {
        const next = prev.filter(
          (pendingPayment) => toTrimmedText(pendingPayment.id) !== normalizedId,
        );

        safeLocalStorageSetJson(
          `${LOCAL_PENDING_PAYMENTS_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
          next,
        );

        return next;
      });
    },
    [appOwnerIdRef],
  );

  const chatContactId = route.kind === "chat" ? route.id : null;

  const { messagesByContactId, lastMessageByContactId, nostrMessagesRecent } =
    React.useMemo(() => {
      const byContact = new Map<string, LocalNostrMessage[]>();
      const lastBy = new Map<string, LocalNostrMessage>();

      for (const message of nostrMessagesLocal) {
        const id = toTrimmedText(message.contactId);
        if (!id) continue;

        const list = byContact.get(id);
        if (list) list.push(message);
        else byContact.set(id, [message]);

        lastBy.set(id, message);
      }

      const recentSlice =
        nostrMessagesLocal.length > 100
          ? nostrMessagesLocal.slice(-100)
          : [...nostrMessagesLocal];

      return {
        messagesByContactId: byContact,
        lastMessageByContactId: lastBy,
        nostrMessagesRecent: [...recentSlice].reverse(),
      };
    }, [nostrMessagesLocal]);

  const reactionsByMessageId = React.useMemo(() => {
    const byMessage = new Map<string, LocalNostrReaction[]>();
    for (const reaction of nostrReactionsLocal) {
      const messageId = toTrimmedText(reaction.messageId);
      if (!messageId) continue;
      const list = byMessage.get(messageId);
      if (list) list.push(reaction);
      else byMessage.set(messageId, [reaction]);
    }
    return byMessage;
  }, [nostrReactionsLocal]);

  const chatMessages = React.useMemo(() => {
    const id = toTrimmedText(chatContactId);
    if (!id) return [] as LocalNostrMessage[];

    const list = messagesByContactId.get(id) ?? [];
    return dedupeChatMessages(list);
  }, [chatContactId, messagesByContactId]);

  const chatMessagesLatestRef = React.useRef<LocalNostrMessage[]>([]);
  React.useEffect(() => {
    chatMessagesLatestRef.current = chatMessages;
  }, [chatMessages]);

  return {
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    chatMessages,
    chatMessagesLatestRef,
    enqueuePendingPayment,
    lastMessageByContactId,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesLocal,
    nostrMessagesRecent,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    nostrReactionsLocal,
    pendingPayments,
    reactionsByMessageId,
    refreshLocalNostrMessages,
    removePendingPayment,
    softDeleteLocalNostrReaction,
    softDeleteLocalNostrReactionsByWrapIds,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  };
};
