import type { OwnerId } from "@evolu/common";
import React from "react";
import type { ContactId } from "../../evolu";
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
import type { LocalNostrMessage, LocalPendingPayment } from "../types/appTypes";
import { dedupeChatMessages } from "./messages/messageHelpers";

interface UseMessagesDomainParams {
  appOwnerId: OwnerId | null;
  appOwnerIdRef: React.MutableRefObject<OwnerId | null>;
  chatForceScrollToBottomRef: React.MutableRefObject<boolean>;
  chatMessagesRef: React.RefObject<HTMLDivElement | null>;
  route: Route;
}

const getMessageRumorKey = (
  message: Pick<LocalNostrMessage, "contactId" | "direction" | "rumorId">,
): string => {
  const rumorId = String(message.rumorId ?? "").trim();
  if (!rumorId) return "";

  const contactId = String(message.contactId ?? "").trim();
  const direction = String(message.direction ?? "").trim();
  if (!contactId || (direction !== "in" && direction !== "out")) return "";

  return `${contactId}|${direction}|${rumorId}`;
};

export const useMessagesDomain = ({
  appOwnerId,
  appOwnerIdRef,
  chatForceScrollToBottomRef,
  chatMessagesRef,
  route,
}: UseMessagesDomainParams) => {
  const [nostrMessagesLocal, setNostrMessagesLocal] = React.useState<
    LocalNostrMessage[]
  >(() => []);

  const nostrMessageWrapIdsRef = React.useRef<Set<string>>(new Set());
  const nostrMessagesLatestRef = React.useRef<LocalNostrMessage[]>([]);

  const [pendingPayments, setPendingPayments] = React.useState<
    LocalPendingPayment[]
  >(() => []);

  React.useEffect(() => {
    nostrMessagesLatestRef.current = nostrMessagesLocal;
  }, [nostrMessagesLocal]);

  const refreshLocalNostrMessages = React.useCallback(
    (ownerOverride?: string | null) => {
      const ownerId = ownerOverride ?? appOwnerIdRef.current;
      if (!ownerId) return;

      const raw = safeLocalStorageGetJson(
        `${LOCAL_NOSTR_MESSAGES_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
        [] as LocalNostrMessage[],
      );

      const normalizeMessage = (
        message: LocalNostrMessage,
      ): LocalNostrMessage => {
        const normalizedStatus =
          message.status === "pending" || message.status === "sent"
            ? message.status
            : "sent";

        const normalizedClientId =
          typeof message.clientId === "string" && message.clientId.trim()
            ? message.clientId.trim()
            : null;

        return {
          ...message,
          status: normalizedStatus,
          ...(normalizedClientId ? { clientId: normalizedClientId } : {}),
          ...(message.localOnly ? { localOnly: true } : {}),
        } as LocalNostrMessage;
      };

      setNostrMessagesLocal((prev) => {
        const wrapIds = new Set<string>();
        const rumorKeys = new Set<string>();
        const deduped: LocalNostrMessage[] = [];

        for (const message of [...raw, ...prev]) {
          const normalized = normalizeMessage(message);
          const key =
            String(normalized.wrapId ?? "").trim() ||
            String(normalized.id ?? "");
          const rumorKey = getMessageRumorKey(normalized);

          if (
            (key && wrapIds.has(key)) ||
            (rumorKey && rumorKeys.has(rumorKey))
          )
            continue;
          if (key) wrapIds.add(key);
          if (rumorKey) rumorKeys.add(rumorKey);
          deduped.push(normalized);
        }

        deduped.sort((a, b) => a.createdAtSec - b.createdAtSec);
        const trimmed = deduped.slice(-500);
        nostrMessageWrapIdsRef.current = new Set(
          trimmed.map(
            (message) =>
              String(message.wrapId ?? "").trim() || String(message.id ?? ""),
          ),
        );

        return trimmed;
      });
    },
    [appOwnerIdRef],
  );

  React.useEffect(() => {
    refreshLocalNostrMessages(appOwnerId);
  }, [appOwnerId, refreshLocalNostrMessages]);

  const appendLocalNostrMessage = React.useCallback(
    (
      message: Omit<LocalNostrMessage, "id" | "status"> & {
        status?: "sent" | "pending";
      },
    ): string => {
      const ownerId = appOwnerIdRef.current;

      const normalizedClientId =
        typeof message.clientId === "string" && message.clientId.trim()
          ? message.clientId.trim()
          : null;

      const entry: LocalNostrMessage = {
        id: makeLocalId(),
        ...message,
        status: message.status ?? "sent",
        ...(normalizedClientId ? { clientId: normalizedClientId } : {}),
      };

      setNostrMessagesLocal((prev) => {
        const dedupeKey =
          String(entry.wrapId ?? "").trim() || String(entry.id ?? "");
        const dedupeRumorKey = getMessageRumorKey(entry);

        // Check prev array for duplicates (not the ref) so this updater
        // is pure and works correctly under React strict-mode double-invocation.
        if (dedupeKey || dedupeRumorKey) {
          const hasDupe = prev.some((m) => {
            const key = String(m.wrapId ?? "").trim() || String(m.id ?? "");
            if (dedupeKey && key === dedupeKey) return true;
            if (!dedupeRumorKey) return false;
            return getMessageRumorKey(m) === dedupeRumorKey;
          });
          if (hasDupe) return prev;
        }

        const insertSorted = (
          list: LocalNostrMessage[],
          value: LocalNostrMessage,
        ) => {
          const len = list.length;
          if (len === 0) return [value];

          const last = list[len - 1];
          if ((last?.createdAtSec ?? 0) <= value.createdAtSec) {
            return [...list, value];
          }

          let lo = 0;
          let hi = len;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if ((list[mid]?.createdAtSec ?? 0) <= value.createdAtSec) {
              lo = mid + 1;
            } else {
              hi = mid;
            }
          }

          return [...list.slice(0, lo), value, ...list.slice(lo)];
        };

        const wrapIds = nostrMessageWrapIdsRef.current;
        let next = insertSorted(prev, entry);
        if (next.length > 500) {
          const removeCount = next.length - 500;
          const removed = next.slice(0, removeCount);
          next = next.slice(-500);

          for (const removedMessage of removed) {
            const key =
              String(removedMessage.wrapId ?? "").trim() ||
              String(removedMessage.id ?? "");
            if (key) wrapIds.delete(key);
          }
        }

        if (dedupeKey) wrapIds.add(dedupeKey);

        if (ownerId) {
          safeLocalStorageSetJson(
            `${LOCAL_NOSTR_MESSAGES_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
            next,
          );
        }

        return next;
      });

      const chatRouteId = route.kind === "chat" ? route.id : null;
      if (
        chatRouteId &&
        String(message.contactId ?? "") === String(chatRouteId ?? "")
      ) {
        chatForceScrollToBottomRef.current = true;
        requestAnimationFrame(() => {
          const container = chatMessagesRef.current;
          if (container) container.scrollTop = container.scrollHeight;
        });
      }

      return entry.id;
    },
    [appOwnerIdRef, chatForceScrollToBottomRef, chatMessagesRef, route],
  );

  const updateLocalNostrMessage = React.useCallback(
    (
      id: string,
      updates: Partial<
        Pick<
          LocalNostrMessage,
          "wrapId" | "status" | "pubkey" | "content" | "clientId" | "localOnly"
        >
      >,
    ) => {
      const ownerId = appOwnerIdRef.current;
      if (!id) return;

      setNostrMessagesLocal((prev) => {
        const idx = prev.findIndex(
          (message) => String(message.id ?? "") === id,
        );
        if (idx < 0) return prev;

        const current = prev[idx];
        const normalizedClientId =
          typeof updates.clientId === "string" && updates.clientId.trim()
            ? updates.clientId.trim()
            : updates.clientId === null
              ? null
              : (current.clientId ?? null);

        const nextEntry: LocalNostrMessage = {
          ...current,
          ...updates,
          status:
            updates.status === "pending" || updates.status === "sent"
              ? updates.status
              : (current.status ?? "sent"),
          ...(normalizedClientId ? { clientId: normalizedClientId } : {}),
        };

        const wrapIds = nostrMessageWrapIdsRef.current;
        const prevKey = String(current.wrapId ?? "").trim() || String(id);
        const nextKey =
          String(nextEntry.wrapId ?? "").trim() || String(nextEntry.id);

        if (prevKey && prevKey !== nextKey) wrapIds.delete(prevKey);
        if (nextKey) wrapIds.add(nextKey);

        const next = [...prev];
        next[idx] = nextEntry;

        if (ownerId) {
          safeLocalStorageSetJson(
            `${LOCAL_NOSTR_MESSAGES_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
            next,
          );
        }

        return next;
      });
    },
    [appOwnerIdRef],
  );

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
            id: String(pendingPayment.id ?? "").trim(),
            contactId: String(pendingPayment.contactId ?? "").trim(),
            amountSat: Math.max(
              0,
              Math.trunc(Number(pendingPayment.amountSat ?? 0) || 0),
            ),
            createdAtSec: Math.max(
              0,
              Math.trunc(Number(pendingPayment.createdAtSec ?? 0) || 0),
            ),
            ...(pendingPayment.messageId
              ? { messageId: String(pendingPayment.messageId) }
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
        contactId: String(payload.contactId ?? ""),
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
      if (!ownerId || !id) return;

      setPendingPayments((prev) => {
        const next = prev.filter(
          (pendingPayment) => String(pendingPayment.id ?? "") !== id,
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
        const id = String(message.contactId ?? "").trim();
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

  const chatMessages = React.useMemo(() => {
    const id = String(chatContactId ?? "").trim();
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
    chatMessages,
    chatMessagesLatestRef,
    enqueuePendingPayment,
    lastMessageByContactId,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesLocal,
    nostrMessagesRecent,
    pendingPayments,
    refreshLocalNostrMessages,
    removePendingPayment,
    updateLocalNostrMessage,
  };
};
