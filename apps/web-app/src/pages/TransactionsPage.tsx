import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import React from "react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";
import {
  parseCashuPaymentRequestMessage,
  parseLinkyPaymentRequestDeclineMessage,
} from "../app/lib/paymentRequestMessage";
import { deriveDefaultProfile } from "../derivedProfile";
import { evolu } from "../evolu";
import type { JsonValue } from "../types/json";
import {
  formatInteger,
  getInitials,
  normalizeLocale,
} from "../utils/formatting";

type TransactionStatus = "declined" | "error" | "ok";
type TransactionDirection = "in" | "out";

interface ContactSummary {
  id: string;
  lnAddress: string | null;
  name: string | null;
  npub: string | null;
}

interface TransactionItem {
  amount: number | null;
  category: string;
  contactId: string | null;
  createdAtSec: number;
  details: JsonValue | null;
  direction: TransactionDirection;
  error: string | null;
  fee: number | null;
  id: string;
  method: string | null;
  mint: string | null;
  note: string | null;
  pendingLabel: string | null;
  phase: string | null;
  status: TransactionStatus;
  unit: string | null;
}

interface TransactionDetailValue {
  copyValue?: string;
  value: string;
}

interface TransactionDetailEntry {
  label: string;
  values: TransactionDetailValue[];
}

const readText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const readPositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const readAmount = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
};

const readDirection = (value: unknown): TransactionDirection | null => {
  return value === "in" || value === "out" ? value : null;
};

const readStatus = (value: unknown): TransactionStatus | null => {
  return value === "declined" || value === "error" || value === "ok"
    ? value
    : null;
};

const isJsonRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null) return true;
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isJsonRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
};

const parseJsonValue = (value: unknown): JsonValue | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isJsonValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const readJsonRecord = (
  value: JsonValue | null,
): Record<string, JsonValue> | null =>
  value !== null && isJsonRecord(value) ? value : null;

const readStringFromJson = (
  value: JsonValue | null | undefined,
): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const readStringArrayFromJson = (
  value: JsonValue | null | undefined,
): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => readStringFromJson(entry))
    .filter((entry): entry is string => entry !== null);
};

const scoreContact = (contact: ContactSummary): number => {
  let score = 0;
  if (contact.name) score += 4;
  if (contact.npub) score += 2;
  if (contact.lnAddress) score += 1;
  return score;
};

const formatCompactToken = (value: string): string => {
  if (value.length <= 28) return value;
  return `${value.slice(0, 12)}...${value.slice(-12)}`;
};

