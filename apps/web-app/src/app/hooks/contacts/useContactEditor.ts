import * as Evolu from "@evolu/common";
import { fetchProfileAtom, useAtomSet } from "@linky/linkstr-react";
import type { Event as NostrToolsEvent } from "nostr-tools";
import React from "react";
import { omitSyntheticContactLightningAddress } from "../../../derivedProfile";
import { evolu, type ContactId, type TransactionId } from "../../../evolu";
import { navigateTo } from "../../../hooks/useRouting";
import {
  getProfilePictureUrl,
  isDisplayableProfilePictureUrl,
  loadCachedProfile,
} from "../../../profileCache";
import type { Route } from "../../../types/route";
import { MAX_CONTACTS_PER_OWNER } from "../../../utils/constants";
import { getBestNostrName } from "../../../utils/formatting";
import {
  DEFAULT_NIP05_DOMAIN,
  parseNip05IdentifierInput,
  resolveNip05Input,
} from "../../../utils/nostrNip05";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
import { getContactQueryPrefill } from "../../lib/contactQueryPrefill";
import { getSharedAppNostrPool } from "../../lib/nostrPool";
import { fetchAndCacheProfile } from "../useLinkstrProfileSync";
import type { ContactFormState, ContactRowLike } from "../../types/appTypes";
import {
  getContactGroups,
  serializeContactGroups,
} from "../../../utils/contactGroups";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

export interface ContactNewPrefill {
  lnAddress: string;
  npub: string | null;
  suggestedName: string | null;
}

export interface ContactSearchCandidate {
  existingContactId?: string;
  lnAddress: string;
  name: string;
  npub: string;
  pictureUrl: string | null;
  query: string;
}

export interface ContactSuggestionCandidate extends ContactSearchCandidate {
  lastSeenAtSec: number;
}

export type ContactSearchResult =
  | { kind: "empty" }
  | { kind: "error"; identifier: string }
  | { kind: "found"; contact: ContactSearchCandidate }
  | { kind: "not_found"; query: string };

type ContactRow = ContactRowLike;
type SelectedContactRow = ContactRowLike & { id: ContactId };

type ContactFieldsPatch = {
  id: ContactId;
  nameSetByUser?: typeof Evolu.SqliteBoolean.Type | null;
} & Partial<
  Record<
    "groupName" | "groupNamesJson" | "lnAddress" | "name" | "npub",
    typeof Evolu.NonEmptyString1000.Type | null
  >
>;

interface UseContactEditorParams {
  activeOwnerContactsCount: number;
  appOwnerId: Evolu.OwnerId | null;
  contactNewPrefill: ContactNewPrefill | null;
  contacts: readonly ContactRow[];
  currentNpub: string | null;
  insert: EvoluMutations["insert"];
  nostrFetchRelays: string[];
  route: Route;
  selectedContact: SelectedContactRow | null;
  setContactNewPrefill: React.Dispatch<
    React.SetStateAction<ContactNewPrefill | null>
  >;
  setPendingDeleteId: React.Dispatch<React.SetStateAction<ContactId | null>>;
  setRecentlyAddedContactId: React.Dispatch<
    React.SetStateAction<ContactId | null>
  >;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
  transactionsOwnerId: Evolu.OwnerId | null;
  update: EvoluMutations["update"];
  upsert: EvoluMutations["upsert"];
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

const decodeDirectNpubIdentifier = async (
  value: string,
): Promise<string | null> => {
  const normalized = normalizeNpubIdentifier(value);
  if (!normalized || !/^npub1/i.test(normalized)) return null;

  try {
    const { nip19 } = await import("nostr-tools");
    const decoded = nip19.decode(normalized);
    if (decoded.type !== "npub") return null;
    return normalized;
  } catch {
    return null;
  }
};

const CONTACT_SUGGESTION_LIMIT = 3;
const CONTACT_SUGGESTION_AUTHOR_SCAN_LIMIT = 64;
const CONTACT_SUGGESTION_ACTIVE_WINDOW_SEC = 45 * 24 * 60 * 60;
const CONTACT_SUGGESTION_RECENT_EVENT_KINDS = [0, 1, 6, 7, 9735, 30315];
const LINKY_LIGHTNING_ADDRESS_SUFFIX = "@linky.fit";

const isHexPubkey = (value: string): boolean => /^[0-9a-f]{64}$/i.test(value);

const readProfileText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

/** Raw kind-0 fields the discovery scan reads straight off pool events. */
interface DiscoveredProfileMetadata {
  displayName?: string;
  image?: string;
  lud06?: string;
  lud16?: string;
  name?: string;
  nip05?: string;
  picture?: string;
}

const discoveredPictureUrl = (
  metadata: DiscoveredProfileMetadata,
): string | null => {
  if (isDisplayableProfilePictureUrl(metadata.picture)) {
    return metadata.picture.trim();
  }
  if (isDisplayableProfilePictureUrl(metadata.image)) {
    return metadata.image.trim();
  }
  return null;
};

const parseProfileMetadataEvent = (
  event: NostrToolsEvent,
): DiscoveredProfileMetadata | null => {
  if (!event.content) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.content);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const metadata: DiscoveredProfileMetadata = {};

