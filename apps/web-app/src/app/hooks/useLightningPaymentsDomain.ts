import * as Evolu from "@evolu/common";
import React from "react";
import type { CashuTokenId, ContactId } from "../../evolu";
import { CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY } from "../../utils/constants";
import { safeLocalStorageSet } from "../../utils/storage";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

interface CashuTokenWithMetaRow {
  amount?: unknown;
  id: CashuTokenId;
  mint?: unknown;
  rawToken?: unknown;
  state?: unknown;
  token?: unknown;
}

interface ContactRow {
  id?: unknown;
  lnAddress?: unknown;
  name?: unknown;
}

interface UseLightningPaymentsDomainParams {
  buildCashuMintCandidates: (
    mintGroups: Map<string, { tokens: string[]; sum: number }>,
    preferredMint: string | null,
  ) => Array<{ mint: string; sum: number; tokens: string[] }>;
  canPayWithCashu: boolean;
  cashuBalance: number;
  cashuIsBusy: boolean;
  cashuTokensWithMeta: CashuTokenWithMetaRow[];
  contacts: readonly ContactRow[];
  defaultMintUrl: string | null;
  displayUnit: string;
  formatInteger: (value: number) => string;
  insert: EvoluMutations["insert"];
  logPaymentEvent: (event: {
    amount?: number | null;
    contactId?: ContactId | null;
    direction: "in" | "out";
    error?: string | null;
    fee?: number | null;
    mint?: string | null;
    status: "ok" | "error";
    unit?: string | null;
  }) => void;
  mintInfoByUrl: Map<string, unknown>;
  normalizeMintUrl: (url: unknown) => string | null;
  setCashuIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setContactsOnboardingHasPaid: React.Dispatch<React.SetStateAction<boolean>>;
  setPostPaySaveContact: React.Dispatch<
    React.SetStateAction<{ amountSat: number; lnAddress: string } | null>
  >;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  showPaidOverlay: (title?: string) => void;
  t: (key: string) => string;
  update: EvoluMutations["update"];
}

