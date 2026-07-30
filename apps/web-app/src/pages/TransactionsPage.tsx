import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import React from "react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";
import { CompactCopyIcon } from "../components/icons";
import {
  parseCashuPaymentRequestMessage,
  parseLinkyPaymentRequestDeclineMessage,
} from "../app/lib/paymentRequestMessage";
import { createCashuTokenId } from "../app/lib/cashuTokenIdentity";
import { deriveDefaultProfile } from "../derivedProfile";
import { evolu } from "../evolu";
import { getLightningInvoicePreview } from "../utils/lightningInvoice";
import { calculateTransactionHistoryFee } from "../app/lib/transactionHistoryFee";
import type { JsonValue } from "../types/json";
import {
  formatInteger,
  getInitials,
  normalizeLocale,
} from "../utils/formatting";

type TransactionStatus = "declined" | "error" | "ok" | "pending";
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

interface TransactionStatusPill {
  className: string;
  label: string;
}

interface TransactionHistoryRow {
  amount?: unknown;
  category?: unknown;
  contactId?: unknown;
  createdAtSec?: unknown;
  detailsJson?: unknown;
  direction?: unknown;
  error?: unknown;
  fee?: unknown;
  id?: unknown;
  method?: unknown;
  mint?: unknown;
  note?: unknown;
  ownerId?: unknown;
  pendingLabel?: unknown;
  phase?: unknown;
  status?: unknown;
  unit?: unknown;
}

interface NostrMessageHistoryRow {
  content?: unknown;
  createdAtSec?: unknown;
  rumorId?: unknown;
}

const TRANSACTION_PAGE_SIZE = 50;

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
  return value === "declined" ||
    value === "error" ||
    value === "ok" ||
    value === "pending"
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

const readIssuedTokenFromDetails = (
  details: JsonValue | null,
): string | null => {
  const detailRecord = readJsonRecord(details);
  return readStringFromJson(detailRecord?.issuedToken);
};

const readTokenReferenceIds = (
  details: JsonValue | null,
  idKey: string,
  legacyTokenKey: string,
): string[] => {
  const detailRecord = readJsonRecord(details);
  const storedIds = readStringArrayFromJson(detailRecord?.[idKey]);
  const legacyTokens = readStringArrayFromJson(detailRecord?.[legacyTokenKey]);
  return Array.from(
    new Set([
      ...storedIds,
      ...legacyTokens.map((token) => String(createCashuTokenId(token))),
    ]),
  );
};

const readIssuedTokenReferenceId = (
  details: JsonValue | null,
): string | null => {
  const detailRecord = readJsonRecord(details);
  const storedId = readStringFromJson(detailRecord?.issuedTokenId);
  if (storedId) return storedId;
  const legacyToken = readIssuedTokenFromDetails(details);
  return legacyToken ? String(createCashuTokenId(legacyToken)) : null;
};

const deriveTransactionCategory = (
  method: string | null,
  legacyCategory: string | null,
): string => {
  if (method === "cashu_chat") return "contacts";
  if (method === "lightning_address" || method === "lightning_invoice") {
    return "lightning";
  }
  return legacyCategory || "cashu";
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
    readRequestIdFromDetails(item.details) !== null
  );
};