  if ("name" in parsed) {
    const name = readProfileText(parsed.name);
    if (name) metadata.name = name;
  }
  if ("display_name" in parsed) {
    const displayName = readProfileText(parsed.display_name);
    if (displayName) metadata.displayName = displayName;
  }
  if ("displayName" in parsed && !metadata.displayName) {
    const displayName = readProfileText(parsed.displayName);
    if (displayName) metadata.displayName = displayName;
  }
  if ("lud16" in parsed) {
    const lud16 = readProfileText(parsed.lud16);
    if (lud16) metadata.lud16 = lud16;
  }
  if ("lud06" in parsed) {
    const lud06 = readProfileText(parsed.lud06);
    if (lud06) metadata.lud06 = lud06;
  }
  if ("nip05" in parsed) {
    const nip05 = readProfileText(parsed.nip05);
    if (nip05) metadata.nip05 = nip05;
  }
  if ("picture" in parsed) {
    const picture = readProfileText(parsed.picture);
    if (picture) metadata.picture = picture;
  }
  if ("image" in parsed) {
    const image = readProfileText(parsed.image);
    if (image) metadata.image = image;
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
};

const isLinkyLightningAddress = (value: string): boolean =>
  value.trim().toLowerCase().endsWith(LINKY_LIGHTNING_ADDRESS_SUFFIX);

const getNewestEventByPubkey = (
  events: readonly NostrToolsEvent[],
): Map<string, NostrToolsEvent> => {
  const newestByPubkey = new Map<string, NostrToolsEvent>();

  for (const event of events) {
    const pubkey = String(event.pubkey ?? "").trim();
    if (!isHexPubkey(pubkey)) continue;

    const existing = newestByPubkey.get(pubkey);
    if (!existing || event.created_at > existing.created_at) {
      newestByPubkey.set(pubkey, event);
    }
  }

  return newestByPubkey;
};

export const makeEmptyContactForm = (): ContactFormState => ({
  name: "",
  npub: "",
  lnAddress: "",
  groups: [],
});

export const useContactEditor = ({
  activeOwnerContactsCount,
  appOwnerId,
  contactNewPrefill,
  contacts,
  currentNpub,
  insert,
  nostrFetchRelays,
  route,
  selectedContact,
  setContactNewPrefill,
  setPendingDeleteId,
  setRecentlyAddedContactId,
  setStatus,
  t,
  transactionsOwnerId,
  update,
  upsert,
}: UseContactEditorParams) => {
  const [form, setForm] = React.useState<ContactFormState>(
    makeEmptyContactForm(),
  );
  const [editingId, setEditingId] = React.useState<ContactId | null>(null);
  const [isSavingContact, setIsSavingContact] = React.useState(false);
  const [contactSuggestions, setContactSuggestions] = React.useState<
    ContactSuggestionCandidate[]
  >([]);
  const [contactEditInitial, setContactEditInitial] = React.useState<{
    groups: string[];
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
          .select(["id", "ownerId", "contactId", "method", "detailsJson"])
          .where("isDeleted", "is not", Evolu.sqliteTrue),
      ),
    [],
  );

