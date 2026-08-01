import { decode as decodePayBySquare, PaymentOptions } from "bysquare/pay";

export type BankPaymentFormat = "bysquare" | "epc" | "spd";

export interface BankPayment {
  fields: Record<string, string>;
  format: BankPaymentFormat;
  payload: string;
}

export interface SpdPayment extends BankPayment {
  format: "spd";
}

const SPAYD_FILENAME = "platba.spayd";
const SPD_QR_JPEG_FILENAME = "platba.jpg";
const SPAYD_MIME_TYPE = "application/x-shortpaymentdescriptor";
const SPD_QR_JPEG_MIME_TYPE = "image/jpeg";

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const isSpdPaymentPayload = (input: string): boolean =>
  String(input ?? "")
    .trim()
    .startsWith("SPD*");

export const parseSpdPayment = (input: string): SpdPayment => {
  const payload = String(input ?? "").trim();
  const parts = payload.split("*").filter(Boolean);

  if (parts[0] !== "SPD") {
    throw new Error("spd-not-spd");
  }

  const fields: Record<string, string> = {};
  for (const part of parts.slice(2)) {
    const index = part.indexOf(":");
    if (index < 1) continue;

    const key = part.slice(0, index).toUpperCase();
    const value = safeDecodeURIComponent(part.slice(index + 1));
    fields[key] = value;
  }

  if (!String(fields["ACC"] ?? "").trim()) {
    throw new Error("spd-missing-account");
  }

  return { payload, fields, format: "spd" };
};

export const tryParseSpdPayment = (input: string): SpdPayment | null => {
  try {
    return parseSpdPayment(input);
  } catch {
    return null;
  }
};

const createBankPayment = (args: {
  fields: Record<string, number | string | null | undefined>;
  format: Exclude<BankPaymentFormat, "spd">;
  payload: string;
}): BankPayment => {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(args.fields)) {
    const normalized = String(value ?? "").trim();
    if (normalized) fields[key] = normalized;
  }

  if (!String(fields["ACC"] ?? "").trim()) {
    throw new Error("spd-missing-account");
  }

  return { fields, format: args.format, payload: args.payload };
};

const parseEpcPayment = (input: string): BankPayment => {
  const payload = String(input ?? "").trim();
  const lines = payload.replace(/\r\n/g, "\n").split("\n");
  if (
    lines[0] !== "BCD" ||
    (lines[1] !== "001" && lines[1] !== "002") ||
    lines[3] !== "SCT"
  ) {
    throw new Error("bank-payment-invalid-epc");
  }

  const account = String(lines[6] ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(account)) {
    throw new Error("spd-missing-account");
  }

  const amountAndCurrency = String(lines[7] ?? "")
    .trim()
    .toUpperCase();
  const amountMatch = /^EUR(\d+(?:\.\d{1,2})?)?$/.exec(amountAndCurrency);
  if (!amountMatch) throw new Error("bank-payment-invalid-epc-amount");

  return createBankPayment({
    fields: {
      ACC: account,
      AM: amountMatch[1],
      BIC: lines[4],
      CC: "EUR",
      MSG: lines[10],
      RF: lines[9],
      RN: lines[5],
    },
    format: "epc",
    payload,
  });
};

const BYSQUARE_PAYLOAD_PATTERN = /^[0-9A-V]{16,4096}$/;

const parsePayBySquarePayment = (input: string): BankPayment => {
  const payload = String(input ?? "").trim();
  if (!BYSQUARE_PAYLOAD_PATTERN.test(payload)) {
    throw new Error("bank-payment-invalid-bysquare");
  }

  const model = decodePayBySquare(payload);
  const payment = model.payments[0];
  if (!payment || payment.type !== PaymentOptions.PaymentOrder) {
    throw new Error("bank-payment-unsupported-bysquare-type");
  }

  const account = payment.bankAccounts[0];
  return createBankPayment({
    fields: {
      ACC: account?.iban,
      AM: payment.amount,
      BIC: account?.bic,
      CC: payment.currencyCode,
      DT: payment.paymentDueDate,
      MSG: payment.paymentNote,
      RF: payment.originatorsReferenceInformation,
      RN: payment.beneficiary.name,
      "X-KS": payment.constantSymbol,
      "X-SS": payment.specificSymbol,
      "X-VS": payment.variableSymbol,
    },
    format: "bysquare",
    payload,
  });
};

