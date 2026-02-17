import type { OwnerId } from "@evolu/common";
import * as Evolu from "@evolu/common";
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

type NostrMessageInsertPayload = {
  contactId: string;
  content: string;
  createdAtSec: number;
  direction: "in" | "out";
  status: "pending" | "sent";
  wrapId: string;
  clientId?: string;
  editedAtSec?: number;
  editedFromId?: string;
  isEdited?: "1";
  localOnly?: "1";
  originalContent?: string;
  pubkey?: string;
  replyToContent?: string;
  replyToId?: string;
  rootMessageId?: string;
  rumorId?: string;
};

const buildMessageInsertPayload = (
  message: NewLocalNostrMessage,
): NostrMessageInsertPayload | null => {
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

  const payload: NostrMessageInsertPayload = {
    contactId,
    direction,
    content,
    wrapId,
    createdAtSec,
    status: toMessageStatus(message.status),
  };

  const rumorId = toOptionalText(message.rumorId);
  if (rumorId) payload.rumorId = rumorId;

  const pubkey = toOptionalText(message.pubkey);
  if (pubkey) payload.pubkey = pubkey;

  const clientId = toOptionalText(message.clientId);
  if (clientId) payload.clientId = clientId;

  if (message.localOnly) payload.localOnly = "1";

  const replyToId = toOptionalText(message.replyToId);
  if (replyToId) payload.replyToId = replyToId;

  const replyToContent = toOptionalText(message.replyToContent);
  if (replyToContent) payload.replyToContent = replyToContent;

  const rootMessageId = toOptionalText(message.rootMessageId);
  if (rootMessageId) payload.rootMessageId = rootMessageId;

  if (editedAtSec) payload.editedAtSec = editedAtSec;

  const editedFromId = toOptionalText(message.editedFromId);
  if (editedFromId) payload.editedFromId = editedFromId;

  if (message.isEdited) payload.isEdited = "1";

  const originalContent = toOptionalText(message.originalContent);
  if (originalContent) payload.originalContent = originalContent;

  return payload;
};

