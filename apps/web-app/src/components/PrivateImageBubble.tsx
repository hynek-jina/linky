import { Download } from "lucide-react";
import React from "react";
import {
  decryptPrivateImageMessage,
  type PrivateImageMessagePayload,
} from "../app/lib/privateImageMessage";
import { ShareIcon } from "./icons";

interface PrivateImageBubbleProps {
  payload: PrivateImageMessagePayload;
  t: (key: string) => string;
}

const PRIVATE_IMAGE_FILENAME = "linky-obrazek.jpg";

const isCancelledShareError = (error: unknown): boolean => {
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

const downloadPrivateImageBlob = (blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = PRIVATE_IMAGE_FILENAME;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const sharePrivateImageBlob = async (
  blob: Blob,
  title: string,
): Promise<void> => {
  if (typeof navigator.share !== "function") {
    throw new Error("share-unavailable");
  }

  const file = new File([blob], PRIVATE_IMAGE_FILENAME, {
    type: blob.type || "image/jpeg",
  });
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

  await navigator.share(shareData);
};

export function PrivateImageBubble({ payload, t }: PrivateImageBubbleProps) {
  const placeholderRef = React.useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = React.useState(
    typeof IntersectionObserver === "undefined",
  );
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [imageBlob, setImageBlob] = React.useState<Blob | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [viewerErrorText, setViewerErrorText] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    if (shouldLoad || typeof IntersectionObserver === "undefined") return;
    const element = placeholderRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "240px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldLoad]);

  React.useEffect(() => {
    if (!shouldLoad) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    setImageUrl(null);
    setImageBlob(null);
    setFailed(false);
    setViewerOpen(false);
    setViewerErrorText(null);

    void decryptPrivateImageMessage(payload)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImageBlob(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [payload, shouldLoad]);

  React.useEffect(() => {
    if (!viewerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setViewerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewerOpen]);

  const openViewer = () => {
    setViewerErrorText(null);
    setViewerOpen(true);
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerErrorText(null);
  };

  const saveImage = () => {
    if (!imageBlob) return;
    downloadPrivateImageBlob(imageBlob);
  };

  const shareImage = async () => {
    if (!imageBlob) return;

    setViewerErrorText(null);
    try {
      await sharePrivateImageBlob(imageBlob, t("chatImageMessage"));
    } catch (error) {
      if (isCancelledShareError(error)) return;
      setViewerErrorText(t("shareUnavailable"));
    }
  };

  if (failed) {
    return (
      <div className="chat-private-image-placeholder is-error">
        {t("chatImageLoadFailed")}
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div
        ref={placeholderRef}
        className="chat-private-image-placeholder"
        style={{ aspectRatio: `${payload.width} / ${payload.height}` }}
      >
        {shouldLoad ? (
          <>
            <span className="btn-spinner" aria-hidden="true" />
            <span>{t("chatImageDecrypting")}</span>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="chat-private-image-button"
        onClick={openViewer}
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={t("chatImageOpen")}
      >
        <img
          className="chat-private-image"
          src={imageUrl}
          alt={t("chatImageMessage")}
          width={payload.width}
          height={payload.height}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </button>

      {viewerOpen && imageBlob ? (
        <div
          className="chat-image-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={t("chatImageMessage")}
          onClick={closeViewer}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            className="chat-image-viewer-toolbar"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="topbar-btn chat-image-viewer-back"
              onClick={closeViewer}
              aria-label={t("chatImageBackToChat")}
              title={t("chatImageBackToChat")}
            >
              <span aria-hidden="true">&lt;</span>
            </button>
          </div>

          <div className="chat-image-viewer-stage">
            <img
              className="chat-image-viewer-image"
              src={imageUrl}
              alt={t("chatImageMessage")}
              width={payload.width}
              height={payload.height}
              decoding="async"
              referrerPolicy="no-referrer"
              onClick={(event) => event.stopPropagation()}
            />
          </div>

          <div
            className="chat-image-viewer-footer"
            onClick={(event) => event.stopPropagation()}
          >
            {viewerErrorText ? (
              <div className="chat-image-viewer-error" role="status">
                {viewerErrorText}
              </div>
            ) : null}
            <div className="chat-image-viewer-actions">
              <button
                type="button"
                className="chat-image-viewer-action"
                onClick={(event) => {
                  event.stopPropagation();
                  saveImage();
                }}
              >
                <span className="btn-label-with-icon">
                  <span className="btn-label-icon" aria-hidden="true">
                    <Download size={20} />
                  </span>
                  <span>{t("chatImageSave")}</span>
                </span>
              </button>
              <button
                type="button"
                className="chat-image-viewer-action"
                onClick={(event) => {
                  event.stopPropagation();
                  void shareImage();
                }}
              >
                <span className="btn-label-with-icon">
                  <span className="btn-label-icon" aria-hidden="true">
                    <ShareIcon size={20} />
                  </span>
                  <span>{t("share")}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