const formatCompactLongString = (value: string): string => {
  if (value.length <= 20) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

const readRequestIdFromDetails = (details: JsonValue | null): string | null => {
  const detailRecord = readJsonRecord(details);
  return readStringFromJson(detailRecord?.requestId);
};

const readRequestTextFromDetails = (
  details: JsonValue | null,
): string | null => {
  const detailRecord = readJsonRecord(details);
  return readStringFromJson(detailRecord?.requestText);
};

const readIssuedTokenFromDetails = (
  details: JsonValue | null,
): string | null => {
  const detailRecord = readJsonRecord(details);
  return readStringFromJson(detailRecord?.issuedToken);
};

const mergeDetailRecords = (
  primary: JsonValue | null,
  secondary: JsonValue | null,
): JsonValue | null => {
  const primaryRecord = readJsonRecord(primary);
  const secondaryRecord = readJsonRecord(secondary);

  if (!primaryRecord && !secondaryRecord) return null;

  return {
    ...(primaryRecord ?? {}),
    ...(secondaryRecord ?? {}),
  };
};

const isPaymentRequestTransaction = (item: TransactionItem): boolean => {
  return (
    item.direction === "in" &&
    item.method === "cashu_chat" &&
    readRequestIdFromDetails(item.details) !== null &&
    readRequestTextFromDetails(item.details) !== null
  );
};

export function TransactionsPage(): React.ReactElement {
  const { formatDisplayedAmountText, lang, nostrPictureByNpub, t } =
    useAppShellCore();
  const { copyText } = useAppShellActions();
  const [expandedById, setExpandedById] = React.useState<
    Record<string, boolean>
  >({});
  const locale = React.useMemo(() => normalizeLocale(lang), [lang]);

  const contactsQuery = React.useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("contact")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue),
      ),
    [],
  );

  const transactionsQuery = React.useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("transaction")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue),
      ),
    [],
  );

  const nostrMessagesQuery = React.useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("nostrMessage")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue),
      ),
    [],
  );

  const contactRows = useQuery(contactsQuery);
  const nostrMessageRows = useQuery(nostrMessagesQuery);
  const transactionRows = useQuery(transactionsQuery);

  const contactsById = React.useMemo(() => {
    const byId = new Map<string, ContactSummary>();
    for (const row of contactRows) {
      if (typeof row !== "object" || row === null) continue;
      const id = readText("id" in row ? row.id : null);
      if (!id) continue;
      const candidate: ContactSummary = {
        id,
        lnAddress: readText("lnAddress" in row ? row.lnAddress : null),
        name: readText("name" in row ? row.name : null),
        npub: readText("npub" in row ? row.npub : null),
      };
      const existing = byId.get(id);
      if (!existing || scoreContact(candidate) >= scoreContact(existing)) {
        byId.set(id, candidate);
      }
    }
    return byId;
  }, [contactRows]);

  const { fulfilledRequestIds, transactions } = React.useMemo(() => {
    const items: TransactionItem[] = [];
    for (const row of transactionRows) {
      if (typeof row !== "object" || row === null) continue;
      const id = readText("id" in row ? row.id : null);
      const createdAtSec = readPositiveInt(
        "createdAtSec" in row ? row.createdAtSec : null,
      );
      const direction = readDirection(
        "direction" in row ? row.direction : null,
      );
      const status = readStatus("status" in row ? row.status : null);
      if (!id || !createdAtSec || !direction || !status) continue;
      items.push({
        amount: readAmount("amount" in row ? row.amount : null),
        category: readText("category" in row ? row.category : null) || "cashu",
        contactId: readText("contactId" in row ? row.contactId : null),
        createdAtSec,
        details: parseJsonValue("detailsJson" in row ? row.detailsJson : null),
        direction,
        error: readText("error" in row ? row.error : null),
        fee: readAmount("fee" in row ? row.fee : null),
        id,
        method: readText("method" in row ? row.method : null),
        mint: readText("mint" in row ? row.mint : null),
        note: readText("note" in row ? row.note : null),
        pendingLabel: readText("pendingLabel" in row ? row.pendingLabel : null),
        phase: readText("phase" in row ? row.phase : null),
        status,
        unit: readText("unit" in row ? row.unit : null),
      });
    }
    items.sort((left, right) => {
      const createdAtDiff = right.createdAtSec - left.createdAtSec;
      if (createdAtDiff !== 0) return createdAtDiff;
      return right.id.localeCompare(left.id);
    });
    const requestByRequestId = new Map<string, TransactionItem>();
    const fulfillmentByRequestId = new Map<string, TransactionItem>();
    const emittedByToken = new Map<string, TransactionItem>();
    const spendByUsedToken = new Map<string, TransactionItem>();

    for (const item of items) {
      const requestId = readRequestIdFromDetails(item.details);
      if (!requestId) continue;

      if (isPaymentRequestTransaction(item)) {
        if (!requestByRequestId.has(requestId)) {
          requestByRequestId.set(requestId, item);
        }
        continue;
      }

      if (item.status !== "ok") continue;
      if (!fulfillmentByRequestId.has(requestId)) {
        fulfillmentByRequestId.set(requestId, item);
      }
    }

    for (const item of items) {
      if (item.status !== "ok") continue;

      const issuedToken = readIssuedTokenFromDetails(item.details);
      if (issuedToken && !emittedByToken.has(issuedToken)) {
        emittedByToken.set(issuedToken, item);
      }

      const detailRecord = readJsonRecord(item.details);
      const usedTokens = readStringArrayFromJson(detailRecord?.usedInputTokens);
      for (const token of usedTokens) {
        if (spendByUsedToken.has(token)) continue;
        spendByUsedToken.set(token, item);
      }
    }

    const visibleTransactions = items
      .filter((item) => {
        const requestId = readRequestIdFromDetails(item.details);
        if (requestId) {
          if (isPaymentRequestTransaction(item)) {
            return requestByRequestId.get(requestId)?.id === item.id;
          }
          if (requestByRequestId.has(requestId)) return false;
          if (item.status === "ok") {
            return fulfillmentByRequestId.get(requestId)?.id === item.id;
          }
        }

        const issuedToken = readIssuedTokenFromDetails(item.details);
        if (!issuedToken) return true;
        return !spendByUsedToken.has(issuedToken);
      })
      .map((item) => {
        let mergedItem = item;

        const detailRecord = readJsonRecord(mergedItem.details);
        const usedTokens = readStringArrayFromJson(
          detailRecord?.usedInputTokens,
        );
        for (const token of usedTokens) {
          const emittedTransaction = emittedByToken.get(token);
          if (!emittedTransaction) continue;
          if (emittedTransaction.id === mergedItem.id) continue;
          mergedItem = {
            ...mergedItem,
            details: mergeDetailRecords(
              mergedItem.details,
              emittedTransaction.details,
            ),
          };
          break;
        }

        const requestId = readRequestIdFromDetails(item.details);
        if (!requestId || !isPaymentRequestTransaction(item)) {
          return mergedItem;
        }

        const fulfillment = fulfillmentByRequestId.get(requestId);
        if (!fulfillment) return mergedItem;

        return {
          ...mergedItem,
          details: mergeDetailRecords(mergedItem.details, fulfillment.details),
        };
      });

    return {
      fulfilledRequestIds: new Set(fulfillmentByRequestId.keys()),
      transactions: visibleTransactions,
    };
  }, [transactionRows]);

  const declinedRequestIds = React.useMemo(() => {
    const requestIdByRumorId = new Map<string, string>();
    const latestDeclineAtByRequestId = new Map<string, number>();

    for (const row of nostrMessageRows) {
      if (typeof row !== "object" || row === null) continue;

      const rumorId = readText("rumorId" in row ? row.rumorId : null);
      const content = readText("content" in row ? row.content : null) || "";
      const requestInfo = parseCashuPaymentRequestMessage(content);
      const requestId = String(requestInfo?.requestId ?? "").trim();

      if (rumorId && requestId) {
        requestIdByRumorId.set(rumorId, requestId);
      }
    }

    for (const row of nostrMessageRows) {
      if (typeof row !== "object" || row === null) continue;

      const content = readText("content" in row ? row.content : null) || "";
      const declineInfo = parseLinkyPaymentRequestDeclineMessage(content);
      const requestRumorId = String(declineInfo?.requestRumorId ?? "").trim();
      if (!requestRumorId) continue;

      const requestId = requestIdByRumorId.get(requestRumorId);
      if (!requestId) continue;

      const createdAtSec = readPositiveInt(
        "createdAtSec" in row ? row.createdAtSec : null,
      );
      const previousCreatedAtSec = latestDeclineAtByRequestId.get(requestId);
      if (
        previousCreatedAtSec !== undefined &&
        createdAtSec !== null &&
        previousCreatedAtSec > createdAtSec
      ) {
        continue;
      }

      latestDeclineAtByRequestId.set(requestId, createdAtSec ?? 0);
    }

    return new Set(latestDeclineAtByRequestId.keys());
  }, [nostrMessageRows]);

  const buildTitle = React.useCallback(
    (item: TransactionItem): string => {
      if (isPaymentRequestTransaction(item)) return t("requestPaymentLabel");
      if (item.note) return item.note;

      const contact = item.contactId ? contactsById.get(item.contactId) : null;
      if (contact) {
        return (
          contact.name ||
          contact.lnAddress ||
          (item.direction === "in"
            ? t("transactionReceivedFromContact")
            : t("transactionSentToContact"))
        );
      }
      if (item.note) return item.note;
      if (item.category === "lightning") {
        if (item.direction === "in") {
          return item.method === "lightning_address"
            ? t("transactionTopupLnAddress")
            : t("transactionTopupInvoice");
        }
        return item.method === "lightning_address"
          ? t("transactionPaidLightningAddress")
          : t("transactionPaidLightningInvoice");
      }
      if (item.category === "contacts") {
        return item.direction === "in"
          ? t("transactionReceivedFromContact")
          : t("transactionSentToContact");
      }
      if (item.method === "cashu_receive") return t("transactionCashuInserted");
      if (item.method === "cashu_restore") return t("transactionCashuRestored");
      if (item.phase === "swap") return t("transactionCashuSwap");
      return t("transactionCashuIssued");
    },
    [contactsById, t],
  );

  const formatDateText = React.useCallback(
    (createdAtSec: number): string => {
      return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(createdAtSec * 1000));
    },
    [locale],
  );

  const formatAmountText = React.useCallback(
    (amount: number | null, unit: string | null): string => {
      if (amount === null) return "";
      if (unit && unit !== "sat") {
        return `${formatInteger(amount, lang)} ${unit}`;
      }
      return formatDisplayedAmountText(amount);
    },
    [formatDisplayedAmountText, lang],
  );

  const buildProblemStatusPill = React.useCallback(
    (
      item: TransactionItem,
      requestStatus: "declined" | "paid" | "pending" | null,
    ): { className: string; label: string } | null => {
      if (requestStatus === "pending" || item.pendingLabel === "pending") {
        return {
          className: "pill pill-muted transaction-status-pill",
          label: t("transactionPending"),
        };
      }
      if (requestStatus === "declined") {
        return {
          className: "pill pill-error transaction-status-pill",
          label: t("paymentRequestStatusDeclined"),
        };
      }
      if (item.status === "error" || item.status === "declined") {
        return {
          className: "pill pill-error transaction-status-pill",
          label: t("transactionFailed"),
        };
      }
      return null;
    },
    [t],
  );

  const buildMeta = React.useCallback(
    (item: TransactionItem): string => {
      return formatDateText(item.createdAtSec);
    },
    [formatDateText],
  );

  const readLnurlSuccessMessage = React.useCallback(
    (item: TransactionItem): string | null => {
      const details = readJsonRecord(item.details);
      if (!details) return null;
      const message = readStringFromJson(details.lnurlSuccessMessage);
      if (message) return message;
      const url = readStringFromJson(details.lnurlSuccessUrl);
      if (!url) return null;
      const description = readStringFromJson(
        details.lnurlSuccessUrlDescription,
      );
      return description ? `${description} ${url}` : url;
    },
    [],
  );

  const getRequestStatus = React.useCallback(
    (item: TransactionItem): "declined" | "paid" | "pending" | null => {
      if (!isPaymentRequestTransaction(item)) return null;
      const requestId = readRequestIdFromDetails(item.details);
      if (!requestId) return null;
      if (fulfilledRequestIds.has(requestId)) return "paid";
      if (declinedRequestIds.has(requestId)) return "declined";
      return "pending";
    },
    [declinedRequestIds, fulfilledRequestIds],
  );

  const buildDetailEntries = React.useCallback(
    (item: TransactionItem): TransactionDetailEntry[] => {
      const details = readJsonRecord(item.details);
      const feeText =
        item.direction === "out"
          ? formatAmountText(item.fee ?? 0, item.unit)
          : "";

      const usedTokens = readStringArrayFromJson(details?.usedInputTokens);
      const gainedTokens = [
        readStringFromJson(details?.gainedToken),
        readStringFromJson(details?.acceptedToken),
      ].filter((value): value is string => value !== null);
      const lightningMemo = readStringFromJson(details?.lightningMemo);
      const lightningInvoice = readStringFromJson(details?.lightningInvoice);
      const lightningPreimage = readStringFromJson(details?.lightningPreimage);
      const lnurlSuccessMessage = readStringFromJson(
        details?.lnurlSuccessMessage,
      );
      const lnurlSuccessUrl = readStringFromJson(details?.lnurlSuccessUrl);
      const lnurlSuccessUrlDescription = readStringFromJson(
        details?.lnurlSuccessUrlDescription,
      );

      return [
        ...(feeText
          ? [
              {
                label: t("paymentsHistoryFee"),
                values: [{ value: feeText }],
              },
            ]
          : []),
        ...(item.mint
          ? [
              {
                label: t("transactionDetailMint"),
                values: [{ value: item.mint }],
              },
            ]
          : []),
        ...(item.error
          ? [
              {
                label: t("transactionDetailError"),
                values: [{ value: item.error }],
              },
            ]
          : []),
        ...(usedTokens.length > 0
          ? [
              {
                label: t("transactionDetailUsedToken"),
                values: usedTokens.map((value) => ({
                  copyValue: value,
                  value: formatCompactToken(value),
                })),
              },
            ]
          : []),
        ...(gainedTokens.length > 0
          ? [
              {
                label: t("transactionDetailGainedToken"),
                values: gainedTokens.map((value) => ({
                  copyValue: value,
                  value: formatCompactToken(value),
                })),
              },
            ]
          : []),
        ...(lnurlSuccessMessage
          ? [
              {
                label: t("transactionDetailLnurlSuccessMessage"),
                values: [{ value: lnurlSuccessMessage }],
              },
            ]
          : []),
        ...(lnurlSuccessUrl
          ? [
              {
                label: t("transactionDetailLnurlSuccessUrl"),
                values: [
                  {
                    value: lnurlSuccessUrlDescription
                      ? `${lnurlSuccessUrlDescription} ${lnurlSuccessUrl}`
                      : lnurlSuccessUrl,
                    copyValue: lnurlSuccessUrl,
                  },
                ],
              },
            ]
          : []),
        ...(lightningMemo
          ? [
              {
                label: t("transactionDetailLightningMemo"),
                values: [{ value: lightningMemo }],
              },
            ]
          : []),
        ...(lightningInvoice
          ? [
              {
                label: t("transactionDetailLightningInvoice"),
                values: [
                  {
                    copyValue: lightningInvoice,
                    value: formatCompactLongString(lightningInvoice),
                  },
                ],
              },
            ]
          : []),
        ...(lightningPreimage
          ? [
              {
                label: t("transactionDetailLightningPreimage"),
                values: [
                  {
                    copyValue: lightningPreimage,
                    value: formatCompactLongString(lightningPreimage),
                  },
                ],
              },
            ]
          : []),
      ];
    },
    [formatAmountText, t],
  );

  const toggleExpanded = React.useCallback((id: string) => {
    setExpandedById((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  return (
    <section className="panel panel-plain transactions-page">
      {transactions.length === 0 ? (
        <p className="muted">{t("paymentsHistoryEmpty")}</p>
      ) : (
        <div className="transactions-list">
          {transactions.map((item) => {
            const contact = item.contactId
              ? contactsById.get(item.contactId)
              : null;
            const generatedPicture = contact?.npub
              ? deriveDefaultProfile(contact.npub).pictureUrl
              : null;
            const pictureUrl =
              (contact?.npub ? nostrPictureByNpub[contact.npub] : null) ||
              generatedPicture;
            const initials = getInitials(contact?.name || buildTitle(item));
            const amountText = formatAmountText(item.amount, item.unit);
            const amountClassName =
              item.direction === "in"
                ? "transaction-amount is-positive"
                : "transaction-amount is-negative";
            const isExpanded = expandedById[item.id] === true;
            const requestStatus = getRequestStatus(item);
            const problemStatusPill = buildProblemStatusPill(
              item,
              requestStatus,
            );
            const detailEntries = buildDetailEntries(item);
            const hasDetails = detailEntries.length > 0;
            const isUnsuccessful =
              requestStatus === "declined" ||
              item.status === "declined" ||
              item.status === "error";

            return (
              <div
                key={item.id}
                className={`transaction-card${hasDetails ? " is-expandable" : ""}${isUnsuccessful ? " is-unsuccessful" : ""}`}
                onClick={() => {
                  if (!hasDetails) return;
                  toggleExpanded(item.id);
                }}
                onKeyDown={(event) => {
                  if (!hasDetails) return;
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  toggleExpanded(item.id);
                }}
                role={hasDetails ? "button" : undefined}
                tabIndex={hasDetails ? 0 : undefined}
              >
                <article className="transaction-row">
                  <div
                    className="contact-avatar transaction-avatar"
                    aria-hidden="true"
                  >
                    {contact ? (
                      pictureUrl ? (
                        <img
                          src={pictureUrl}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="contact-avatar-fallback">
                          {initials}
                        </span>
                      )
                    ) : (
                      <span className="contact-avatar-fallback transaction-icon-fallback">
                        {item.category === "lightning" ? "⚡️" : "🥜"}
                      </span>
                    )}
                  </div>
                  <div className="transaction-main">
                    <div className="transaction-title">{buildTitle(item)}</div>
                    {(() => {
                      const lnurlMessage = readLnurlSuccessMessage(item);
                      return lnurlMessage ? (
                        <div className="transaction-subtitle">
                          {lnurlMessage}
                        </div>
                      ) : null;
                    })()}
                    <div className="transaction-meta">
                      <span>{buildMeta(item)}</span>
                      {problemStatusPill ? (
                        <span className={problemStatusPill.className}>
                          {problemStatusPill.label}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className={amountClassName}>{amountText || ""}</div>
                </article>
                {hasDetails && isExpanded ? (
                  <div className="transaction-detail-panel">
                    <dl className="transaction-detail-list">
                      {detailEntries.map((field, index) => (
                        <React.Fragment
                          key={`${item.id}:${field.label}:${index}`}
                        >
                          <dt>{field.label}</dt>
                          <dd>
                            <div className="transaction-detail-values">
                              {field.values.map((value, valueIndex) =>
                                value.copyValue ? (
                                  <button
                                    key={`${item.id}:${field.label}:${index}:${valueIndex}`}
                                    type="button"
                                    className="copyable transaction-detail-copy"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void copyText(value.copyValue ?? "");
                                    }}
                                    onKeyDown={(event) => {
                                      event.stopPropagation();
                                    }}
                                    title={t("copy")}
                                    aria-label={t("copy")}
                                  >
                                    <span className="transaction-detail-copyText">
                                      {value.value}
                                    </span>
                                    <span
                                      className="transaction-detail-copyIcon"
                                      aria-hidden="true"
                                    >
                                      <svg
                                        viewBox="0 0 16 16"
                                        width="14"
                                        height="14"
                                        focusable="false"
                                      >
                                        <rect
                                          x="5"
                                          y="3"
                                          width="8"
                                          height="10"
                                          rx="2"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="1.5"
                                        />
                                        <rect
                                          x="2"
                                          y="6"
                                          width="8"
                                          height="8"
                                          rx="2"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="1.5"
                                        />
                                      </svg>
                                    </span>
                                  </button>
                                ) : (
                                  <span
                                    key={`${item.id}:${field.label}:${index}:${valueIndex}`}
                                  >
                                    {value.value}
                                  </span>
                                ),
                              )}
                            </div>
                          </dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
