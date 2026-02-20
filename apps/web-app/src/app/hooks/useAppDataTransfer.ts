import * as Evolu from "@evolu/common";
import React from "react";
import type { ContactId } from "../../evolu";
import type { JsonValue } from "../../types/json";
import { asRecord } from "../../utils/validation";
import type { CashuTokenRowLike, ContactRowLike } from "../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

interface UseAppDataTransferParams<
  TContact extends ContactRowLike,
  TCashuToken extends CashuTokenRowLike,
> {
  appOwnerId: Evolu.OwnerId | null;
  cashuOwnerId: Evolu.OwnerId | null;
  cashuTokens: readonly TCashuToken[];
  cashuTokensAll: readonly TCashuToken[];
  contacts: readonly TContact[];
  importDataFileInputRef: React.RefObject<HTMLInputElement | null>;
  insert: EvoluMutations["insert"];
  pushToast: (message: string) => void;
  t: (key: string) => string;
  update: EvoluMutations["update"];
}

export const useAppDataTransfer = <
  TContact extends ContactRowLike,
  TCashuToken extends CashuTokenRowLike,
>({
  appOwnerId,
  cashuOwnerId,
  cashuTokens,
  cashuTokensAll,
  contacts,
  importDataFileInputRef,
  insert,
  pushToast,
  t,
  update,
}: UseAppDataTransferParams<TContact, TCashuToken>) => {
  const buildImportedCashuTokenPayload = React.useCallback(
    (args: {
      amount: number | null;
      error: string | null;
      mint: string | null;
      rawToken: string | null;
      state: string | null;
      token: string;
      unit: string | null;
    }) => {
      const payload: {
        token: typeof Evolu.NonEmptyString.Type;
        amount?: typeof Evolu.PositiveInt.Type;
        error?: typeof Evolu.NonEmptyString1000.Type;
        mint?: typeof Evolu.NonEmptyString1000.Type;
        rawToken?: typeof Evolu.NonEmptyString.Type;
        state?: typeof Evolu.NonEmptyString100.Type;
        unit?: typeof Evolu.NonEmptyString100.Type;
      } = {
        token: args.token as typeof Evolu.NonEmptyString.Type,
      };

      const rawToken = String(args.rawToken ?? "").trim();
      if (rawToken)
        payload.rawToken = rawToken as typeof Evolu.NonEmptyString.Type;

      const mint = String(args.mint ?? "").trim();
      if (mint) payload.mint = mint as typeof Evolu.NonEmptyString1000.Type;

      const unit = String(args.unit ?? "").trim();
      if (unit) payload.unit = unit as typeof Evolu.NonEmptyString100.Type;

      const state = String(args.state ?? "").trim();
      if (state) payload.state = state as typeof Evolu.NonEmptyString100.Type;

      if (typeof args.amount === "number" && args.amount > 0) {
        payload.amount = args.amount as typeof Evolu.PositiveInt.Type;
      }

      const error = String(args.error ?? "").trim();
      if (error) payload.error = error as typeof Evolu.NonEmptyString1000.Type;

      return payload;
    },
    [],
  );

  const exportAppData = React.useCallback(() => {
    try {
      const now = new Date();
      const filenameDate = now.toISOString().slice(0, 10);

      const payload = {
        app: "linky",
        version: 1,
        exportedAt: now.toISOString(),
        contacts: contacts.map((contact) => ({
          name: String(contact.name ?? "").trim() || null,
          npub: String(contact.npub ?? "").trim() || null,
          lnAddress: String(contact.lnAddress ?? "").trim() || null,
          groupName: String(contact.groupName ?? "").trim() || null,
        })),
        cashuTokens: cashuTokens.map((token) => ({
          token: String(token.token ?? "").trim(),
          rawToken: String(token.rawToken ?? "").trim() || null,
          mint: String(token.mint ?? "").trim() || null,
          unit: String(token.unit ?? "").trim() || null,
          amount:
            typeof token.amount === "number" && Number.isFinite(token.amount)
              ? token.amount
              : token.amount
                ? Number(token.amount)
                : null,
          state: String(token.state ?? "").trim() || null,
          error: String(token.error ?? "").trim() || null,
        })),
      };

      const text = JSON.stringify(payload, null, 2);
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `linky-export-${filenameDate}.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }, 1000);

      pushToast(t("exportDone"));
    } catch {
      pushToast(t("exportFailed"));
    }
  }, [cashuTokens, contacts, pushToast, t]);

  const requestImportAppData = React.useCallback(() => {
    const element = importDataFileInputRef.current;
    if (!element) return;
    try {
      element.click();
    } catch {
      // ignore
    }
  }, [importDataFileInputRef]);

  const importAppDataFromText = React.useCallback(
    (text: string) => {
      const sanitizeText = (value: unknown, maxLen: number): string | null => {
        const raw = String(value ?? "").trim();
        if (!raw) return null;
        return raw.length > maxLen ? raw.slice(0, maxLen) : raw;
      };

      let parsed: JsonValue;
      try {
        parsed = JSON.parse(String(text ?? "")) as JsonValue;
      } catch {
        pushToast(t("importInvalid"));
        return;
      }

      const root = asRecord(parsed);
      if (!root) {
        pushToast(t("importInvalid"));
        return;
      }

      const importedContacts = Array.isArray(root.contacts)
        ? root.contacts
        : [];
      const importedTokens = Array.isArray(root.cashuTokens)
        ? root.cashuTokens
        : [];

      const existingByNpub = new Map<string, TContact>();
      const existingByLn = new Map<string, TContact>();
      for (const contact of contacts) {
        const npub = String(contact.npub ?? "").trim();
        const ln = String(contact.lnAddress ?? "")
          .trim()
          .toLowerCase();
        if (npub) existingByNpub.set(npub, contact);
        if (ln) existingByLn.set(ln, contact);
      }

      const existingTokenSet = new Set<string>();
      for (const token of cashuTokensAll) {
        const encoded = String(token.token ?? "").trim();
        const raw = String(token.rawToken ?? "").trim();
        if (encoded) existingTokenSet.add(encoded);
        if (raw) existingTokenSet.add(raw);
      }

      let addedContacts = 0;
      let updatedContacts = 0;
      let addedTokens = 0;

      for (const item of importedContacts) {
        const rec = asRecord(item);
        if (!rec) continue;

        const name = sanitizeText(rec.name, 1000);
        const npub = sanitizeText(rec.npub, 1000);
        const lnAddressRaw = sanitizeText(rec.lnAddress, 1000);
        const lnAddress = lnAddressRaw ? lnAddressRaw : null;
        const groupName = sanitizeText(rec.groupName, 1000);

        if (!name && !npub && !lnAddress) continue;

        const existing =
          (npub ? existingByNpub.get(npub) : undefined) ??
          (lnAddress
            ? existingByLn.get(String(lnAddress).toLowerCase())
            : undefined);

        const payload = {
          name: name ? (name as typeof Evolu.NonEmptyString1000.Type) : null,
          npub: npub ? (npub as typeof Evolu.NonEmptyString1000.Type) : null,
          lnAddress: lnAddress
            ? (lnAddress as typeof Evolu.NonEmptyString1000.Type)
            : null,
          groupName: groupName
            ? (groupName as typeof Evolu.NonEmptyString1000.Type)
            : null,
        };

        if (existing && existing.id) {
          const id = existing.id as ContactId;
          const merged = {
            id,
            name:
              payload.name ??
              (String(existing.name ?? "").trim()
                ? (String(
                    existing.name ?? "",
                  ).trim() as typeof Evolu.NonEmptyString1000.Type)
                : null),
            npub:
              payload.npub ??
              (String(existing.npub ?? "").trim()
                ? (String(
                    existing.npub ?? "",
                  ).trim() as typeof Evolu.NonEmptyString1000.Type)
                : null),
            lnAddress:
              payload.lnAddress ??
              (String(existing.lnAddress ?? "").trim()
                ? (String(
                    existing.lnAddress ?? "",
                  ).trim() as typeof Evolu.NonEmptyString1000.Type)
                : null),
            groupName:
              payload.groupName ??
              (String(existing.groupName ?? "").trim()
                ? (String(
                    existing.groupName ?? "",
                  ).trim() as typeof Evolu.NonEmptyString1000.Type)
                : null),
          };

          const result = appOwnerId
            ? update("contact", merged, { ownerId: appOwnerId })
            : update("contact", merged);
          if (result.ok) updatedContacts += 1;
        } else {
          const result = appOwnerId
            ? insert("contact", payload, { ownerId: appOwnerId })
            : insert("contact", payload);
          if (result.ok) addedContacts += 1;
        }
      }

      for (const item of importedTokens) {
        const rec = asRecord(item);
        if (!rec) continue;
        const token = String(rec.token ?? "").trim();
        if (!token) continue;
        if (existingTokenSet.has(token)) continue;

        const rawToken = sanitizeText(rec.rawToken, 100000);
        const mint = sanitizeText(rec.mint, 1000);
        const unit = sanitizeText(rec.unit, 100);
        const state = sanitizeText(rec.state, 100);
        const error = sanitizeText(rec.error, 1000);
        const amountNum = Math.trunc(Number(rec.amount ?? 0));
        const amount =
          Number.isFinite(amountNum) && amountNum > 0 ? amountNum : null;

        const payload = buildImportedCashuTokenPayload({
          token,
          rawToken,
          mint,
          unit,
          amount,
          state,
          error,
        });
        const result = cashuOwnerId
          ? insert("cashuToken", payload, { ownerId: cashuOwnerId })
          : insert("cashuToken", payload);
        if (result.ok) {
          addedTokens += 1;
          existingTokenSet.add(token);
          if (rawToken) existingTokenSet.add(rawToken);
        }
      }

      if (addedContacts === 0 && updatedContacts === 0 && addedTokens === 0) {
        pushToast(t("importNothing"));
        return;
      }

      pushToast(
        `${t("importDone")} (${addedContacts}/${updatedContacts}/${addedTokens})`,
      );
    },
    [
      appOwnerId,
      buildImportedCashuTokenPayload,
      cashuOwnerId,
      cashuTokensAll,
      contacts,
      insert,
      pushToast,
      t,
      update,
    ],
  );

  const handleImportAppDataFilePicked = React.useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        const text = await file.text();
        importAppDataFromText(text);
      } catch {
        pushToast(t("importFailed"));
      }
    },
    [importAppDataFromText, pushToast, t],
  );

  return {
    exportAppData,
    handleImportAppDataFilePicked,
    importAppDataFromText,
    requestImportAppData,
  };
};