  const openScannedContactPendingNpubRef = React.useRef<string | null>(null);

  const fetchProfileOneShot = useAtomSet(fetchProfileAtom, {
    mode: "promiseExit",
  });

  const clearContactForm = React.useCallback(() => {
    setForm(makeEmptyContactForm());
    setEditingId(null);
    setContactEditInitial(null);
  }, []);

  const clearContactSuggestions = React.useCallback(() => {
    setContactSuggestions((current) => (current.length === 0 ? current : []));
  }, []);
  const contactSuggestionRelayKey = nostrFetchRelays
    .map((relay) => relay.trim())
    .filter(Boolean)
    .join("\n");
  const contactSuggestionKnownNpubsKey = Array.from(
    new Set(
      [
        ...contacts.map((contact) => normalizeNpubIdentifier(contact.npub)),
        normalizeNpubIdentifier(currentNpub),
      ].filter((npub): npub is string => Boolean(npub)),
    ),
  )
    .sort()
    .join("\n");

  React.useEffect(() => {
    if (route.kind !== "contactNew") {
      clearContactSuggestions();
      return;
    }

    if (form.npub.trim()) {
      clearContactSuggestions();
      return;
    }

    const relays = contactSuggestionRelayKey
      ? contactSuggestionRelayKey.split("\n")
      : [];
    if (relays.length === 0) {
      clearContactSuggestions();
      return;
    }

    const knownNpubs = new Set(
      contactSuggestionKnownNpubsKey
        ? contactSuggestionKnownNpubsKey.split("\n")
        : [],
    );

    let cancelled = false;

    const loadSuggestions = async () => {
      try {
        const since =
          Math.floor(Date.now() / 1000) - CONTACT_SUGGESTION_ACTIVE_WINDOW_SEC;
        const pool = await getSharedAppNostrPool();
        const recentEvents = await pool.querySync(
          relays,
          {
            kinds: CONTACT_SUGGESTION_RECENT_EVENT_KINDS,
            limit: CONTACT_SUGGESTION_AUTHOR_SCAN_LIMIT,
            since,
          },
          { maxWait: 3500 },
        );
        if (cancelled) return;

        const activityByPubkey = getNewestEventByPubkey(recentEvents);
        const authors = Array.from(activityByPubkey.entries())
          .sort((a, b) => b[1].created_at - a[1].created_at)
          .map((entry) => entry[0]);

        if (authors.length === 0) {
          clearContactSuggestions();
          return;
        }

        const profileEvents = await pool.querySync(
          relays,
          {
            authors,
            kinds: [0],
            limit: authors.length * 2,
          },
          { maxWait: 4500 },
        );
        if (cancelled) return;

        const newestProfileByPubkey = getNewestEventByPubkey(profileEvents);
        const { nip19 } = await import("nostr-tools");
        const nextSuggestions: ContactSuggestionCandidate[] = [];

        for (const pubkey of authors) {
          if (nextSuggestions.length >= CONTACT_SUGGESTION_LIMIT) break;

          let npub = "";
          try {
            npub = nip19.npubEncode(pubkey);
          } catch {
            continue;
          }

          if (knownNpubs.has(npub)) continue;

          const profileEvent = newestProfileByPubkey.get(pubkey);
          if (!profileEvent) continue;

          const metadata = parseProfileMetadataEvent(profileEvent);
          if (!metadata) continue;

          const lnAddress = omitSyntheticContactLightningAddress(
            String(metadata.lud16 ?? "").trim() ||
              String(metadata.lud06 ?? "").trim(),
            npub,
          );
          if (!isLinkyLightningAddress(lnAddress)) continue;

          const pictureUrl = discoveredPictureUrl(metadata);

          nextSuggestions.push({
            lastSeenAtSec: activityByPubkey.get(pubkey)?.created_at ?? since,
            lnAddress,
            name: getBestNostrName(metadata) ?? lnAddress,
            npub,
            pictureUrl,
            query: lnAddress,
          });
        }

        setContactSuggestions(nextSuggestions);
      } catch {
        if (!cancelled) clearContactSuggestions();
      }
    };

    void loadSuggestions();

    return () => {
      cancelled = true;
    };
  }, [
    clearContactSuggestions,
    contactSuggestionKnownNpubsKey,
    contactSuggestionRelayKey,
    form.npub,
    route.kind,
  ]);

