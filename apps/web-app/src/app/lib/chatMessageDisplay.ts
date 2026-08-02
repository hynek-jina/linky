import { formatShortNpub, previewTokenText } from "../../utils/formatting";
import { normalizeNpubIdentifier } from "../../utils/nostrNpub";
import {
  parseCashuPaymentRequestMessage,
  parseLinkyPaymentRequestDeclineMessage,
} from "./paymentRequestMessage";
import {
  parsePrivateImageMessage,
  privateImagePreviewText,
} from "./privateImageMessage";
import { extractCashuTokenFromText } from "./tokenText";
import {
  getLinkyBankPaymentOfferInfo,
  type LinkyBankPaymentOfferStatus,
} from "./bankPaymentOffer";

const PREVIEW_NPUB_PATTERN =
  /(?:nostr:)?npub1[023456789acdefghjklmnpqrstuvwxyz]+(?:@npub\.cash)?/gi;
const PREVIEW_CASHU_PATTERN = /cashu[0-9A-Za-z_-]+={0,2}/gi;

const formatInlinePreviewEntities = (content: string): string => {
  const withShortNpubs = content.replace(PREVIEW_NPUB_PATTERN, (match) => {
    const normalized = normalizeNpubIdentifier(match);
    return normalized ? formatShortNpub(normalized) : match;
  });

  return withShortNpubs.replace(PREVIEW_CASHU_PATTERN, (match) => {
    const token = extractCashuTokenFromText(match);
    return previewTokenText(token) ?? match;
  });
};

interface FormatChatMessagePreviewArgs {
  content: string;
  direction?: "in" | "out" | null;
  formatDisplayedAmountText: (amountSat: number) => string;
  t: (key: string) => string;
}

const getBankPaymentOfferStatusPreviewKey = (
  status: LinkyBankPaymentOfferStatus,
): string => {
  switch (status) {
    case "accepted":
      return "bankPaymentOfferStatusAccepted";
    case "accepted_by_other":
      return "bankPaymentOfferStatusAcceptedByOther";
    case "bank_details_sent":
      return "bankPaymentOfferStatusBankDetailsSent";
    case "bank_paid":
      return "bankPaymentOfferStatusBankPaid";
    case "declined":
      return "bankPaymentOfferStatusDeclined";
    case "settled":
      return "bankPaymentOfferStatusSettled";
    case "canceled":
    case "offered":
      return "";
  }
};

export const formatChatMessagePreviewText = ({
  content,
  direction,
  formatDisplayedAmountText,
  t,
}: FormatChatMessagePreviewArgs): string => {
  if (parsePrivateImageMessage(content)) {
    return privateImagePreviewText(t);
  }

  const bankPaymentOffer = getLinkyBankPaymentOfferInfo(content);
  if (bankPaymentOffer) {
    if (bankPaymentOffer.status === "offered") {
      const key =
        direction === "out"
          ? "bankPaymentOfferPreviewOutgoing"
          : "bankPaymentOfferPreviewIncoming";
      return t(key).replace("{amount}", bankPaymentOffer.amountText);
    }
    if (bankPaymentOffer.status === "canceled") {
      return t("bankPaymentOfferPreviewCanceled");
    }

    const statusKey = getBankPaymentOfferStatusPreviewKey(
      bankPaymentOffer.status,
    );
    return `${t("bankPaymentOfferTitle")}: ${t(statusKey)}`;
  }

  const paymentRequest = parseCashuPaymentRequestMessage(content);
  if (paymentRequest) {
    const amountText = formatDisplayedAmountText(paymentRequest.amount);
    return direction === "out"
      ? t("paymentRequestPreviewOutgoing").replace("{amount}", amountText)
      : t("paymentRequestPreviewIncoming").replace("{amount}", amountText);
  }

  if (parseLinkyPaymentRequestDeclineMessage(content)) {
    return direction === "out"
      ? t("paymentRequestDeclinedPreviewOutgoing")
      : t("paymentRequestDeclinedPreviewIncoming");
  }

  return formatInlinePreviewEntities(content);
};
