import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import React from "react";
import type { ContactId } from "../../evolu";
import { evolu } from "../../evolu";
import type { Route } from "../../types/route";
import type { OptionalText } from "../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

interface UseContactsDomainParams {
  appOwnerId: Evolu.OwnerId | null;
  currentNsec: string | null;
  noGroupFilterValue: string;
  pushToast: (message: string) => void;
  route: Route;
  t: (key: string) => string;
  update: EvoluMutations["update"];
  upsert: EvoluMutations["upsert"];
}

export const useContactsDomain = ({
  appOwnerId,
  currentNsec,
  noGroupFilterValue,
  pushToast,
  route,
  t,
  update,
  upsert,
}: UseContactsDomainParams) => {
  const [dedupeContactsIsBusy, setDedupeContactsIsBusy] = React.useState(false);
  const [activeGroup, setActiveGroup] = React.useState<string | null>(null);
  const [contactsSearch, setContactsSearch] = React.useState("");

  const contactsSearchInputRef = React.useRef<HTMLInputElement | null>(null);

  const contactsQuery = React.useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("contact")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("createdAt", "desc"),
      ),
    [],
  );

  const contacts = useQuery(contactsQuery);

  const dedupeContacts = React.useCallback(async () => {
    if (dedupeContactsIsBusy) return;

    setDedupeContactsIsBusy(true);

    const format = (
      template: string,
      vars: Record<string, string | number>,
    ): string => {
      return String(template ?? "").replace(/\{(\w+)\}/g, (_m, k: string) =>
        String(vars[k] ?? ""),
      );
    };

    const normalize = (value: OptionalText): string => {
      return String(value ?? "")
        .trim()
        .toLowerCase();
    };

    const fieldScore = (value: OptionalText): number =>
      normalize(value) ? 1 : 0;

    try {
      const n = contacts.length;
      if (n === 0) {
        pushToast(t("dedupeContactsNone"));
        return;
      }

      const parent = Array.from({ length: n }, (_v, i) => i);
      const find = (i: number): number => {
        let x = i;
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]];
          x = parent[x];
        }
        return x;
      };

      const union = (a: number, b: number) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[rb] = ra;
      };

      const keyToIndex = new Map<string, number>();
      for (let i = 0; i < n; i += 1) {
        const contact = contacts[i];
        const npub = normalize(contact.npub);
        const ln = normalize(contact.lnAddress);
        const keys: string[] = [];
        if (npub) keys.push(`npub:${npub}`);
        if (ln) keys.push(`ln:${ln}`);

        for (const key of keys) {
          const prev = keyToIndex.get(key);
          if (prev == null) keyToIndex.set(key, i);
          else union(i, prev);
        }
      }

      const groups = new Map<number, number[]>();
      for (let i = 0; i < n; i += 1) {
        const root = find(i);
        const arr = groups.get(root);
        if (arr) arr.push(i);
        else groups.set(root, [i]);
      }

      const dupGroups = [...groups.values()].filter((g) => g.length > 1);
      if (dupGroups.length === 0) {
        pushToast(t("dedupeContactsNone"));
        return;
      }

      let removedContacts = 0;
      const movedMessages = 0;

      for (const idxs of dupGroups) {
        const group = idxs.map((i) => contacts[i]);

        let keep = group[0];
        let keepScore =
          fieldScore(keep.name) +
          fieldScore(keep.npub) +
          fieldScore(keep.lnAddress) +
          fieldScore(keep.groupName);
        let keepCreated = Number(keep.createdAt ?? 0);

        for (const contact of group.slice(1)) {
          const score =
            fieldScore(contact.name) +
            fieldScore(contact.npub) +
            fieldScore(contact.lnAddress) +
            fieldScore(contact.groupName);
          const created = Number(contact.createdAt ?? 0);

          if (
            score > keepScore ||
            (score === keepScore && created > keepCreated)
          ) {
            keep = contact;
            keepScore = score;
            keepCreated = created;
          }
        }

        const keepId = keep.id as ContactId;
        let mergedName = normalize(keep.name) ? keep.name : null;
        let mergedNpub = normalize(keep.npub) ? keep.npub : null;
        let mergedLn = normalize(keep.lnAddress) ? keep.lnAddress : null;
        let mergedGroup = normalize(keep.groupName) ? keep.groupName : null;

        for (const contact of group) {
          if (!mergedName && normalize(contact.name)) mergedName = contact.name;
          if (!mergedNpub && normalize(contact.npub)) mergedNpub = contact.npub;
          if (!mergedLn && normalize(contact.lnAddress)) {
            mergedLn = contact.lnAddress;
          }
          if (!mergedGroup && normalize(contact.groupName)) {
            mergedGroup = contact.groupName;
          }
        }

        const keepNeedsUpdate =
          (keep.name ?? null) !== (mergedName ?? null) ||
          (keep.npub ?? null) !== (mergedNpub ?? null) ||
          (keep.lnAddress ?? null) !== (mergedLn ?? null) ||
          (keep.groupName ?? null) !== (mergedGroup ?? null);

        if (keepNeedsUpdate) {
          const result = appOwnerId
            ? update(
                "contact",
                {
                  id: keepId,
                  name: mergedName as
                    | typeof Evolu.NonEmptyString1000.Type
                    | null,
                  npub: mergedNpub as
                    | typeof Evolu.NonEmptyString1000.Type
                    | null,
                  lnAddress: mergedLn as
                    | typeof Evolu.NonEmptyString1000.Type
                    | null,
                  groupName: mergedGroup as
                    | typeof Evolu.NonEmptyString1000.Type
                    | null,
                },
                { ownerId: appOwnerId },
              )
            : update("contact", {
                id: keepId,
                name: mergedName as typeof Evolu.NonEmptyString1000.Type | null,
                npub: mergedNpub as typeof Evolu.NonEmptyString1000.Type | null,
                lnAddress: mergedLn as
                  | typeof Evolu.NonEmptyString1000.Type
                  | null,
                groupName: mergedGroup as
                  | typeof Evolu.NonEmptyString1000.Type
                  | null,
              });

          if (!result.ok) {
            throw new Error(String(result.error ?? "contact update failed"));
          }
        }

        for (const contact of group) {
          const duplicateId = contact.id as ContactId;
          if (duplicateId === keepId) continue;

          const del = appOwnerId
            ? update(
                "contact",
                { id: duplicateId, isDeleted: Evolu.sqliteTrue },
                { ownerId: appOwnerId },
              )
            : update("contact", {
                id: duplicateId,
                isDeleted: Evolu.sqliteTrue,
              });

          if (del.ok) removedContacts += 1;
        }
      }

      pushToast(
        format(t("dedupeContactsResult"), {
          groups: dupGroups.length,
          removed: removedContacts,
          moved: movedMessages,
        }),
      );
    } catch (e) {
      console.log("[linky] dedupe contacts failed", e);
      pushToast(t("dedupeContactsFailed"));
    } finally {
      setDedupeContactsIsBusy(false);
    }
  }, [appOwnerId, contacts, dedupeContactsIsBusy, pushToast, t, update]);

  React.useEffect(() => {
    if (!currentNsec) return;
    if (!appOwnerId) return;
    if (contacts.length === 0) return;

    const ownerKey = String(appOwnerId);
    const migrationKey = `linky.contacts_owner_migrated_v1:${ownerKey}`;

    try {
      if (localStorage.getItem(migrationKey) === "1") return;
    } catch {
      // ignore
    }

    let okCount = 0;
    let failCount = 0;

    for (const contact of contacts) {
      const payload = {
        id: contact.id as ContactId,
        name: String(contact.name ?? "").trim()
          ? (String(
              contact.name ?? "",
            ).trim() as typeof Evolu.NonEmptyString1000.Type)
          : null,
        npub: String(contact.npub ?? "").trim()
          ? (String(
              contact.npub ?? "",
            ).trim() as typeof Evolu.NonEmptyString1000.Type)
          : null,
        lnAddress: String(contact.lnAddress ?? "").trim()
          ? (String(
              contact.lnAddress ?? "",
            ).trim() as typeof Evolu.NonEmptyString1000.Type)
          : null,
        groupName: String(contact.groupName ?? "").trim()
          ? (String(
              contact.groupName ?? "",
            ).trim() as typeof Evolu.NonEmptyString1000.Type)
          : null,
      };

      const result = upsert("contact", payload, { ownerId: appOwnerId });
      if (result.ok) okCount += 1;
      else failCount += 1;
    }

    try {
      localStorage.setItem(migrationKey, "1");
    } catch {
      // ignore
    }

    console.log("[linky][evolu] migrated contacts to appOwner", {
      ownerId: ownerKey.length > 10 ? `${ownerKey.slice(0, 10)}…` : ownerKey,
      ok: okCount,
      failed: failCount,
    });
  }, [appOwnerId, contacts, currentNsec, upsert]);

  const { groupNames, ungroupedCount } = React.useMemo(() => {
    const counts = new Map<string, number>();
    let ungrouped = 0;

    for (const contact of contacts) {
      const raw = (contact.groupName ?? null) as string | null;
      const normalized = (raw ?? "").trim();
      if (!normalized) {
        ungrouped += 1;
        continue;
      }

      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }

    const names = Array.from(counts.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .map(([name]) => name);

    return { groupNames: names, ungroupedCount: ungrouped };
  }, [contacts]);

  React.useEffect(() => {
    if (!activeGroup) return;
    if (activeGroup === noGroupFilterValue) return;
    if (!groupNames.includes(activeGroup)) {
      setActiveGroup(null);
    }
  }, [activeGroup, groupNames, noGroupFilterValue]);

  const contactsSearchParts = React.useMemo(() => {
    const normalized = String(contactsSearch ?? "")
      .trim()
      .toLowerCase();

    if (!normalized) return [] as string[];
    return normalized.split(/\s+/).filter(Boolean);
  }, [contactsSearch]);

  const contactsSearchData = React.useMemo(() => {
    return contacts.map((contact) => {
      const idKey = String(contact.id ?? "").trim();
      const groupName = String(contact.groupName ?? "").trim();
      const haystack = [
        contact.name,
        contact.npub,
        contact.lnAddress,
        contact.groupName,
      ]
        .map((value) =>
          String(value ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
        .join(" ");

      return { contact, idKey, groupName, haystack };
    });
  }, [contacts]);

  const selectedContact = React.useMemo(() => {
    const id =
      route.kind === "contact" ||
      route.kind === "contactEdit" ||
      route.kind === "contactPay" ||
      route.kind === "chat"
        ? route.id
        : null;

    if (!id) return null;
    return contacts.find((contact) => contact.id === id) ?? null;
  }, [contacts, route]);

  return {
    activeGroup,
    contacts,
    contactsSearch,
    contactsSearchData,
    contactsSearchInputRef,
    contactsSearchParts,
    dedupeContacts,
    dedupeContactsIsBusy,
    groupNames,
    selectedContact,
    setActiveGroup,
    setContactsSearch,
    ungroupedCount,
  };
};
