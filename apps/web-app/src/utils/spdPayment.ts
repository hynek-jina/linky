export interface SpdPayment {
  fields: Record<string, string>;
  payload: string;
}

const SPAYD_FILENAME = "platba.spayd";
const SPAYD_MIME_TYPE = "application/x-shortpaymentdescriptor";

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

  return { payload, fields };
};

export const tryParseSpdPayment = (input: string): SpdPayment | null => {
  try {
    return parseSpdPayment(input);
  } catch {
    return null;
  }
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
  if (/Android/i.test(navigator.userAgent)) {
    await openSpdPaymentOnAndroid(spdPayload);
    return;
  }

  await openSpdPaymentOniOS(spdPayload);
};