  const buildFullContactOverridePayload = React.useCallback(
    (payload: ContactFieldsPatch) => {
      const currentOwnerId = readText(appOwnerId);
      if (!currentOwnerId) return null;

      const source =
        contacts.find((contact) => contact.id === payload.id) ?? null;
      const sourceOwnerId = readText(source?.ownerId);
      if (!source || !sourceOwnerId || sourceOwnerId === currentOwnerId) {
        return null;
      }

      const sourceNameSetByUser = Evolu.SqliteBoolean.fromUnknown(
        source.nameSetByUser,
      );

      return {
        nameSetByUser:
          payload.nameSetByUser !== undefined
            ? payload.nameSetByUser
            : sourceNameSetByUser.ok
              ? sourceNameSetByUser.value
              : null,
        id: payload.id,
        name:
          payload.name !== undefined
            ? payload.name
            : (readText(source.name) as
                | typeof Evolu.NonEmptyString1000.Type
                | null),
        npub:
          payload.npub !== undefined
            ? payload.npub
            : (readText(source.npub) as
                | typeof Evolu.NonEmptyString1000.Type
                | null),
        lnAddress:
          payload.lnAddress !== undefined
            ? payload.lnAddress
            : (readText(source.lnAddress) as
                | typeof Evolu.NonEmptyString1000.Type
                | null),
        groupName:
          payload.groupName !== undefined
            ? payload.groupName
            : (readText(source.groupName) as
                | typeof Evolu.NonEmptyString1000.Type
                | null),
        groupNamesJson:
          payload.groupNamesJson !== undefined
            ? payload.groupNamesJson
            : (readText(source.groupNamesJson) as
                | typeof Evolu.NonEmptyString1000.Type
                | null),
      };
    },
    [appOwnerId, contacts],
  );

  const updateContactFields = React.useCallback(
    (payload: ContactFieldsPatch) => {
      const fullOverridePayload = buildFullContactOverridePayload(payload);
      if (fullOverridePayload && appOwnerId) {
        return upsert("contact", fullOverridePayload, { ownerId: appOwnerId });
      }

      if (!appOwnerId) return update("contact", payload);
      const scoped = update("contact", payload, { ownerId: appOwnerId });
      if (scoped.ok) return scoped;
      return update("contact", payload);
    },
    [appOwnerId, buildFullContactOverridePayload, update, upsert],
  );

  const updateTransactionFields = React.useCallback(
    (
      payload: { contactId: ContactId; id: TransactionId },
      rowOwnerId: unknown,
    ) => {
      const parsedOwnerId = Evolu.OwnerId.fromUnknown(rowOwnerId);
      if (parsedOwnerId.ok) {
        return update("transaction", payload, {
          ownerId: parsedOwnerId.value,
        });
      }

      if (transactionsOwnerId) {
        return update("transaction", payload, {
          ownerId: transactionsOwnerId,
        });
      }

      return update("transaction", payload);
    },
    [transactionsOwnerId, update],
  );

