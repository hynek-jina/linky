export const STILL_IMAGE_QR_SCAN_EVENT = "linky-still-image-qr-scan";

export const requestStillImageQrScan = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(STILL_IMAGE_QR_SCAN_EVENT));
};