const buildTransactionHistory = (
  transactionRows: readonly TransactionHistoryRow[],
  evoluAppOwnerId: string | null | undefined,
  evoluTransactionsVisibleOwnerIds: readonly (string | null | undefined)[],
): {
  fulfilledRequestIds: Set<string>;
  transactions: TransactionItem[];
} => {
  const items: TransactionItem[] = [];
  const visibleOwnerIds = new Set(
    [evoluAppOwnerId, ...evoluTransactionsVisibleOwnerIds]
      .map((ownerId) => readText(ownerId))
      .filter((ownerId): ownerId is string => ownerId !== null),
  );
  for (const row of transactionRows) {
    const ownerId = readText(row.ownerId);
    if (ownerId && visibleOwnerIds.size > 0 && !visibleOwnerIds.has(ownerId)) {
      continue;
    }
    const id = readText(row.id);
    const createdAtSec = readPositiveInt(row.createdAtSec);
    const direction = readDirection(row.direction);
    const status = readStatus(row.status);
    if (!id || !createdAtSec || !direction || !status) continue;
    const method = readText(row.method);
    items.push({
      amount: readAmount(row.amount),
      category: deriveTransactionCategory(method, readText(row.category)),
      contactId: readText(row.contactId),
      createdAtSec,
      details: parseJsonValue(row.detailsJson),
      direction,
      error: readText(row.error),
      fee: readAmount(row.fee),
      id,
      method,
      mint: readText(row.mint),
      note: readText(row.note),
      pendingLabel: readText(row.pendingLabel),
      phase: readText(row.phase),
      status,
      unit: readText(row.unit),
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

    const issuedTokenId = readIssuedTokenReferenceId(item.details);
    if (issuedTokenId && !emittedByToken.has(issuedTokenId)) {
      emittedByToken.set(issuedTokenId, item);
    }

    const usedTokenIds = readTokenReferenceIds(
      item.details,
      "usedTokenIds",
      "usedInputTokens",
    );
    for (const tokenId of usedTokenIds) {
      if (spendByUsedToken.has(tokenId)) continue;
      spendByUsedToken.set(tokenId, item);
    }
  }

  const transactions = items
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

      const issuedTokenId = readIssuedTokenReferenceId(item.details);
      if (!issuedTokenId) return true;
      return !spendByUsedToken.has(issuedTokenId);
    })
    .map((item) => {
      let mergedItem = item;

      const usedTokenIds = readTokenReferenceIds(
        mergedItem.details,
        "usedTokenIds",
        "usedInputTokens",
      );
      for (const tokenId of usedTokenIds) {
        const emittedTransaction = emittedByToken.get(tokenId);
        if (!emittedTransaction || emittedTransaction.id === mergedItem.id) {
          continue;
        }
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
    transactions,
  };
};

const deriveDeclinedRequestIds = (
  nostrMessageRows: readonly NostrMessageHistoryRow[],
): Set<string> => {
  const requestIdByRumorId = new Map<string, string>();
  const latestDeclineAtByRequestId = new Map<string, number>();

  for (const row of nostrMessageRows) {
    const rumorId = readText(row.rumorId);
    const content = readText(row.content) || "";
    const requestInfo = parseCashuPaymentRequestMessage(content);
    const requestId = String(requestInfo?.requestId ?? "").trim();

    if (rumorId && requestId) {
      requestIdByRumorId.set(rumorId, requestId);
    }
  }

  for (const row of nostrMessageRows) {
    const content = readText(row.content) || "";
    const declineInfo = parseLinkyPaymentRequestDeclineMessage(content);
    const requestRumorId = String(declineInfo?.requestRumorId ?? "").trim();
    if (!requestRumorId) continue;

    const requestId = requestIdByRumorId.get(requestRumorId);
    if (!requestId) continue;

    const createdAtSec = readPositiveInt(row.createdAtSec);
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
};

const readLnurlSuccessMessage = (item: TransactionItem): string | null => {
  const details = readJsonRecord(item.details);
  if (!details) return null;
  const message = readStringFromJson(details.lnurlSuccessMessage);
  if (message) return message;
  const url = readStringFromJson(details.lnurlSuccessUrl);
  if (!url) return null;
  const description = readStringFromJson(details.lnurlSuccessUrlDescription);
  return description ? `${description} ${url}` : url;
};

const hasTransactionDetails = (
  item: TransactionItem,
  tokenByReferenceId: ReadonlyMap<string, string>,
): boolean => {
  if (
    item.mint ||
    item.error ||
    (item.direction === "out" && item.fee !== null)
  ) {
    return true;
  }

  const details = readJsonRecord(item.details);
  if (!details) return false;

  const hasStoredToken = (
    rawKeys: readonly string[],
    referenceKey: string,
  ): boolean => {
    if (
      rawKeys.some((key) => readStringFromJson(details[key]) !== null) ||
      readStringArrayFromJson(details[referenceKey]).some((id) =>
        tokenByReferenceId.has(id),
      )
    ) {
      return true;
    }
    return rawKeys.some(
      (key) => readStringArrayFromJson(details[key]).length > 0,
    );
  };

  return (
    hasStoredToken(["usedInputTokens"], "usedTokenIds") ||
    hasStoredToken(["gainedToken", "acceptedToken"], "gainedTokenIds") ||
    [
      details.lightningInvoice,
      details.lightningMemo,
      details.lightningPreimage,
      details.lnurlSuccessMessage,
      details.lnurlSuccessUrl,
    ].some((value) => readStringFromJson(value) !== null)
  );
};

interface TransactionCardProps {
  buildDetailEntries: (item: TransactionItem) => TransactionDetailEntry[];
  buildProblemStatusPill: (
    item: TransactionItem,
    requestStatus: "declined" | "paid" | "pending" | null,
  ) => TransactionStatusPill | null;
  buildTitle: (item: TransactionItem) => string;
  contactsById: ReadonlyMap<string, ContactSummary>;
  copyText: (text: string) => Promise<void>;
  formatAmountText: (amount: number | null, unit: string | null) => string;
  formatDateText: (createdAtSec: number) => string;
  getRequestStatus: (
    item: TransactionItem,
  ) => "declined" | "paid" | "pending" | null;
  isExpanded: boolean;
  item: TransactionItem;
  nostrPictureByNpub: Readonly<Record<string, string | null>>;
  onToggle: (id: string) => void;
  t: (key: string) => string;
  tokenByReferenceId: ReadonlyMap<string, string>;
}

const TransactionCardView = ({
  buildDetailEntries,
  buildProblemStatusPill,
  buildTitle,
  contactsById,
  copyText,
  formatAmountText,
  formatDateText,
  getRequestStatus,
  isExpanded,
  item,
  nostrPictureByNpub,
  onToggle,
  t,
  tokenByReferenceId,
}: TransactionCardProps): React.ReactElement => {
  const contact = item.contactId ? contactsById.get(item.contactId) : null;
  const title = buildTitle(item);
  const generatedPicture = contact?.npub
    ? deriveDefaultProfile(contact.npub).pictureUrl
    : null;
  const pictureUrl =
    (contact?.npub ? nostrPictureByNpub[contact.npub] : null) ||
    generatedPicture;
  const initials = getInitials(contact?.name || title);
  const amountText = formatAmountText(item.amount, item.unit);
  const amountClassName =
    item.direction === "in"
      ? "transaction-amount is-positive"
      : "transaction-amount is-negative";
  const requestStatus = getRequestStatus(item);
  const problemStatusPill = buildProblemStatusPill(item, requestStatus);
  const hasDetails = React.useMemo(
    () => hasTransactionDetails(item, tokenByReferenceId),
    [item, tokenByReferenceId],
  );
  const detailEntries = React.useMemo(
    () => (hasDetails && isExpanded ? buildDetailEntries(item) : []),
    [buildDetailEntries, hasDetails, isExpanded, item],
  );
  const isUnsuccessful =
    requestStatus === "declined" ||
    item.status === "declined" ||
    item.status === "error";
  const lnurlMessage = readLnurlSuccessMessage(item);

  return (
    <div
      className={`transaction-card${hasDetails ? " is-expandable" : ""}${isUnsuccessful ? " is-unsuccessful" : ""}`}
      onClick={() => {
        if (hasDetails) onToggle(item.id);
      }}
      onKeyDown={(event) => {
        if (!hasDetails) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onToggle(item.id);
      }}
      role={hasDetails ? "button" : undefined}
      tabIndex={hasDetails ? 0 : undefined}
    >
      <article className="transaction-row">
        <div className="contact-avatar transaction-avatar" aria-hidden="true">
          {contact ? (
            pictureUrl ? (
              <img
                src={pictureUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="contact-avatar-fallback">{initials}</span>
            )
          ) : (
            <span className="contact-avatar-fallback transaction-icon-fallback">
              {item.category === "lightning" ? "⚡️" : "🥜"}
            </span>
          )}
        </div>
        <div className="transaction-main">
          <div className="transaction-title">{title}</div>
          {lnurlMessage ? (
            <div className="transaction-subtitle">{lnurlMessage}</div>
          ) : null}
          <div className="transaction-meta">
            <span>{formatDateText(item.createdAtSec)}</span>
            {problemStatusPill ? (
              <span className={problemStatusPill.className}>
                {problemStatusPill.label}
              </span>
            ) : null}
          </div>
        </div>
        <div className={amountClassName}>{amountText || ""}</div>
      </article>
      {detailEntries.length > 0 ? (
        <div className="transaction-detail-panel">
          <dl className="transaction-detail-list">
            {detailEntries.map((field, index) => (
              <React.Fragment key={`${item.id}:${field.label}:${index}`}>
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
                            <CompactCopyIcon size={14} />
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
};

const TransactionCard = React.memo(TransactionCardView);

export function TransactionsPage(): React.ReactElement {
  const {
    evoluAppOwnerId,
    evoluTransactionsVisibleOwnerIds,
    formatDisplayedAmountText,
    lang,
    nostrPictureByNpub,
    t,
  } = useAppShellCore();
  const { copyText } = useAppShellActions();
  const [expandedById, setExpandedById] = React.useState<
    Record<string, boolean>
  >({});
  const [visibleCount, setVisibleCount] = React.useState(TRANSACTION_PAGE_SIZE);
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

  const cashuTokensQuery = React.useMemo(
    () => evolu.createQuery((db) => db.selectFrom("cashuToken").selectAll()),
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
  const cashuTokenRows = useQuery(cashuTokensQuery);
  const nostrMessageRows = useQuery(nostrMessagesQuery);
  const transactionRows = useQuery(transactionsQuery);

  const tokenByReferenceId = React.useMemo(() => {
    const tokens = new Map<string, string>();
    for (const row of cashuTokenRows) {
      for (const candidate of [
        "token" in row ? row.token : null,
        "rawToken" in row ? row.rawToken : null,
      ]) {
        const token = readText(candidate);
        if (!token) continue;
        tokens.set(String(createCashuTokenId(token)), token);
      }
    }
    return tokens;
  }, [cashuTokenRows]);

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
    return buildTransactionHistory(
      transactionRows,
      evoluAppOwnerId,
      evoluTransactionsVisibleOwnerIds,
    );
  }, [evoluAppOwnerId, evoluTransactionsVisibleOwnerIds, transactionRows]);

  const declinedRequestIds = React.useMemo(
    () => deriveDeclinedRequestIds(nostrMessageRows),
    [nostrMessageRows],
  );
  const visibleTransactions = React.useMemo(
    () => transactions.slice(0, visibleCount),
    [transactions, visibleCount],
  );

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
      if (item.method === "cashu_emit" || item.phase === "swap") {
        return t("transactionCashuSwap");
      }
      return t("transactionCashuIssued");
    },
    [contactsById, t],
  );

  const dateFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );
  const formatDateText = React.useCallback(
    (createdAtSec: number): string =>
      dateFormatter.format(new Date(createdAtSec * 1000)),
    [dateFormatter],
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
    ): TransactionStatusPill | null => {
      if (
        requestStatus === "pending" ||
        item.status === "pending" ||
        item.pendingLabel === "pending"
      ) {
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
      const legacyUsedTokens = readStringArrayFromJson(
        details?.usedInputTokens,
      );
      const usedTokens = Array.from(
        new Set([
          ...legacyUsedTokens,
          ...readStringArrayFromJson(details?.usedTokenIds).flatMap((id) => {
            const token = tokenByReferenceId.get(id);
            return token ? [token] : [];
          }),
        ]),
      );
      const legacyGainedTokens = [
        readStringFromJson(details?.gainedToken),
        readStringFromJson(details?.acceptedToken),
      ].filter((value): value is string => value !== null);
      const gainedTokens = Array.from(
        new Set([
          ...legacyGainedTokens,
          ...readStringArrayFromJson(details?.gainedTokenIds).flatMap((id) => {
            const token = tokenByReferenceId.get(id);
            return token ? [token] : [];
          }),
        ]),
      );
      const fee =
        item.direction === "out"
          ? calculateTransactionHistoryFee({
              amount: item.amount,
              fallbackFee: item.fee,
              gainedTokens,
              usedTokens,
            })
          : null;
      const feeText = fee !== null ? formatAmountText(fee, item.unit) : "";
      const lightningInvoice = readStringFromJson(details?.lightningInvoice);
      const lightningMemo =
        readStringFromJson(details?.lightningMemo) ??
        (lightningInvoice
          ? (getLightningInvoicePreview(lightningInvoice)?.description ?? null)
          : null);
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
    [formatAmountText, t, tokenByReferenceId],
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
        <>
          <div className="transactions-list">
            {visibleTransactions.map((item) => (
              <TransactionCard
                buildDetailEntries={buildDetailEntries}
                buildProblemStatusPill={buildProblemStatusPill}
                buildTitle={buildTitle}
                contactsById={contactsById}
                copyText={copyText}
                formatAmountText={formatAmountText}
                formatDateText={formatDateText}
                getRequestStatus={getRequestStatus}
                isExpanded={expandedById[item.id] === true}
                item={item}
                key={item.id}
                nostrPictureByNpub={nostrPictureByNpub}
                onToggle={toggleExpanded}
                t={t}
                tokenByReferenceId={tokenByReferenceId}
              />
            ))}
          </div>
          {visibleCount < transactions.length ? (
            <div className="settings-row">
              <button
                type="button"
                className="btn-wide secondary"
                onClick={() =>
                  setVisibleCount((count) => count + TRANSACTION_PAGE_SIZE)
                }
              >
                {t("loadMore")}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