  const backfillLightningAddressTransactions = React.useCallback(
    async (contactId: ContactId, lnAddress: string) => {
      const normalizedLnAddress = lnAddress.trim().toLowerCase();
      if (!normalizedLnAddress) return;

      const transactionRows = await evolu.loadQuery(transactionsQuery);
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

        updateTransactionFields(
          {
            id: transactionId as TransactionId,
            contactId,
          },
          "ownerId" in row ? row.ownerId : null,
        );
      }
    },
    [transactionsQuery, updateTransactionFields],
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
          groups: [],
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
        groups: getContactGroups(selectedContact),
      };
    });
    setForm({
      name: String(selectedContact.name ?? ""),
      npub: String(selectedContact.npub ?? ""),
      lnAddress: String(selectedContact.lnAddress ?? ""),
      groups: getContactGroups(selectedContact),
    });
  }, [
    contactNewPrefill,
    route.kind,
    selectedContact,
    setContactNewPrefill,
    setPendingDeleteId,
  ]);

  const handleSaveContact = React.useCallback(async () => {
    if (isSavingContact) return; // Prevent double-click

    const name = form.name.trim();
    const rawNpub = form.npub.trim();
    const lnAddressInput = form.lnAddress.trim();
    const groups = form.groups;
    const group = groups[0] ?? "";
    const groupNamesJson = serializeContactGroups(groups);

    if (!name && !rawNpub && !lnAddressInput) {
      setStatus(t("fillAtLeastOne"));
      return;
    }

    if (!editingId && activeOwnerContactsCount >= MAX_CONTACTS_PER_OWNER) {
      setStatus(
        t("contactsLimitReached").replace(
          "{max}",
          String(MAX_CONTACTS_PER_OWNER),
        ),
      );
      return;
    }

    setIsSavingContact(true);

    let npub = rawNpub ? (normalizeNpubIdentifier(rawNpub) ?? rawNpub) : "";
    let lnAddress = lnAddressInput;

    if (rawNpub) {
      const nip05Result = await resolveNip05Input(rawNpub);
      if (nip05Result.kind === "resolved") {
        npub = nip05Result.npub;
        if (
          !lnAddress &&
          nip05Result.identifier.domain === DEFAULT_NIP05_DOMAIN
        ) {
          lnAddress = nip05Result.identifier.identifier;
        }
      } else if (nip05Result.kind === "not_found") {
        setStatus(
          t("nip05NotFound").replace(
            "{identifier}",
            nip05Result.identifier.identifier,
          ),
        );
        setIsSavingContact(false);
        return;
      } else if (nip05Result.kind === "error") {
        setStatus(
          t("nip05ResolveFailed").replace(
            "{identifier}",
            nip05Result.identifier.identifier,
          ),
        );
        setIsSavingContact(false);
        return;
      }
    }

    const currentProfileNpub = normalizeNpubIdentifier(currentNpub);

    if (npub && currentProfileNpub && npub === currentProfileNpub) {
      setStatus(t("contactIsYou"));
      navigateTo({ route: "profile" });
      setIsSavingContact(false);
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
        setIsSavingContact(false);
        return;
      }
    }

    const payload = {
      name: name ? (name as typeof Evolu.NonEmptyString1000.Type) : null,
      npub: npub ? (npub as typeof Evolu.NonEmptyString1000.Type) : null,
      lnAddress: lnAddress
        ? (lnAddress as typeof Evolu.NonEmptyString1000.Type)
        : null,
      groupName: group ? (group as typeof Evolu.NonEmptyString1000.Type) : null,
      groupNamesJson: groups.length
        ? (groupNamesJson as typeof Evolu.NonEmptyString1000.Type)
        : null,
    };
    let savedContactId: ContactId | null = editingId;

    const createPayload: Partial<{
      groupName: typeof Evolu.NonEmptyString1000.Type;
      groupNamesJson: typeof Evolu.NonEmptyString1000.Type;
      lnAddress: typeof Evolu.NonEmptyString1000.Type;
      name: typeof Evolu.NonEmptyString1000.Type;
      nameSetByUser: typeof Evolu.SqliteBoolean.Type;
      npub: typeof Evolu.NonEmptyString1000.Type;
    }> = {};
    if (payload.name) {
      createPayload.name = payload.name;
      createPayload.nameSetByUser = Evolu.sqliteTrue;
    }
    if (payload.npub) createPayload.npub = payload.npub;
    if (payload.lnAddress) createPayload.lnAddress = payload.lnAddress;
    if (payload.groupName) createPayload.groupName = payload.groupName;
    if (payload.groupNamesJson)
      createPayload.groupNamesJson = payload.groupNamesJson;

    if (editingId) {
      // Build update payload with only changed fields to minimize history entries.
      const initial = contactEditInitial;
      const changedFields: ContactFieldsPatch = { id: editingId };

      if (initial?.id === editingId) {
        const nextName = payload.name ? String(payload.name) : null;
        const nextNpub = payload.npub ? String(payload.npub) : null;
        const nextLn = payload.lnAddress ? String(payload.lnAddress) : null;
        const nextGroup = payload.groupName ? String(payload.groupName) : null;
        const nextGroupsJson = payload.groupNamesJson
          ? String(payload.groupNamesJson)
          : null;

        const prevName = initial.name || null;
        const prevNpub = initial.npub || null;
        const prevLn = initial.lnAddress || null;
        const prevGroup = initial.groups[0] ?? null;
        const prevGroupsJson = initial.groups.length
          ? serializeContactGroups(initial.groups)
          : null;

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
        if ((prevGroupsJson ?? "") !== (nextGroupsJson ?? "")) {
          changedFields.groupNamesJson = payload.groupNamesJson;
        }
      } else {
        // Fallback: if we don't have initial data, update all fields.
        Object.assign(changedFields, payload);
      }

      // A typed name is user-set; clearing it hands the name back to the profile.
      if (changedFields.name !== undefined) {
        changedFields.nameSetByUser =
          changedFields.name === null ? null : Evolu.sqliteTrue;
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
        ? insert("contact", createPayload, { ownerId: appOwnerId })
        : insert("contact", createPayload);
      if (result.ok) {
        savedContactId = result.value.id;
        setRecentlyAddedContactId(result.value.id);
        setStatus(t("contactSaved"));
      } else {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
        setIsSavingContact(false);
        return;
      }
    }

    if (savedContactId && lnAddress) {
      await backfillLightningAddressTransactions(savedContactId, lnAddress);
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
    activeOwnerContactsCount,
    appOwnerId,
    backfillLightningAddressTransactions,
    clearContactForm,
    contactEditInitial,
    contacts,
    currentNpub,
    editingId,
    form.groups,
    form.lnAddress,
    form.name,
    form.npub,
    insert,
    isSavingContact,
    route.kind,
    setPendingDeleteId,
    setRecentlyAddedContactId,
    setStatus,
    t,
    updateContactFields,
  ]);

  const searchNewContact = React.useCallback(
    async (query?: string): Promise<ContactSearchResult> => {
      if (route.kind !== "contactNew") return { kind: "empty" };

      const rawQuery = String(query ?? form.npub ?? "").trim();
      if (!rawQuery) return { kind: "empty" };

      const queryPrefill = getContactQueryPrefill(rawQuery);
      let resolvedNpub = await decodeDirectNpubIdentifier(rawQuery);
      let fallbackName = "";
      let fallbackLnAddress = "";

      if (!resolvedNpub) {
        const nip05Identifier = parseNip05IdentifierInput(rawQuery);
        if (!nip05Identifier) return { kind: "not_found", query: rawQuery };

        const nip05Result = await resolveNip05Input(rawQuery);
        if (nip05Result.kind === "resolved") {
          resolvedNpub = nip05Result.npub;
          fallbackName = queryPrefill.name
            ? nip05Result.identifier.localPart
            : "";
          if (queryPrefill.lnAddress) {
            fallbackLnAddress = queryPrefill.lnAddress;
          } else if (nip05Result.identifier.domain === DEFAULT_NIP05_DOMAIN) {
            fallbackLnAddress = nip05Result.identifier.identifier;
          }
        } else if (nip05Result.kind === "not_found") {
          return { kind: "not_found", query: rawQuery };
        } else if (nip05Result.kind === "error") {
          if (queryPrefill.lnAddress) {
            return { kind: "not_found", query: rawQuery };
          }
          return {
            identifier: nip05Result.identifier.identifier,
            kind: "error",
          };
        }
      }

      if (!resolvedNpub) return { kind: "not_found", query: rawQuery };

      const existingContact = contacts.find(
        (contact) => normalizeNpubIdentifier(contact.npub) === resolvedNpub,
      );
      const existingContactId = existingContact?.id
        ? String(existingContact.id)
        : "";

      const metadata = await fetchAndCacheProfile(
        fetchProfileOneShot,
        resolvedNpub,
      );
      const bestName = metadata ? (getBestNostrName(metadata) ?? "") : "";
      const metadataLn = metadata
        ? omitSyntheticContactLightningAddress(
            (metadata.lud16 ?? "").trim() || (metadata.lud06 ?? "").trim(),
            resolvedNpub,
          )
        : "";

      return {
        contact: {
          ...(existingContactId ? { existingContactId } : {}),
          lnAddress: metadataLn || fallbackLnAddress,
          name: bestName || fallbackName,
          npub: resolvedNpub,
          pictureUrl: getProfilePictureUrl(metadata),
          query: rawQuery,
        },
        kind: "found",
      };
    },
    [contacts, fetchProfileOneShot, form.npub, route.kind],
  );

  const addNewContactFromSearchResult = React.useCallback(
    async (candidate: ContactSearchCandidate) => {
      if (isSavingContact) return;

      if (activeOwnerContactsCount >= MAX_CONTACTS_PER_OWNER) {
        setStatus(
          t("contactsLimitReached").replace(
            "{max}",
            String(MAX_CONTACTS_PER_OWNER),
          ),
        );
        return;
      }

      const npub = normalizeNpubIdentifier(candidate.npub);
      if (!npub) {
        setStatus(t("contactIdentifierInvalid"));
        return;
      }

      const currentProfileNpub = normalizeNpubIdentifier(currentNpub);
      if (currentProfileNpub && npub === currentProfileNpub) {
        setStatus(t("contactIsYou"));
        navigateTo({ route: "profile" });
        return;
      }

      const duplicate = contacts.find(
        (contact) => normalizeNpubIdentifier(contact.npub) === npub,
      );
      if (duplicate?.id) {
        setStatus(t("contactExists"));
        navigateTo({ route: "contact", id: duplicate.id as ContactId });
        return;
      }

      const name = candidate.name.trim();
      const lnAddress = candidate.lnAddress.trim();
      const createPayload: Partial<{
        lnAddress: typeof Evolu.NonEmptyString1000.Type;
        name: typeof Evolu.NonEmptyString1000.Type;
        npub: typeof Evolu.NonEmptyString1000.Type;
      }> = {
        npub: npub as typeof Evolu.NonEmptyString1000.Type,
      };
      if (name)
        createPayload.name = name as typeof Evolu.NonEmptyString1000.Type;
      if (lnAddress) {
        createPayload.lnAddress =
          lnAddress as typeof Evolu.NonEmptyString1000.Type;
      }

      setIsSavingContact(true);
      const result = appOwnerId
        ? insert("contact", createPayload, { ownerId: appOwnerId })
        : insert("contact", createPayload);

      if (!result.ok) {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
        setIsSavingContact(false);
        return;
      }

      setRecentlyAddedContactId(result.value.id);
      setStatus(t("contactSaved"));
      if (lnAddress) {
        await backfillLightningAddressTransactions(result.value.id, lnAddress);
      }
      clearContactForm();
      setPendingDeleteId(null);
      navigateTo({ route: "contacts" });
      setIsSavingContact(false);
    },
    [
      activeOwnerContactsCount,
      appOwnerId,
      backfillLightningAddressTransactions,
      clearContactForm,
      contacts,
      currentNpub,
      insert,
      isSavingContact,
      setPendingDeleteId,
      setRecentlyAddedContactId,
      setStatus,
      t,
    ],
  );

  const addNewContactFromIdentifier = React.useCallback(
    async (identifier: string) => {
      const result = await searchNewContact(identifier);
      if (result.kind === "found") {
        await addNewContactFromSearchResult(result.contact);
        return;
      }

      if (result.kind === "error") {
        setStatus(
          t("nip05ResolveFailed").replace("{identifier}", result.identifier),
        );
        return;
      }

      if (result.kind === "not_found") {
        setStatus(t("contactSearchNoResult"));
      }
    },
    [addNewContactFromSearchResult, searchNewContact, setStatus, t],
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
  }, [contacts]);

  // Resets the field to the watch-fed cached profile value; the pubkey is
  // watched, so the cache is as fresh as the relays.
  const resetEditedContactFieldFromNostr = React.useCallback(
    (field: "name" | "lnAddress") => {
      if (route.kind !== "contactEdit") return;
      if (!editingId) return;

      const npub = normalizeNpubIdentifier(form.npub);
      const metadata = npub
        ? (loadCachedProfile(npub)?.metadata ?? null)
        : null;

      if (field === "name") {
        const bestName = metadata ? getBestNostrName(metadata) : null;
        const parsedName = bestName
          ? Evolu.NonEmptyString1000.fromUnknown(bestName)
          : null;
        setForm((prev) => ({ ...prev, name: bestName ?? "" }));
        updateContactFields({
          id: editingId,
          name: parsedName?.ok ? parsedName.value : null,
          nameSetByUser: null,
        });
        return;
      }

      const ln = metadata
        ? omitSyntheticContactLightningAddress(
            (metadata.lud16 ?? "").trim() || (metadata.lud06 ?? "").trim(),
            npub ?? "",
          )
        : "";
      const parsedLn = ln ? Evolu.NonEmptyString1000.fromUnknown(ln) : null;
      setForm((prev) => ({ ...prev, lnAddress: ln }));
      updateContactFields({
        id: editingId,
        lnAddress: parsedLn?.ok ? parsedLn.value : null,
      });
    },
    [editingId, form.npub, route.kind, updateContactFields],
  );

  const contactEditsSavable = React.useMemo(() => {
    if (!editingId) return false;
    if (route.kind !== "contactEdit") return false;
    const initial = contactEditInitial;
    if (!initial || initial.id !== editingId) return false;

    const name = form.name.trim();
    const npub = form.npub.trim();
    const lnAddress = form.lnAddress.trim();
    const groups = serializeContactGroups(form.groups);

    const hasRequired = Boolean(name || npub || lnAddress);
    if (!hasRequired) return false;

    const dirty =
      name !== initial.name.trim() ||
      npub !== initial.npub.trim() ||
      lnAddress !== initial.lnAddress.trim() ||
      groups !== serializeContactGroups(initial.groups);

    return dirty;
  }, [
    contactEditInitial,
    editingId,
    form.groups,
    form.lnAddress,
    form.name,
    form.npub,
    route.kind,
  ]);

  return {
    addNewContactFromIdentifier,
    addNewContactFromSearchResult,
    clearContactForm,
    contactEditsSavable,
    contactSuggestions,
    editingId,
    form,
    handleSaveContact,
    isSavingContact,
    openScannedContactPendingNpubRef,
    resetEditedContactFieldFromNostr,
    searchNewContact,
    setEditingId,
    setForm,
  };
};
