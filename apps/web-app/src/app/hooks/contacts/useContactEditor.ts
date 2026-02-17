import * as Evolu from "@evolu/common";
import React from "react";
import type { ContactId } from "../../../evolu";
import { navigateTo } from "../../../hooks/useRouting";
import {
  fetchNostrProfileMetadata,
  saveCachedProfileMetadata,
} from "../../../nostrProfile";
import type { Route } from "../../../types/route";
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
  insert: EvoluMutations["insert"];
  nostrFetchRelays: string[];
  route: Route;
  selectedContact: SelectedContactRow | null;
  setContactNewPrefill: React.Dispatch<
    React.SetStateAction<ContactNewPrefill | null>
  >;
  setPendingDeleteId: React.Dispatch<React.SetStateAction<ContactId | null>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
  update: EvoluMutations["update"];
}

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
  insert,
  nostrFetchRelays,
  route,
  selectedContact,
  setContactNewPrefill,
  setPendingDeleteId,
  setStatus,
  t,
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

  React.useEffect(() => {
    if (route.kind === "contactNew") {
      setPendingDeleteId(null);
      setEditingId(null);
      setContactEditInitial(null);
      setForm(makeEmptyContactForm());
      if (contactNewPrefill) {
        setForm({
          name: contactNewPrefill.suggestedName ?? "",
          npub: contactNewPrefill.npub ?? "",
          lnAddress: contactNewPrefill.lnAddress,
          group: "",
        });
        setContactNewPrefill(null);
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

  const handleSaveContact = React.useCallback(() => {
    if (isSavingContact) return; // Prevent double-click

    const name = form.name.trim();
    const rawNpub = form.npub.trim();
    const npub = normalizeNpubIdentifier(rawNpub) ?? rawNpub;
    const lnAddress = form.lnAddress.trim();
    const group = form.group.trim();

    if (!name && !npub && !lnAddress) {
      setStatus(t("fillAtLeastOne"));
      return;
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
        ? insert("contact", payload, { ownerId: appOwnerId })
        : insert("contact", payload);
      if (result.ok) {
        setStatus(t("contactSaved"));
      } else {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
        setIsSavingContact(false);
        return;
      }
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
    clearContactForm,
    contactEditInitial,
    editingId,
    form.group,
    form.lnAddress,
    form.name,
    form.npub,
    insert,
    isSavingContact,
    route.kind,
    setPendingDeleteId,
    setStatus,
    t,
    updateContactFields,
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
