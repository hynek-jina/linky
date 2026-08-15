// ONE-TIME MIGRATION — DELETE ME EVENTUALLY
//
// See `contactNameRestorePlan.ts` for what happened and why. This hook runs
// the repair once per device: it reads the contact name history straight from
// `evolu_history`, restores the newest pre-deploy name of every clobbered
// contact, and marks it `nameSetByUser` so the profile sync leaves it alone.
// The restore mutation syncs to the account's other devices; restored rows are
// skipped on re-runs, so concurrent devices converge.

import * as Evolu from "@evolu/common";
import React from "react";
import { getEvolu } from "../../evolu";
import { resolveContactRowOwnerLane } from "../lib/contactOwnerLane";
import type { ContactRowLike } from "../types/appTypes";
import type { ContactNameHistoryEntry } from "./contactNameRestorePlan";
import { planContactNameRestores } from "./contactNameRestorePlan";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

const DONE_STORAGE_KEY = "linky.contact_name_backfill_v1";

const isDone = (): boolean => {
  try {
    return localStorage.getItem(DONE_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
};

const markDone = (): void => {
  try {
    localStorage.setItem(DONE_STORAGE_KEY, "1");
  } catch {
    // Ignore; the run is idempotent, so retrying next launch is fine.
  }
};

// Worker round-trips may deliver byte columns as plain records of numbers.
const toByteArray = (value: unknown): number[] => {
  if (value instanceof Uint8Array) return Array.from(value);
  if (typeof value !== "object" || value === null) return [];
  const entries = Object.values(value);
  const out: number[] = [];
  for (const entry of entries) {
    if (typeof entry !== "number") return [];
    out.push(entry);
  }
  return out;
};

const timestampKeyOf = (bytes: readonly number[]): string =>
  bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");

// HLC timestamp bytes: first 6 bytes are wall-clock millis, big-endian.
const timestampMsOf = (bytes: readonly number[]): number | null => {
  if (bytes.length < 6) return null;
  let millis = 0;
  for (let index = 0; index < 6; index += 1) {
    millis = millis * 256 + (bytes[index] ?? 0);
  }
  return Number.isFinite(millis) && millis > 0 ? millis : null;
};

interface HistorySelectBuilder {
  selectAll(): HistorySelectBuilder;
  where(column: string, operator: string, value: unknown): HistorySelectBuilder;
}

const loadContactNameHistory = async (): Promise<ContactNameHistoryEntry[]> => {
  const instance = getEvolu();
  const createQuery = Reflect.get(Object(instance), "createQuery");
  const loadQuery = Reflect.get(Object(instance), "loadQuery");
  if (typeof createQuery !== "function" || typeof loadQuery !== "function") {
    return [];
  }

  const query: unknown = createQuery.call(
    instance,
    (db: { selectFrom(table: string): HistorySelectBuilder }) =>
      db
        .selectFrom("evolu_history")
        .selectAll()
        .where("table", "=", "contact")
        .where("column", "in", ["name", "nameSetByUser"]),
  );
  const rows: unknown = await loadQuery.call(instance, query);
  if (!Array.isArray(rows)) return [];

  const entries: ContactNameHistoryEntry[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const column = Reflect.get(row, "column");
    if (column !== "name" && column !== "nameSetByUser") continue;

    const idBytes = Evolu.IdBytes.fromUnknown(
      Uint8Array.from(toByteArray(Reflect.get(row, "id"))),
    );
    if (!idBytes.ok) continue;

    const timestampBytes = toByteArray(Reflect.get(row, "timestamp"));
    if (timestampBytes.length === 0) continue;

    const value = Reflect.get(row, "value");
    entries.push({
      column,
      contactId: String(Evolu.idBytesToId(idBytes.value)),
      timestampKey: timestampKeyOf(timestampBytes),
      timestampMs: timestampMsOf(timestampBytes),
      value: typeof value === "string" ? value : null,
    });
  }
  return entries;
};

interface UseRestoreClobberedContactNamesParams {
  contacts: readonly (ContactRowLike & { id: string })[];
  contactsOwnerId: Evolu.OwnerId | null;
  contactsVisibleOwnerIds: readonly Evolu.OwnerId[];
  update: EvoluMutations["update"];
}

export const useRestoreClobberedContactNames = ({
  contacts,
  contactsOwnerId,
  contactsVisibleOwnerIds,
  update,
}: UseRestoreClobberedContactNamesParams): void => {
  const startedRef = React.useRef(false);
  const contextRef = React.useRef({
    contacts,
    contactsOwnerId,
    contactsVisibleOwnerIds,
    update,
  });
  React.useEffect(() => {
    contextRef.current = {
      contacts,
      contactsOwnerId,
      contactsVisibleOwnerIds,
      update,
    };
  });

  React.useEffect(() => {
    if (startedRef.current) return;
    if (contacts.length === 0) return;
    if (isDone()) return;
    startedRef.current = true;

    void (async () => {
      const history = await loadContactNameHistory();
      const ctx = contextRef.current;
      const restores = planContactNameRestores(ctx.contacts, history);
      for (const restore of restores) {
        const parsedName = Evolu.NonEmptyString1000.fromUnknown(restore.name);
        if (!parsedName.ok) continue;
        const contact =
          ctx.contacts.find((row) => row.id === restore.id) ?? null;
        const ownerId =
          resolveContactRowOwnerLane(contact, ctx.contactsVisibleOwnerIds) ??
          ctx.contactsOwnerId;
        const payload = {
          id: restore.id,
          name: parsedName.value,
          nameSetByUser: Evolu.sqliteTrue,
        };
        if (ownerId) ctx.update("contact", payload, { ownerId });
        else ctx.update("contact", payload);
      }
      markDone();
    })();
  }, [contacts]);
};
