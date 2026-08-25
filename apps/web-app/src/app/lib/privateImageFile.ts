import { reportInspectorRows } from "../../devtools/inspector";
import { getInspectorEmissionEnabled } from "../../devtools/inspector/inspectorEnabled";

const EXTENSION_BY_IMAGE_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface PrivateImageExportLinks {
  rumor?: string;
}

const toPrivateImageFile = (blob: Blob): File => {
  const type = blob.type || "image/jpeg";
  const extension = EXTENSION_BY_IMAGE_TYPE[type] ?? "jpg";
  return new File([blob], `linky-image.${extension}`, { type });
};

const reportPrivateImageExport = (
  tag: string,
  summary: string,
  file: File,
  links: PrivateImageExportLinks,
  error?: unknown,
): void => {
  if (!getInspectorEmissionEnabled()) return;
  reportInspectorRows([
    {
      at: Date.now(),
      channel: "app.log",
      tag,
      summary,
      links: links.rumor ? { rumor: links.rumor } : {},
      payload: {
        fileName: file.name,
        fileType: file.type,
        size: file.size,
        ...(error !== undefined ? { error } : {}),
      },
    },
  ]);
};

export const isCancelledShareError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;

  const name =
    "name" in error && typeof error.name === "string" ? error.name : "";
  if (name === "AbortError") return true;

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  return /cancel|abort|dismiss/i.test(message);
};

export const downloadPrivateImageBlob = (
  blob: Blob,
  links: PrivateImageExportLinks = {},
): void => {
  const file = toPrivateImageFile(blob);
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  reportPrivateImageExport(
    "ChatImageSaved",
    "Chat image saved as a file",
    file,
    links,
  );
};

export const canSharePrivateImage = (): boolean =>
  typeof navigator.share === "function";

export const sharePrivateImageBlob = async (
  blob: Blob,
  title: string,
  links: PrivateImageExportLinks = {},
): Promise<void> => {
  if (!canSharePrivateImage()) {
    throw new Error("share-unavailable");
  }

  const file = toPrivateImageFile(blob);
  const shareData: ShareData = {
    files: [file],
    title,
  };

  if (
    typeof navigator.canShare === "function" &&
    !navigator.canShare(shareData)
  ) {
    throw new Error("share-unavailable");
  }

  try {
    await navigator.share(shareData);
  } catch (error) {
    if (!isCancelledShareError(error)) {
      reportPrivateImageExport(
        "ChatImageShareFailed",
        "System share of a chat image failed",
        file,
        links,
        error,
      );
    }
    throw error;
  }

  reportPrivateImageExport(
    "ChatImageShared",
    "Chat image shared via the system share sheet",
    file,
    links,
  );
};
