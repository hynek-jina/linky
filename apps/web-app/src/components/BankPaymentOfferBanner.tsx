import React from "react";
import {
  getLinkyBankPaymentOfferInfo,
  getLinkyBankPaymentOfferStatusRank,
  isLinkyBankPaymentOfferExpired,
  isLinkyBankPaymentOfferTerminalStatus,
  type LinkyBankPaymentOfferInfo,
} from "../app/lib/bankPaymentOffer";
import type { ContactRowLike, LocalNostrMessage } from "../app/types/appTypes";
import { navigateTo } from "../hooks/useRouting";
import { getInitials } from "../utils/formatting";
import { normalizeNpubIdentifier } from "../utils/nostrNpub";

interface BankPaymentOfferBannerProps {
  contacts: readonly ContactRowLike[];
  formatDisplayedAmountText: (amountSat: number) => string;
  messages: readonly LocalNostrMessage[];
  myPubkeyHex: string | null;
  nostrPictureByNpub: Readonly<Record<string, string | null>>;
  t: (key: string) => string;
}

interface OfferEntry {
  info: LinkyBankPaymentOfferInfo;
  message: LocalNostrMessage;
}

interface ActiveOffer {
  entry: OfferEntry;
  isCreatedByMe: boolean;
}

const getEntryTime = (entry: OfferEntry): number =>
  entry.info.statusUpdatedAtSec || Number(entry.message.createdAtSec ?? 0) || 0;

const isNewerEntry = (candidate: OfferEntry, current: OfferEntry): boolean => {
  const rankDelta =
    getLinkyBankPaymentOfferStatusRank(candidate.info.status) -
    getLinkyBankPaymentOfferStatusRank(current.info.status);
  return (
    rankDelta > 0 ||
    (rankDelta === 0 && getEntryTime(candidate) > getEntryTime(current))
  );
};

const findActiveOffer = (
  messages: readonly LocalNostrMessage[],
  myPubkeyHex: string | null,
): ActiveOffer | null => {
  const groups = new Map<string, Map<string, OfferEntry>>();

  for (const message of messages) {
    const info = getLinkyBankPaymentOfferInfo(String(message.content ?? ""));
    if (!info) continue;

    const contactId = String(message.contactId ?? "").trim();
    if (!contactId) continue;
    const byContact = groups.get(info.offerId) ?? new Map<string, OfferEntry>();
    const entry = { info, message };
    const current = byContact.get(contactId);
    if (!current || isNewerEntry(entry, current))
      byContact.set(contactId, entry);
    groups.set(info.offerId, byContact);
  }

  let active: ActiveOffer | null = null;
  for (const byContact of groups.values()) {
    const entries = [...byContact.values()];
    if (entries.length === 0) continue;
    if (
      entries.some(
        ({ info }) => info.status === "canceled" || info.status === "settled",
      )
    ) {
      continue;
    }

    const nonTerminal = entries.filter(
      ({ info }) => !isLinkyBankPaymentOfferTerminalStatus(info.status),
    );
    if (nonTerminal.length === 0) continue;

    const entry = nonTerminal.sort((left, right) => {
      const statusDelta =
        getLinkyBankPaymentOfferStatusRank(right.info.status) -
        getLinkyBankPaymentOfferStatusRank(left.info.status);
      return statusDelta || getEntryTime(right) - getEntryTime(left);
    })[0];
    if (!entry) continue;
    if (
      isLinkyBankPaymentOfferExpired(
        entry.info,
        Number(entry.message.createdAtSec ?? 0),
        Math.floor(Date.now() / 1_000),
      )
    ) {
      continue;
    }

    const candidate = {
      entry,
      isCreatedByMe:
        String(entry.info.offererPublicKey ?? "").trim() ===
          String(myPubkeyHex ?? "").trim() || entry.message.direction === "out",
    };
    if (!active || getEntryTime(candidate.entry) > getEntryTime(active.entry)) {
      active = candidate;
    }
  }

  return active;
};

export const BankPaymentOfferBanner: React.FC<BankPaymentOfferBannerProps> = ({
  contacts,
  formatDisplayedAmountText,
  messages,
  myPubkeyHex,
  nostrPictureByNpub,
  t,
}) => {
  const active = React.useMemo(
    () => findActiveOffer(messages, myPubkeyHex),
    [messages, myPubkeyHex],
  );

  if (!active) return null;

  const { entry, isCreatedByMe } = active;
  const contact = contacts.find(
    (candidate) =>
      String(candidate.id ?? "").trim() ===
      String(entry.message.contactId ?? "").trim(),
  );
  const contactName =
    String(contact?.name ?? "").trim() || t("unknownContactTitle");
  const contactNpub = normalizeNpubIdentifier(contact?.npub);
  const contactPicture = contactNpub
    ? (nostrPictureByNpub[contactNpub] ?? null)
    : null;
  const amount = entry.info.amountSat
    ? formatDisplayedAmountText(entry.info.amountSat)
    : entry.info.amountText;
  const isAccepted =
    entry.info.status === "accepted" ||
    entry.info.status === "bank_details_sent" ||
    entry.info.status === "bank_paid";
  const bannerText = (
    isCreatedByMe
      ? isAccepted
        ? t("bankPaymentOfferBannerAcceptedBy")
        : t("bankPaymentOfferBannerOutgoing")
      : t("bankPaymentOfferBannerIncoming")
  )
    .replace("{name}", contactName)
    .replace("{amount}", amount);
  const openDetail = () => {
    navigateTo({
      route: "bankPaymentOffer",
      chatId: entry.message.contactId,
      offerId: entry.info.offerId,
    });
  };
  return (
    <aside className="bank-payment-offer-banner" aria-live="polite">
      <button
        type="button"
        className="bank-payment-offer-banner-copy"
        onClick={openDetail}
      >
        {!isCreatedByMe || isAccepted ? (
          <span className="bank-payment-offer-banner-avatar" aria-hidden="true">
            {contactPicture ? (
              <img
                src={contactPicture}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span>{getInitials(contactName)}</span>
            )}
          </span>
        ) : null}
        <span className="bank-payment-offer-banner-content">
          <span className="bank-payment-offer-banner-text">{bannerText}</span>
        </span>
      </button>
    </aside>
  );
};
