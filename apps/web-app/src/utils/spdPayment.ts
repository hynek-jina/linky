export interface SpdPayment {
  fields: Record<string, string>;
  payload: string;
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
