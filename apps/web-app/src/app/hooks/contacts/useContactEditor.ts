import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import React from "react";
import { evolu, type ContactId, type TransactionId } from "../../../evolu";
import { navigateTo } from "../../../hooks/useRouting";
import {
  cacheProfileAvatarFromUrl,
  deleteCachedProfileAvatar,
  fetchNostrProfileMetadata,
  getNostrProfilePictureUrl,
  saveCachedProfileMetadata,
  saveCachedProfilePicture,
} from "../../../nostrProfile";
import type { Route } from "../../../types/route";
import { MAX_CONTACTS_PER_OWNER } from "../../../utils/constants";
import { getBestNostrName } from "../../../utils/formatting";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
import type {
  ContactFormState,
  ContactIdentityRowLike,
  ContactRowLike,
} from "../../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

export interface ContactNewPrefill {
  lnAddress: string;
  npub: string | null;
  suggestedName: string | null;
}

type ContactRow = ContactIdentityRowLike;
type SelectedContactRow = ContactRowLike & { id: ContactId };

interface UseContactEditorParams {
  appOwnerId: Evolu.OwnerId | null;
  contactNewPrefill: ContactNewPrefill | null;
  contacts: readonly ContactRow[];
  currentNpub: string | null;
  insert: EvoluMutations["insert"];
  nostrFetchRelays: string[];
  recordTransactionsOwnerWrite: (count?: number) => void;
  route: Route;
  selectedContact: SelectedContactRow | null;
  setContactNewPrefill: React.Dispatch<
    React.SetStateAction<ContactNewPrefill | null>
  >;
  setPendingDeleteId: React.Dispatch<React.SetStateAction<ContactId | null>>;
  recordContactsOwnerWrite: (count?: number) => void;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
  transactionsOwnerId: Evolu.OwnerId | null;
  update: EvoluMutations["update"];
}

const readText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const readLightningAddressFromDetailsJson = (value: unknown): string | null => {
  const detailsJson = readText(value);
  if (!detailsJson) return null;

  try {
    const parsed: unknown = JSON.parse(detailsJson);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    return readText(
      "lightningAddress" in parsed ? parsed.lightningAddress : null,
    );
  } catch {
    return null;
  }
};

export const makeEmptyContactForm = (): ContactFormState => ({
  name: "",
  npub: "",
  lnAddress: "",
  group: "",
});

