import {
  parseCashuPaymentRequestMessage,
  parseLinkyPaymentRequestDeclineMessage,
} from "./paymentRequestMessage";

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

  return content;
};
