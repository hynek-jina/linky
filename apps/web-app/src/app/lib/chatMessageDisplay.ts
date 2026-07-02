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

export const formatChatMessagePreviewText = ({
  content,
  direction,
  formatDisplayedAmountText,
  t,
}: FormatChatMessagePreviewArgs): string => {
  if (parsePrivateImageMessage(content)) {
    return privateImagePreviewText(t);
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