export const parseBankPayment = (input: string): BankPayment => {
  const payload = String(input ?? "").trim();
  if (isSpdPaymentPayload(payload)) return parseSpdPayment(payload);
  if (payload.replace(/\r\n/g, "\n").startsWith("BCD\n")) {
    return parseEpcPayment(payload);
  }
  if (BYSQUARE_PAYLOAD_PATTERN.test(payload)) {
    return parsePayBySquarePayment(payload);
  }
  throw new Error("bank-payment-unsupported");
};

export const tryParseBankPayment = (input: string): BankPayment | null => {
  try {
    return parseBankPayment(input);
  } catch {
    return null;
  }
};

export const isBankPaymentPayload = (input: string): boolean => {
  const payload = String(input ?? "").trim();
  if (isSpdPaymentPayload(payload)) return true;
  if (payload.replace(/\r\n/g, "\n").startsWith("BCD\n")) return true;
  return (
    BYSQUARE_PAYLOAD_PATTERN.test(payload) &&
    tryParseBankPayment(payload) !== null
  );
};

export type BankPaymentOfferCurrency = "CZK" | "EUR";

export const getBankPaymentOfferCurrency = (
  input: string,
): BankPaymentOfferCurrency | null => {
  const currency = String(
    tryParseBankPayment(input)?.fields["CC"] ?? "",
  ).toUpperCase();
  return currency === "CZK" || currency === "EUR" ? currency : null;
};

const openSpdPaymentOniOS = async (spdPayload: string): Promise<void> => {
  const file = new File([spdPayload], SPAYD_FILENAME, {
    type: SPAYD_MIME_TYPE,
  });
  const shareData: ShareData = {
    files: [file],
    title: "QR platba",
  };

  if (!navigator.share || !navigator.canShare?.(shareData)) {
    throw new Error("spd-share-unavailable");
  }

  await navigator.share(shareData);
};

const openSpdPaymentOnAndroid = async (spdPayload: string): Promise<void> => {
  if (!navigator.serviceWorker) {
    throw new Error("spd-service-worker-unavailable");
  }

  await navigator.serviceWorker.ready;

  const params = new URLSearchParams({
    data: spdPayload,
    disposition: "inline",
    filename: SPAYD_FILENAME,
    type: SPAYD_MIME_TYPE,
  });
  const url = new URL("platba.spayd", window.location.href);
  url.search = params.toString();

  window.location.assign(url.toString());
};

export const openSpdPaymentInBank = async (
  spdPayload: string,
): Promise<void> => {
  const payment = parseBankPayment(spdPayload);
  if (payment.format !== "spd") {
    await shareSpdPaymentQrJpeg(payment.payload);
    return;
  }

  if (/Android/i.test(navigator.userAgent)) {
    await openSpdPaymentOnAndroid(payment.payload);
    return;
  }

  await openSpdPaymentOniOS(payment.payload);
};

const canvasToJpegBlob = async (canvas: HTMLCanvasElement): Promise<Blob> => {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, SPD_QR_JPEG_MIME_TYPE, 0.95);
  });

  if (!blob) {
    throw new Error("spd-qr-share-failed");
  }

  return blob;
};

export const shareSpdPaymentQrJpeg = async (
  spdPayload: string,
): Promise<void> => {
  if (typeof navigator.share !== "function") {
    throw new Error("spd-share-unavailable");
  }

  const QRCode = await import("qrcode");
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, spdPayload, {
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
    errorCorrectionLevel: "M",
    margin: 2,
    width: 1024,
  });

  const blob = await canvasToJpegBlob(canvas);
  const file = new File([blob], SPD_QR_JPEG_FILENAME, {
    type: SPD_QR_JPEG_MIME_TYPE,
  });
  const shareData: ShareData = {
    files: [file],
    title: "QR platba",
  };

  if (
    typeof navigator.canShare === "function" &&
    !navigator.canShare(shareData)
  ) {
    throw new Error("spd-share-unavailable");
  }

  await navigator.share(shareData);
};
