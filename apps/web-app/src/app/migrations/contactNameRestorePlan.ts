// ONE-TIME MIGRATION — DELETE ME EVENTUALLY
//
// The 2026-08-15 release (PR #241) switched contact names from "fill once when
// empty" to "follow the Nostr profile unless contact.nameSetByUser". The flag
// shipped without a backfill, so the profile sync overwrote every manually
// chosen contact name with the profile name. This module plans the repair from
// `evolu_history`, which still holds the pre-release values.
//
// Remove the whole `src/app/migrations/` folder plus its single mount line in
// `useContactsMessagingComposition.ts` once the user base has run it.

import type { ContactRowLike } from "../types/appTypes";

/**
 * Merge time of PR #241 (2026-08-15T13:21:57Z). No build with the
 * profile-follow sync existed before this instant, so a `name` write at or
 * after it that has no same-timestamp `nameSetByUser` write can only be a
 * profile-sync overwrite — the contact editor always writes both columns in
 * one mutation (one shared Evolu HLC timestamp).
 */
export const PROFILE_FOLLOW_DEPLOYED_AT_MS = Date.UTC(2026, 7, 15, 13, 21, 57);

/** One `evolu_history` row for `contact.name` or `contact.nameSetByUser`. */
export interface ContactNameHistoryEntry {
  column: "name" | "nameSetByUser";
  contactId: string;
  /** Full 16-byte HLC timestamp as hex; equal bytes = same mutation. */
  timestampKey: string;
  /** Wall-clock part of the HLC timestamp. */
  timestampMs: number | null;
  value: string | null;
}

export interface ContactNameRestore {
  id: string;
  name: string;
}

const trimmed = (value: unknown): string => String(value ?? "").trim();

/**
 * Returns the name to restore for every contact whose custom name was
 * overwritten by the profile sync: rows without `nameSetByUser` whose name
 * history has a post-deploy sync write, no post-deploy editor write (those
 * mean the user has taken over naming since), and a differing non-empty
 * pre-deploy value to go back to.
 */
export const planContactNameRestores = (
  contacts: readonly (ContactRowLike & { id: string })[],
  history: readonly ContactNameHistoryEntry[],
  deployedAtMs: number = PROFILE_FOLLOW_DEPLOYED_AT_MS,
): ContactNameRestore[] => {
  const entriesByContactId = new Map<string, ContactNameHistoryEntry[]>();
  for (const entry of history) {
    const list = entriesByContactId.get(entry.contactId);
    if (list) list.push(entry);
    else entriesByContactId.set(entry.contactId, [entry]);
  }

  const restores: ContactNameRestore[] = [];
  for (const contact of contacts) {
    if (contact.nameSetByUser) continue;
    const entries = entriesByContactId.get(contact.id);
    if (!entries) continue;

    const editorWriteKeys = new Set<string>();
    const nameWrites: ContactNameHistoryEntry[] = [];
    for (const entry of entries) {
      if (entry.column === "nameSetByUser") {
        editorWriteKeys.add(entry.timestampKey);
      } else {
        nameWrites.push(entry);
      }
    }
    nameWrites.sort((a, b) => a.timestampKey.localeCompare(b.timestampKey));

    const postDeploy = nameWrites.filter(
      (write) =>
        write.timestampMs !== null && write.timestampMs >= deployedAtMs,
    );
    if (postDeploy.length === 0) continue;
    if (postDeploy.some((write) => editorWriteKeys.has(write.timestampKey))) {
      continue;
    }

    let lastPreDeploy: ContactNameHistoryEntry | null = null;
    for (const write of nameWrites) {
      if (write.timestampMs === null) continue;
      if (write.timestampMs >= deployedAtMs) break;
      if (trimmed(write.value) === "") continue;
      lastPreDeploy = write;
    }
    if (!lastPreDeploy) continue;

    const restoredName = trimmed(lastPreDeploy.value);
    if (restoredName === trimmed(contact.name)) continue;
    restores.push({ id: contact.id, name: restoredName });
  }
  return restores;
};