const buildReactionInsertPayload = (
  reaction: NewLocalNostrReaction,
): {
  createdAtSec: number;
  emoji: string;
  messageId: string;
  reactorPubkey: string;
  status: "pending" | "sent";
  wrapId: string;
  clientId?: string;
} | null => {
  const messageId = toTrimmedText(reaction.messageId);
  const reactorPubkey = toTrimmedText(reaction.reactorPubkey);
  const emoji = toText(reaction.emoji).trim();
  if (!messageId || !reactorPubkey || !emoji) return null;

  const wrapId = toTrimmedText(reaction.wrapId) || `pending:${makeLocalId()}`;

  const payload: {
    createdAtSec: number;
    emoji: string;
    messageId: string;
    reactorPubkey: string;
    status: "pending" | "sent";
    wrapId: string;
    clientId?: string;
  } = {
    messageId,
    reactorPubkey,
    emoji,
    createdAtSec: toPositiveInt(
      reaction.createdAtSec,
      Math.ceil(Date.now() / 1000),
    ),
    wrapId,
    status: toReactionStatus(reaction.status),
  };

  const clientId = toOptionalText(reaction.clientId);
  if (clientId) payload.clientId = clientId;

  return payload;
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

interface NostrMessageShadowState {
  clientId?: string | null;
  content?: string;
  editedAtSec?: number | null;
  editedFromId?: string | null;
  isEdited?: boolean;
  localOnly?: boolean;
  originalContent?: string | null;
  pubkey?: string | null;
  replyToContent?: string | null;
  replyToId?: string | null;
  rootMessageId?: string | null;
  rumorId?: string | null;
  status?: "pending" | "sent";
  wrapId?: string;
}

interface NostrReactionShadowState {
  clientId?: string | null;
  emoji?: string | null;
  messageId?: string | null;
  reactorPubkey?: string | null;
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
  const nostrMessageUpdateShadowRef = React.useRef<
    Map<string, NostrMessageShadowState>
  >(new Map());
  const nostrReactionWrapIdsRef = React.useRef<Set<string>>(new Set());
  const nostrReactionsLatestRef = React.useRef<LocalNostrReaction[]>([]);
  const nostrReactionUpdateShadowRef = React.useRef<
    Map<string, NostrReactionShadowState>
  >(new Map());

  React.useEffect(() => {
    nostrMessagesLatestRef.current = nostrMessagesLocal;
    nostrMessageUpdateShadowRef.current.clear();
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
    nostrReactionUpdateShadowRef.current.clear();
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

      const existing = nostrMessagesLatestRef.current.find((current) => {
        const sameClientId =
          payload.clientId &&
          toTrimmedText(current.clientId) === toTrimmedText(payload.clientId);
        if (sameClientId) return true;

        const sameWrapId =
          toTrimmedText(current.wrapId) === toTrimmedText(payload.wrapId);
        if (sameWrapId) return true;

        const sameRumor =
          payload.rumorId &&
          toTrimmedText(current.rumorId) === toTrimmedText(payload.rumorId);
        if (sameRumor) return true;

        return (
          toTrimmedText(current.contactId) ===
            toTrimmedText(payload.contactId) &&
          toTrimmedText(current.direction) ===
            toTrimmedText(payload.direction) &&
          toText(current.content) === toText(payload.content) &&
          Number(current.createdAtSec ?? 0) === Number(payload.createdAtSec)
        );
      });
      if (existing) return toTrimmedText(existing.id);

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

      const current = nostrMessagesLatestRef.current.find(
        (message) => toTrimmedText(message.id) === normalizedId,
      );
      const shadow =
        nostrMessageUpdateShadowRef.current.get(normalizedId) ??
        ({} as NostrMessageShadowState);

      const readShadowText = <K extends keyof NostrMessageShadowState>(
        key: K,
        fallback: string | null,
      ): string | null => {
        if (Object.prototype.hasOwnProperty.call(shadow, key)) {
          const value = shadow[key];
          if (typeof value === "string") {
            const next = toOptionalText(value);
            return next;
          }
          return null;
        }
        return fallback;
      };

      const currentWrapId =
        readShadowText("wrapId", toOptionalText(current?.wrapId)) ?? "";
      const currentStatus =
        shadow.status ?? toMessageStatus(current?.status ?? "sent");

      const payload: NostrMessageUpdatePayload = {
        id: normalizedId,
      };
      let hasChanges = false;

      if (updates.wrapId !== undefined) {
        const nextWrapId = toTrimmedText(updates.wrapId);
        if (nextWrapId) {
          const nextStatusCandidate =
            updates.status !== undefined
              ? toMessageStatus(updates.status)
              : currentStatus;
          const keepExistingSentWrap =
            currentWrapId &&
            !currentWrapId.startsWith("pending:") &&
            nextStatusCandidate === "sent";
          if (nextWrapId !== currentWrapId && !keepExistingSentWrap) {
            payload.wrapId = nextWrapId;
            hasChanges = true;
            shadow.wrapId = nextWrapId;
          }
        }
      }
      if (updates.status !== undefined) {
        const nextStatus = toMessageStatus(updates.status);
        if (nextStatus !== currentStatus) {
          payload.status = nextStatus;
          hasChanges = true;
          shadow.status = nextStatus;
        }
      }
      if (updates.pubkey !== undefined) {
        const nextPubkey = toOptionalText(updates.pubkey);
        if (
          nextPubkey &&
          nextPubkey !==
            readShadowText("pubkey", toOptionalText(current?.pubkey))
        ) {
          payload.pubkey = nextPubkey;
          hasChanges = true;
          shadow.pubkey = nextPubkey;
        }
      }
      if (updates.content !== undefined) {
        const content = toText(updates.content);
        if (
          content.trim() &&
          content !==
            (readShadowText("content", toOptionalText(current?.content)) ?? "")
        ) {
          payload.content = content;
          hasChanges = true;
          shadow.content = content;
        }
      }
      if (updates.clientId !== undefined) {
        const nextClientId = toOptionalText(updates.clientId);
        if (
          nextClientId &&
          nextClientId !==
            readShadowText("clientId", toOptionalText(current?.clientId))
        ) {
          payload.clientId = nextClientId;
          hasChanges = true;
          shadow.clientId = nextClientId;
        }
      }
      if (updates.localOnly !== undefined) {
        const nextLocalOnly = updates.localOnly ? "1" : null;
        const prevLocalOnly =
          shadow.localOnly !== undefined
            ? shadow.localOnly
              ? "1"
              : null
            : current?.localOnly
              ? "1"
              : null;
        if (nextLocalOnly && nextLocalOnly !== prevLocalOnly) {
          payload.localOnly = nextLocalOnly;
          hasChanges = true;
          shadow.localOnly = true;
        }
      }
      if (updates.rumorId !== undefined) {
        const nextRumorId = toOptionalText(updates.rumorId);
        if (
          nextRumorId &&
          nextRumorId !==
            readShadowText("rumorId", toOptionalText(current?.rumorId))
        ) {
          payload.rumorId = nextRumorId;
          hasChanges = true;
          shadow.rumorId = nextRumorId;
        }
      }
      if (updates.replyToId !== undefined) {
        const nextReplyToId = toOptionalText(updates.replyToId);
        if (
          nextReplyToId &&
          nextReplyToId !==
            readShadowText("replyToId", toOptionalText(current?.replyToId))
        ) {
          payload.replyToId = nextReplyToId;
          hasChanges = true;
          shadow.replyToId = nextReplyToId;
        }
      }
      if (updates.replyToContent !== undefined) {
        const nextReplyToContent = toOptionalText(updates.replyToContent);
        if (
          nextReplyToContent &&
          nextReplyToContent !==
            readShadowText(
              "replyToContent",
              toOptionalText(current?.replyToContent),
            )
        ) {
          payload.replyToContent = nextReplyToContent;
          hasChanges = true;
          shadow.replyToContent = nextReplyToContent;
        }
      }
      if (updates.rootMessageId !== undefined) {
        const nextRootMessageId = toOptionalText(updates.rootMessageId);
        if (
          nextRootMessageId &&
          nextRootMessageId !==
            readShadowText(
              "rootMessageId",
              toOptionalText(current?.rootMessageId),
            )
        ) {
          payload.rootMessageId = nextRootMessageId;
          hasChanges = true;
          shadow.rootMessageId = nextRootMessageId;
        }
      }
      if (updates.editedAtSec !== undefined) {
        const nextEditedAtSec = updates.editedAtSec
          ? toPositiveInt(updates.editedAtSec, Math.ceil(Date.now() / 1000))
          : null;
        const prevEditedAtSec =
          shadow.editedAtSec !== undefined
            ? shadow.editedAtSec
            : (current?.editedAtSec ?? null);
        if (nextEditedAtSec && nextEditedAtSec !== prevEditedAtSec) {
          payload.editedAtSec = nextEditedAtSec;
          hasChanges = true;
          shadow.editedAtSec = nextEditedAtSec;
        }
      }
      if (updates.editedFromId !== undefined) {
        const nextEditedFromId = toOptionalText(updates.editedFromId);
        if (
          nextEditedFromId &&
          nextEditedFromId !==
            readShadowText(
              "editedFromId",
              toOptionalText(current?.editedFromId),
            )
        ) {
          payload.editedFromId = nextEditedFromId;
          hasChanges = true;
          shadow.editedFromId = nextEditedFromId;
        }
      }
      if (updates.isEdited !== undefined) {
        const nextIsEdited = updates.isEdited ? "1" : null;
        const prevIsEdited =
          shadow.isEdited !== undefined
            ? shadow.isEdited
              ? "1"
              : null
            : current?.isEdited
              ? "1"
              : null;
        if (nextIsEdited && nextIsEdited !== prevIsEdited) {
          payload.isEdited = nextIsEdited;
          hasChanges = true;
          shadow.isEdited = true;
        }
      }
      if (updates.originalContent !== undefined) {
        const nextOriginalContent = toOptionalText(updates.originalContent);
        if (
          nextOriginalContent &&
          nextOriginalContent !==
            readShadowText(
              "originalContent",
              toOptionalText(current?.originalContent),
            )
        ) {
          payload.originalContent = nextOriginalContent;
          hasChanges = true;
          shadow.originalContent = nextOriginalContent;
        }
      }

      if (!hasChanges) return;

      nostrMessageUpdateShadowRef.current.set(normalizedId, shadow);

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

      const existing = nostrReactionsLatestRef.current.find((current) => {
        const sameClientId =
          payload.clientId &&
          toTrimmedText(current.clientId) === toTrimmedText(payload.clientId);
        if (sameClientId) return true;

        const sameWrapId =
          toTrimmedText(current.wrapId) === toTrimmedText(payload.wrapId);
        if (sameWrapId) return true;

        return (
          toTrimmedText(current.messageId) ===
            toTrimmedText(payload.messageId) &&
          toTrimmedText(current.reactorPubkey) ===
            toTrimmedText(payload.reactorPubkey) &&
          toTrimmedText(current.emoji) === toTrimmedText(payload.emoji) &&
          Number(current.createdAtSec ?? 0) === Number(payload.createdAtSec)
        );
      });
      if (existing) return toTrimmedText(existing.id);

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

      const current = nostrReactionsLatestRef.current.find(
        (reaction) => toTrimmedText(reaction.id) === normalizedId,
      );
      const shadow =
        nostrReactionUpdateShadowRef.current.get(normalizedId) ??
        ({} as NostrReactionShadowState);

      const readShadowText = <K extends keyof NostrReactionShadowState>(
        key: K,
        fallback: string | null,
      ): string | null => {
        if (Object.prototype.hasOwnProperty.call(shadow, key)) {
          const value = shadow[key];
          if (typeof value === "string") return toOptionalText(value);
          return null;
        }
        return fallback;
      };

      const currentStatus =
        shadow.status ?? toReactionStatus(current?.status ?? "sent");

      const payload: NostrReactionUpdatePayload = {
        id: normalizedId,
      };
      let hasChanges = false;

      if (updates.messageId !== undefined) {
        const nextMessageId = toOptionalText(updates.messageId);
        if (
          nextMessageId &&
          nextMessageId !==
            readShadowText("messageId", toOptionalText(current?.messageId))
        ) {
          payload.messageId = nextMessageId;
          hasChanges = true;
          shadow.messageId = nextMessageId;
        }
      }
      if (updates.reactorPubkey !== undefined) {
        const nextReactorPubkey = toOptionalText(updates.reactorPubkey);
        if (
          nextReactorPubkey &&
          nextReactorPubkey !==
            readShadowText(
              "reactorPubkey",
              toOptionalText(current?.reactorPubkey),
            )
        ) {
          payload.reactorPubkey = nextReactorPubkey;
          hasChanges = true;
          shadow.reactorPubkey = nextReactorPubkey;
        }
      }
      if (updates.emoji !== undefined) {
        const nextEmoji = toOptionalText(updates.emoji);
        if (
          nextEmoji &&
          nextEmoji !== readShadowText("emoji", toOptionalText(current?.emoji))
        ) {
          payload.emoji = nextEmoji;
          hasChanges = true;
          shadow.emoji = nextEmoji;
        }
      }
      if (updates.wrapId !== undefined) {
        const nextWrapId = toTrimmedText(updates.wrapId);
        if (nextWrapId) {
          const prevWrapId = readShadowText(
            "wrapId",
            toOptionalText(current?.wrapId),
          );
          if (nextWrapId !== (prevWrapId ?? "")) {
            payload.wrapId = nextWrapId;
            hasChanges = true;
            shadow.wrapId = nextWrapId;
          }
        }
      }
      if (updates.clientId !== undefined) {
        const nextClientId = toOptionalText(updates.clientId);
        if (
          nextClientId &&
          nextClientId !==
            readShadowText("clientId", toOptionalText(current?.clientId))
        ) {
          payload.clientId = nextClientId;
          hasChanges = true;
          shadow.clientId = nextClientId;
        }
      }
      if (updates.status !== undefined) {
        const nextStatus = toReactionStatus(updates.status);
        if (nextStatus !== currentStatus) {
          payload.status = nextStatus;
          hasChanges = true;
          shadow.status = nextStatus;
        }
      }

      if (!hasChanges) return;

      nostrReactionUpdateShadowRef.current.set(normalizedId, shadow);

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