export const useContactEditor = ({
  appOwnerId,
  contactNewPrefill,
  contacts,
  currentNpub,
  insert,
  nostrFetchRelays,
  recordTransactionsOwnerWrite,
  route,
  selectedContact,
  setContactNewPrefill,
  setPendingDeleteId,
  recordContactsOwnerWrite,
  setStatus,
  t,
  transactionsOwnerId,
  update,
}: UseContactEditorParams) => {
  const [form, setForm] = React.useState<ContactFormState>(
    makeEmptyContactForm(),
  );
  const [editingId, setEditingId] = React.useState<ContactId | null>(null);
  const [isSavingContact, setIsSavingContact] = React.useState(false);
  const [contactEditInitial, setContactEditInitial] = React.useState<{
    group: string;
    id: ContactId;
    lnAddress: string;
    name: string;
    npub: string;
  } | null>(null);
  const previousRouteKindRef = React.useRef<Route["kind"] | null>(null);

  const transactionsQuery = React.useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("transaction")
          .select(["id", "contactId", "method", "detailsJson"])
          .where("isDeleted", "is not", Evolu.sqliteTrue),
      ),
    [],
  );
  const transactionRows = useQuery(transactionsQuery);

  const openScannedContactPendingNpubRef = React.useRef<string | null>(null);

  const clearContactForm = React.useCallback(() => {
    setForm(makeEmptyContactForm());
    setEditingId(null);
    setContactEditInitial(null);
  }, []);

  const updateContactFields = React.useCallback(
    (
      payload: {
        id: ContactId;
      } & Partial<
        Record<
          "lnAddress" | "name" | "npub",
          typeof Evolu.NonEmptyString1000.Type | null
        >
      >,
    ) => {
      if (!appOwnerId) return update("contact", payload);
      const scoped = update("contact", payload, { ownerId: appOwnerId });
      if (scoped.ok) return scoped;
      return update("contact", payload);
    },
    [appOwnerId, update],
  );

  const updateTransactionFields = React.useCallback(
    (payload: { contactId: ContactId; id: TransactionId }) => {
      if (transactionsOwnerId) {
        const scoped = update("transaction", payload, {
          ownerId: transactionsOwnerId,
        });
        if (scoped.ok) return scoped;
      }

      return update("transaction", payload);
    },
    [transactionsOwnerId, update],
  );

  const backfillLightningAddressTransactions = React.useCallback(
    (contactId: ContactId, lnAddress: string) => {
      const normalizedLnAddress = lnAddress.trim().toLowerCase();
      if (!normalizedLnAddress) return;

      let updatedCount = 0;
      for (const row of transactionRows) {
        if (typeof row !== "object" || row === null) continue;

        const transactionId = readText("id" in row ? row.id : null);
        if (!transactionId) continue;

        const existingContactId = readText(
          "contactId" in row ? row.contactId : null,
        );
        if (existingContactId) continue;

        const method = readText("method" in row ? row.method : null);
        if (method !== "lightning_address") continue;

        const transactionLnAddress = readLightningAddressFromDetailsJson(
          "detailsJson" in row ? row.detailsJson : null,
        );
        if (!transactionLnAddress) continue;
        if (transactionLnAddress.toLowerCase() !== normalizedLnAddress)
          continue;

        const result = updateTransactionFields({
          id: transactionId as TransactionId,
          contactId,
        });
        if (!result.ok) continue;
        updatedCount += 1;
      }

      if (updatedCount > 0) {
        recordTransactionsOwnerWrite(updatedCount);
      }
    },
    [recordTransactionsOwnerWrite, transactionRows, updateTransactionFields],
  );

  React.useEffect(() => {
    const previousRouteKind = previousRouteKindRef.current;
    previousRouteKindRef.current = route.kind;

    if (route.kind === "contactNew") {
      setPendingDeleteId(null);
      setEditingId(null);
      setContactEditInitial(null);
      if (contactNewPrefill) {
        setForm({
          name: contactNewPrefill.suggestedName ?? "",
          npub: contactNewPrefill.npub ?? "",
          lnAddress: contactNewPrefill.lnAddress,
          group: "",
        });
        setContactNewPrefill(null);
      } else if (previousRouteKind !== "contactNew") {
        setForm(makeEmptyContactForm());
      }
      return;
    }

    if (route.kind !== "contactEdit") return;
    setPendingDeleteId(null);

    if (!selectedContact) {
      setEditingId(null);
      setContactEditInitial(null);
      setForm(makeEmptyContactForm());
      return;
    }

    setEditingId(selectedContact.id);
    setContactEditInitial((prev) => {
      if (prev?.id === selectedContact.id) return prev;
      return {
        id: selectedContact.id as ContactId,
        name: String(selectedContact.name ?? ""),
        npub: String(selectedContact.npub ?? ""),
        lnAddress: String(selectedContact.lnAddress ?? ""),
        group: String(selectedContact.groupName ?? ""),
      };
    });
    setForm({
      name: String(selectedContact.name ?? ""),
      npub: String(selectedContact.npub ?? ""),
      lnAddress: String(selectedContact.lnAddress ?? ""),
      group: String(selectedContact.groupName ?? ""),
    });
  }, [
    contactNewPrefill,
    route.kind,
    selectedContact,
    setContactNewPrefill,
    setPendingDeleteId,
  ]);

  const refreshContactAvatarFromNostr = React.useCallback(
    async (npub: string) => {
      const normalized = normalizeNpubIdentifier(String(npub ?? "").trim());
      if (!normalized) return;

      try {
        const metadata = await fetchNostrProfileMetadata(normalized, {
          relays: nostrFetchRelays,
        });

        saveCachedProfileMetadata(normalized, metadata);
        if (!metadata) return;

        const pictureUrl = getNostrProfilePictureUrl(metadata);
        if (pictureUrl) {
          saveCachedProfilePicture(normalized, pictureUrl);
          void cacheProfileAvatarFromUrl(normalized, pictureUrl);
          return;
        }

        saveCachedProfilePicture(normalized, null);
        void deleteCachedProfileAvatar(normalized);
      } catch {
        // ignore
      }
    },
    [nostrFetchRelays],
  );

  const handleSaveContact = React.useCallback(() => {
    if (isSavingContact) return; // Prevent double-click

    const name = form.name.trim();
    const rawNpub = form.npub.trim();
    const npub = normalizeNpubIdentifier(rawNpub) ?? rawNpub;
    const currentProfileNpub = normalizeNpubIdentifier(currentNpub);
    const lnAddress = form.lnAddress.trim();
    const group = form.group.trim();

    if (!name && !npub && !lnAddress) {
      setStatus(t("fillAtLeastOne"));
      return;
    }

    if (!editingId && contacts.length >= MAX_CONTACTS_PER_OWNER) {
      setStatus(
        t("contactsLimitReached").replace(
          "{max}",
          String(MAX_CONTACTS_PER_OWNER),
        ),
      );
      return;
    }

    if (npub && currentProfileNpub && npub === currentProfileNpub) {
      setStatus(t("contactIsYou"));
      navigateTo({ route: "profile" });
      return;
    }

    if (npub) {
      const duplicate = contacts.find((contact) => {
        if (editingId && contact.id === editingId) return false;
        return normalizeNpubIdentifier(contact.npub) === npub;
      });

      if (duplicate?.id) {
        setStatus(t("contactExists"));
        navigateTo({ route: "contact", id: duplicate.id as ContactId });
        return;
      }
    }

    setIsSavingContact(true);

    const payload = {
      name: name ? (name as typeof Evolu.NonEmptyString1000.Type) : null,
      npub: npub ? (npub as typeof Evolu.NonEmptyString1000.Type) : null,
      lnAddress: lnAddress
        ? (lnAddress as typeof Evolu.NonEmptyString1000.Type)
        : null,
      groupName: group ? (group as typeof Evolu.NonEmptyString1000.Type) : null,
    };
    let savedContactId: ContactId | null = editingId;

    const createPayload: Partial<{
      groupName: typeof Evolu.NonEmptyString1000.Type;
      lnAddress: typeof Evolu.NonEmptyString1000.Type;
      name: typeof Evolu.NonEmptyString1000.Type;
      npub: typeof Evolu.NonEmptyString1000.Type;
    }> = {};
    if (payload.name) createPayload.name = payload.name;
    if (payload.npub) createPayload.npub = payload.npub;
    if (payload.lnAddress) createPayload.lnAddress = payload.lnAddress;
    if (payload.groupName) createPayload.groupName = payload.groupName;

    if (editingId) {
      // Build update payload with only changed fields to minimize history entries.
      const initial = contactEditInitial;
      const changedFields: {
        id: typeof editingId;
      } & Partial<
        Record<
          "groupName" | "lnAddress" | "name" | "npub",
          typeof Evolu.NonEmptyString1000.Type | null
        >
      > = { id: editingId };

      if (initial?.id === editingId) {
        const nextName = payload.name ? String(payload.name) : null;
        const nextNpub = payload.npub ? String(payload.npub) : null;
        const nextLn = payload.lnAddress ? String(payload.lnAddress) : null;
        const nextGroup = payload.groupName ? String(payload.groupName) : null;

        const prevName = initial.name || null;
        const prevNpub = initial.npub || null;
        const prevLn = initial.lnAddress || null;
        const prevGroup = initial.group || null;

        if ((prevName ?? "") !== (nextName ?? "")) {
          changedFields.name = payload.name;
        }
        if ((prevNpub ?? "") !== (nextNpub ?? "")) {
          changedFields.npub = payload.npub;
        }
        if ((prevLn ?? "") !== (nextLn ?? "")) {
          changedFields.lnAddress = payload.lnAddress;
        }
        if ((prevGroup ?? "") !== (nextGroup ?? "")) {
          changedFields.groupName = payload.groupName;
        }
      } else {
        // Fallback: if we don't have initial data, update all fields.
        Object.assign(changedFields, payload);
      }

      // Only update if there are actual changes (besides just the id).
      if (Object.keys(changedFields).length > 1) {
        const result = updateContactFields(changedFields);
        if (result.ok) {
          recordContactsOwnerWrite();
          setStatus(t("contactUpdated"));
        } else {
          setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
          setIsSavingContact(false);
          return;
        }
      } else {
        setStatus(t("contactUpdated"));
      }
    } else {
      const result = appOwnerId
        ? insert("contact", createPayload, { ownerId: appOwnerId })
        : insert("contact", createPayload);
      if (result.ok) {
        savedContactId = result.value.id;
        recordContactsOwnerWrite();
        setStatus(t("contactSaved"));
      } else {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
        setIsSavingContact(false);
        return;
      }
    }

    if (savedContactId && lnAddress) {
      backfillLightningAddressTransactions(savedContactId, lnAddress);
    }

    if (npub) {
      void refreshContactAvatarFromNostr(npub);
    }

    if (route.kind === "contactEdit" && editingId) {
      navigateTo({ route: "contact", id: editingId });
      setIsSavingContact(false);
      return;
    }

    clearContactForm();
    setPendingDeleteId(null);
    navigateTo({ route: "contacts" });
    setIsSavingContact(false);
  }, [
    appOwnerId,
    backfillLightningAddressTransactions,
    clearContactForm,
    contactEditInitial,
    contacts,
    currentNpub,
    editingId,
    form.group,
    form.lnAddress,
    form.name,
    form.npub,
    insert,
    isSavingContact,
    route.kind,
    recordContactsOwnerWrite,
    setPendingDeleteId,
    setStatus,
    t,
    updateContactFields,
    refreshContactAvatarFromNostr,
  ]);

  const refreshContactFromNostr = React.useCallback(
    async (contactId: ContactId, npub: string) => {
      const source = String(npub ?? "").trim();
      const normalized = normalizeNpubIdentifier(source);
      if (!normalized) return;

      try {
        const metadata = await fetchNostrProfileMetadata(normalized, {
          relays: nostrFetchRelays,
        });

        saveCachedProfileMetadata(normalized, metadata);
        if (!metadata) return;

        const bestName = getBestNostrName(metadata);
        const ln =
          String(metadata.lud16 ?? "").trim() ||
          String(metadata.lud06 ?? "").trim();

        const patch: Partial<{
          name: typeof Evolu.NonEmptyString1000.Type;
          lnAddress: typeof Evolu.NonEmptyString1000.Type;
          npub: typeof Evolu.NonEmptyString1000.Type;
        }> = {};

        if (bestName) {
          patch.name = bestName as typeof Evolu.NonEmptyString1000.Type;
        }
        if (ln) {
          patch.lnAddress = ln as typeof Evolu.NonEmptyString1000.Type;
        }
        if (source !== normalized) {
          patch.npub = normalized as typeof Evolu.NonEmptyString1000.Type;
        }

        if (Object.keys(patch).length > 0) {
          updateContactFields({ id: contactId, ...patch });
        }
      } catch {
        // ignore
      }
    },
    [nostrFetchRelays, updateContactFields],
  );

  React.useEffect(() => {
    const targetNpub = openScannedContactPendingNpubRef.current;
    if (!targetNpub) return;
    const normalizedTarget = normalizeNpubIdentifier(targetNpub);
    if (!normalizedTarget) return;
    const existing = contacts.find(
      (c) => normalizeNpubIdentifier(c.npub) === normalizedTarget,
    );
    if (!existing?.id) return;
    openScannedContactPendingNpubRef.current = null;
    navigateTo({ route: "contact", id: existing.id as ContactId });
    void refreshContactFromNostr(existing.id as ContactId, normalizedTarget);
  }, [contacts, refreshContactFromNostr]);

  const resetEditedContactFieldFromNostr = React.useCallback(
    async (field: "name" | "lnAddress") => {
      if (route.kind !== "contactEdit") return;
      if (!editingId) return;

      const rawNpub = String(form.npub ?? "").trim();
      const npub = normalizeNpubIdentifier(rawNpub);

      // First clear the custom value.
      if (field === "name") {
        setForm((prev) => ({ ...prev, name: "" }));
        updateContactFields({ id: editingId, name: null });
      } else {
        setForm((prev) => ({ ...prev, lnAddress: "" }));
        updateContactFields({ id: editingId, lnAddress: null });
      }

      if (!npub) return;

      // Then fetch Nostr metadata and repopulate.
      try {
        const metadata = await fetchNostrProfileMetadata(npub, {
          relays: nostrFetchRelays,
        });
        saveCachedProfileMetadata(npub, metadata);
        if (!metadata) return;

        const bestName = getBestNostrName(metadata);
        const ln =
          String(metadata.lud16 ?? "").trim() ||
          String(metadata.lud06 ?? "").trim();

        if (bestName) {
          setForm((prev) => ({ ...prev, name: bestName }));
        }
        if (ln) {
          setForm((prev) => ({ ...prev, lnAddress: ln }));
        }

        const patch: Partial<{
          name: typeof Evolu.NonEmptyString1000.Type;
          lnAddress: typeof Evolu.NonEmptyString1000.Type;
          npub: typeof Evolu.NonEmptyString1000.Type;
        }> = {};
        if (bestName) {
          patch.name = bestName as typeof Evolu.NonEmptyString1000.Type;
        }
        if (ln) {
          patch.lnAddress = ln as typeof Evolu.NonEmptyString1000.Type;
        }
        if (rawNpub !== npub) {
          patch.npub = npub as typeof Evolu.NonEmptyString1000.Type;
        }
        if (Object.keys(patch).length > 0) {
          updateContactFields({ id: editingId, ...patch });
        }
      } catch {
        // ignore
      }
    },
    [editingId, form.npub, nostrFetchRelays, route.kind, updateContactFields],
  );

  const contactEditsSavable = React.useMemo(() => {
    if (!editingId) return false;
    if (route.kind !== "contactEdit") return false;
    const initial = contactEditInitial;
    if (!initial || initial.id !== editingId) return false;

    const name = form.name.trim();
    const npub = form.npub.trim();
    const lnAddress = form.lnAddress.trim();
    const group = form.group.trim();

    const hasRequired = Boolean(name || npub || lnAddress);
    if (!hasRequired) return false;

    const dirty =
      name !== initial.name.trim() ||
      npub !== initial.npub.trim() ||
      lnAddress !== initial.lnAddress.trim() ||
      group !== initial.group.trim();

    return dirty;
  }, [
    contactEditInitial,
    editingId,
    form.group,
    form.lnAddress,
    form.name,
    form.npub,
    route.kind,
  ]);

  return {
    clearContactForm,
    contactEditsSavable,
    editingId,
    form,
    handleSaveContact,
    isSavingContact,
    openScannedContactPendingNpubRef,
    refreshContactFromNostr,
    resetEditedContactFieldFromNostr,
    setEditingId,
    setForm,
  };
};