export const useLightningPaymentsDomain = ({
  buildCashuMintCandidates,
  canPayWithCashu,
  cashuBalance,
  cashuIsBusy,
  cashuTokensWithMeta,
  contacts,
  defaultMintUrl,
  displayUnit,
  formatInteger,
  insert,
  logPaymentEvent,
  mintInfoByUrl,
  normalizeMintUrl,
  setCashuIsBusy,
  setContactsOnboardingHasPaid,
  setPostPaySaveContact,
  setStatus,
  showPaidOverlay,
  t,
  update,
}: UseLightningPaymentsDomainParams) => {
  const payLightningInvoiceWithCashu = React.useCallback(
    async (invoice: string) => {
      const normalized = invoice.trim();
      if (!normalized) return;

      if (cashuIsBusy) return;
      if (cashuBalance <= 0) {
        setStatus(t("payInsufficient"));
        return;
      }

      setCashuIsBusy(true);
      try {
        setStatus(t("payPaying"));

        const mintGroups = new Map<string, { tokens: string[]; sum: number }>();
        for (const row of cashuTokensWithMeta) {
          if (String(row.state ?? "") !== "accepted") continue;
          const mint = String(row.mint ?? "").trim();
          if (!mint) continue;
          const tokenText = String(row.token ?? row.rawToken ?? "").trim();
          if (!tokenText) continue;

          const amount = Number((row.amount ?? 0) as unknown as number) || 0;
          const entry = mintGroups.get(mint) ?? { tokens: [], sum: 0 };
          entry.tokens.push(tokenText);
          entry.sum += amount;
          mintGroups.set(mint, entry);
        }

        const preferredMint = normalizeMintUrl(defaultMintUrl ?? "");
        const candidates = buildCashuMintCandidates(mintGroups, preferredMint);

        if (candidates.length === 0) {
          setStatus(t("payInsufficient"));
          return;
        }

        let lastError: unknown = null;
        let lastMint: string | null = null;
        for (const candidate of candidates) {
          try {
            const { meltInvoiceWithTokensAtMint } =
              await import("../../cashuMelt");
            const result = await meltInvoiceWithTokensAtMint({
              invoice: normalized,
              mint: candidate.mint,
              tokens: candidate.tokens,
              unit: "sat",
            });

            if (!result.ok) {
              if (result.remainingToken && result.remainingAmount > 0) {
                const recoveryToken = result.remainingToken;
                const inserted = insert("cashuToken", {
                  token: recoveryToken as typeof Evolu.NonEmptyString.Type,
                  rawToken: null,
                  mint: result.mint as typeof Evolu.NonEmptyString1000.Type,
                  unit: result.unit
                    ? (result.unit as typeof Evolu.NonEmptyString100.Type)
                    : null,
                  amount:
                    result.remainingAmount > 0
                      ? (result.remainingAmount as typeof Evolu.PositiveInt.Type)
                      : null,
                  state: "accepted" as typeof Evolu.NonEmptyString100.Type,
                  error: null,
                });

                if (inserted.ok) {
                  for (const row of cashuTokensWithMeta) {
                    if (
                      String(row.state ?? "") === "accepted" &&
                      String(row.mint ?? "").trim() === candidate.mint
                    ) {
                      update("cashuToken", {
                        id: row.id,
                        isDeleted: Evolu.sqliteTrue,
                      });
                    }
                  }
                }
              }

              lastError = result.error;
              lastMint = candidate.mint;

              // If no swap happened, we can safely try other mints.
              if (!result.remainingToken) {
                continue;
              }

              logPaymentEvent({
                direction: "out",
                status: "error",
                amount: null,
                fee: null,
                mint: result.mint,
                unit: result.unit,
                error: String(result.error ?? "unknown"),
                contactId: null,
              });

              setStatus(
                `${t("payFailed")}: ${String(result.error ?? "unknown")}`,
              );
              return;
            }

            if (result.remainingToken && result.remainingAmount > 0) {
              const inserted = insert("cashuToken", {
                token:
                  result.remainingToken as typeof Evolu.NonEmptyString.Type,
                rawToken: null,
                mint: result.mint as typeof Evolu.NonEmptyString1000.Type,
                unit: result.unit
                  ? (result.unit as typeof Evolu.NonEmptyString100.Type)
                  : null,
                amount:
                  result.remainingAmount > 0
                    ? (result.remainingAmount as typeof Evolu.PositiveInt.Type)
                    : null,
                state: "accepted" as typeof Evolu.NonEmptyString100.Type,
                error: null,
              });
              if (!inserted.ok) throw inserted.error;
            }

            for (const row of cashuTokensWithMeta) {
              if (
                String(row.state ?? "") === "accepted" &&
                String(row.mint ?? "").trim() === candidate.mint
              ) {
                update("cashuToken", {
                  id: row.id,
                  isDeleted: Evolu.sqliteTrue,
                });
              }
            }

            logPaymentEvent({
              direction: "out",
              status: "ok",
              amount: result.paidAmount,
              fee: (() => {
                const feePaid = Number(
                  (result as unknown as { feePaid?: unknown }).feePaid ?? 0,
                );
                return Number.isFinite(feePaid) && feePaid > 0 ? feePaid : null;
              })(),
              mint: result.mint,
              unit: result.unit,
              error: null,
              contactId: null,
            });

            showPaidOverlay(
              t("paidSent")
                .replace("{amount}", formatInteger(result.paidAmount))
                .replace("{unit}", displayUnit),
            );

            setStatus(t("paySuccess"));
            safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
            setContactsOnboardingHasPaid(true);
            return;
          } catch (e) {
            lastError = e;
            lastMint = candidate.mint;
          }
        }

        logPaymentEvent({
          direction: "out",
          status: "error",
          amount: null,
          fee: null,
          mint: lastMint,
          unit: "sat",
          error: String(lastError ?? "unknown"),
          contactId: null,
        });
        setStatus(`${t("payFailed")}: ${String(lastError ?? "unknown")}`);
      } finally {
        setCashuIsBusy(false);
      }
    },
    [
      buildCashuMintCandidates,
      cashuBalance,
      cashuIsBusy,
      cashuTokensWithMeta,
      defaultMintUrl,
      displayUnit,
      formatInteger,
      insert,
      logPaymentEvent,
      normalizeMintUrl,
      setCashuIsBusy,
      setContactsOnboardingHasPaid,
      setStatus,
      showPaidOverlay,
      t,
      update,
    ],
  );

  const payLightningAddressWithCashu = React.useCallback(
    async (lnAddress: string, amountSat: number) => {
      const address = String(lnAddress ?? "").trim();
      if (!address) return;
      if (!Number.isFinite(amountSat) || amountSat <= 0) {
        setStatus(`${t("errorPrefix")}: ${t("payInvalidAmount")}`);
        return;
      }
      if (!canPayWithCashu) return;
      if (cashuIsBusy) return;
      setCashuIsBusy(true);

      const knownContact = contacts.find(
        (c) =>
          String(c.lnAddress ?? "")
            .trim()
            .toLowerCase() === address.toLowerCase(),
      );
      const shouldOfferSave = !knownContact?.id;

      try {
        setStatus(t("payFetchingInvoice"));
        let invoice: string;
        try {
          const { fetchLnurlInvoiceForLightningAddress } =
            await import("../../lnurlPay");
          invoice = await fetchLnurlInvoiceForLightningAddress(
            address,
            amountSat,
          );
        } catch (e) {
          setStatus(`${t("payFailed")}: ${String(e)}`);
          return;
        }

        setStatus(t("payPaying"));

        const mintGroups = new Map<string, { tokens: string[]; sum: number }>();
        for (const row of cashuTokensWithMeta) {
          if (String(row.state ?? "") !== "accepted") continue;
          const mint = String(row.mint ?? "").trim();
          if (!mint) continue;
          const tokenText = String(row.token ?? row.rawToken ?? "").trim();
          if (!tokenText) continue;

          const amount = Number((row.amount ?? 0) as unknown as number) || 0;
          const entry = mintGroups.get(mint) ?? { tokens: [], sum: 0 };
          entry.tokens.push(tokenText);
          entry.sum += amount;
          mintGroups.set(mint, entry);
        }

        const candidates = Array.from(mintGroups.entries())
          .map(([mint, info]) => ({ mint, ...info }))
          .sort((a, b) => {
            const normalize = (u: string) =>
              String(u ?? "")
                .trim()
                .replace(/\/+$/, "");
            const mpp = (mint: string) => {
              const row = mintInfoByUrl.get(normalize(mint));
              return String(
                (row as unknown as { supportsMpp?: unknown })?.supportsMpp ??
                  "",
              ) === "1"
                ? 1
                : 0;
            };
            const dmpp = mpp(b.mint) - mpp(a.mint);
            if (dmpp !== 0) return dmpp;
            return b.sum - a.sum;
          });

        if (candidates.length === 0) {
          setStatus(t("payInsufficient"));
          return;
        }

        let lastError: unknown = null;
        let lastMint: string | null = null;
        for (const candidate of candidates) {
          try {
            const { meltInvoiceWithTokensAtMint } =
              await import("../../cashuMelt");
            const result = await meltInvoiceWithTokensAtMint({
              invoice,
              mint: candidate.mint,
              tokens: candidate.tokens,
              unit: "sat",
            });

            if (!result.ok) {
              if (result.remainingToken && result.remainingAmount > 0) {
                const recoveryToken = result.remainingToken;
                const inserted = insert("cashuToken", {
                  token: recoveryToken as typeof Evolu.NonEmptyString.Type,
                  rawToken: null,
                  mint: result.mint as typeof Evolu.NonEmptyString1000.Type,
                  unit: result.unit
                    ? (result.unit as typeof Evolu.NonEmptyString100.Type)
                    : null,
                  amount:
                    result.remainingAmount > 0
                      ? (result.remainingAmount as typeof Evolu.PositiveInt.Type)
                      : null,
                  state: "accepted" as typeof Evolu.NonEmptyString100.Type,
                  error: null,
                });

                if (inserted.ok) {
                  for (const row of cashuTokensWithMeta) {
                    if (
                      String(row.state ?? "") === "accepted" &&
                      String(row.mint ?? "").trim() === candidate.mint
                    ) {
                      update("cashuToken", {
                        id: row.id,
                        isDeleted: Evolu.sqliteTrue,
                      });
                    }
                  }
                }
              }

              lastError = result.error;
              lastMint = candidate.mint;

              if (!result.remainingToken) {
                continue;
              }

              logPaymentEvent({
                direction: "out",
                status: "error",
                amount: amountSat,
                fee: null,
                mint: result.mint,
                unit: result.unit,
                error: String(result.error ?? "unknown"),
                contactId: null,
              });

              setStatus(
                `${t("payFailed")}: ${String(result.error ?? "unknown")}`,
              );
              return;
            }

            if (result.remainingToken && result.remainingAmount > 0) {
              const inserted = insert("cashuToken", {
                token:
                  result.remainingToken as typeof Evolu.NonEmptyString.Type,
                rawToken: null,
                mint: result.mint as typeof Evolu.NonEmptyString1000.Type,
                unit: result.unit
                  ? (result.unit as typeof Evolu.NonEmptyString100.Type)
                  : null,
                amount:
                  result.remainingAmount > 0
                    ? (result.remainingAmount as typeof Evolu.PositiveInt.Type)
                    : null,
                state: "accepted" as typeof Evolu.NonEmptyString100.Type,
                error: null,
              });
              if (!inserted.ok) throw inserted.error;
            }

            for (const row of cashuTokensWithMeta) {
              if (
                String(row.state ?? "") === "accepted" &&
                String(row.mint ?? "").trim() === candidate.mint
              ) {
                update("cashuToken", {
                  id: row.id,
                  isDeleted: Evolu.sqliteTrue,
                });
              }
            }

            const feePaid = Number(
              (result as unknown as { feePaid?: unknown }).feePaid ?? 0,
            );

            logPaymentEvent({
              direction: "out",
              status: "ok",
              amount: result.paidAmount,
              fee: Number.isFinite(feePaid) && feePaid > 0 ? feePaid : null,
              mint: result.mint,
              unit: result.unit,
              error: null,
              contactId: null,
            });

            showPaidOverlay(
              t("paidSentTo")
                .replace("{amount}", formatInteger(result.paidAmount))
                .replace("{unit}", displayUnit)
                .replace(
                  "{name}",
                  String(knownContact?.name ?? "").trim() || address,
                ),
            );

            safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
            setContactsOnboardingHasPaid(true);

            // Offer to save as a contact after a successful pay to a new address.
            if (shouldOfferSave) {
              setPostPaySaveContact({
                lnAddress: address,
                amountSat: result.paidAmount,
              });
            }
            return;
          } catch (e) {
            lastError = e;
            lastMint = candidate.mint;
          }
        }

        logPaymentEvent({
          direction: "out",
          status: "error",
          amount: amountSat,
          fee: null,
          mint: lastMint,
          unit: "sat",
          error: String(lastError ?? "unknown"),
          contactId: null,
        });
        setStatus(`${t("payFailed")}: ${String(lastError ?? "unknown")}`);
      } finally {
        setCashuIsBusy(false);
      }
    },
    [
      canPayWithCashu,
      cashuIsBusy,
      cashuTokensWithMeta,
      contacts,
      displayUnit,
      formatInteger,
      insert,
      logPaymentEvent,
      mintInfoByUrl,
      setCashuIsBusy,
      setContactsOnboardingHasPaid,
      setPostPaySaveContact,
      setStatus,
      showPaidOverlay,
      t,
      update,
    ],
  );

  return {
    payLightningAddressWithCashu,
    payLightningInvoiceWithCashu,
  };
};
