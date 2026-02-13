import React from "react";

interface ContactRow {
  id?: unknown;
  name?: unknown;
}

interface ContactsSearchItem<TContact extends ContactRow> {
  contact: TContact;
  groupName?: string | null;
  haystack: string;
  idKey: string | null;
}

interface LastMessageRow {
  createdAtSec?: unknown;
}

interface UseVisibleContactsParams<TContact extends ContactRow> {
  activeGroup: string | null;
  contactAttentionById: Record<string, number>;
  contactNameCollator: Intl.Collator;
  contactsSearchData: readonly ContactsSearchItem<TContact>[];
  contactsSearchParts: readonly string[];
  lastMessageByContactId: ReadonlyMap<string, LastMessageRow>;
  noGroupFilterValue: string;
}

interface VisibleContactsResult<TContact extends ContactRow> {
  conversations: TContact[];
  others: TContact[];
}

export const useVisibleContacts = <TContact extends ContactRow>({
  activeGroup,
  contactAttentionById,
  contactNameCollator,
  contactsSearchData,
  contactsSearchParts,
  lastMessageByContactId,
  noGroupFilterValue,
}: UseVisibleContactsParams<TContact>): VisibleContactsResult<TContact> => {
  return React.useMemo(() => {
    const matchesSearch = (item: (typeof contactsSearchData)[number]) => {
      if (contactsSearchParts.length === 0) return true;
      return contactsSearchParts.every((part) => item.haystack.includes(part));
    };

    const filtered = (() => {
      if (!activeGroup) return contactsSearchData;
      if (activeGroup === noGroupFilterValue) {
        return contactsSearchData.filter((item) => !item.groupName);
      }
      return contactsSearchData.filter(
        (item) => item.groupName === activeGroup,
      );
    })();

    const searchFiltered = contactsSearchParts.length
      ? filtered.filter(matchesSearch)
      : filtered;

    const withConversation: TContact[] = [];
    const withoutConversation: TContact[] = [];

    for (const item of searchFiltered) {
      const key = item.idKey;
      const contact = item.contact;
      if (key && lastMessageByContactId.has(key)) {
        withConversation.push(contact);
      } else {
        withoutConversation.push(contact);
      }
    }

    const sortWithConversation = (a: TContact, b: TContact) => {
      const aKey = String(a.id ?? "");
      const bKey = String(b.id ?? "");
      const aAttention = aKey ? (contactAttentionById[aKey] ?? 0) : 0;
      const bAttention = bKey ? (contactAttentionById[bKey] ?? 0) : 0;
      if (aAttention !== bAttention) return bAttention - aAttention;

      const aMsg = aKey ? lastMessageByContactId.get(aKey) : null;
      const bMsg = bKey ? lastMessageByContactId.get(bKey) : null;
      const aAt = aMsg ? Number(aMsg.createdAtSec ?? 0) || 0 : 0;
      const bAt = bMsg ? Number(bMsg.createdAtSec ?? 0) || 0 : 0;
      if (aAt !== bAt) return bAt - aAt;

      return contactNameCollator.compare(
        String(a.name ?? ""),
        String(b.name ?? ""),
      );
    };

    const sortWithoutConversation = (a: TContact, b: TContact) => {
      const aKey = String(a.id ?? "");
      const bKey = String(b.id ?? "");
      const aAttention = aKey ? (contactAttentionById[aKey] ?? 0) : 0;
      const bAttention = bKey ? (contactAttentionById[bKey] ?? 0) : 0;
      if (aAttention !== bAttention) return bAttention - aAttention;

      return contactNameCollator.compare(
        String(a.name ?? ""),
        String(b.name ?? ""),
      );
    };

    return {
      conversations: [...withConversation].sort(sortWithConversation),
      others: [...withoutConversation].sort(sortWithoutConversation),
    };
  }, [
    activeGroup,
    contactAttentionById,
    contactNameCollator,
    contactsSearchData,
    contactsSearchParts,
    lastMessageByContactId,
    noGroupFilterValue,
  ]);
};
