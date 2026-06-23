import React from "react";
import { isNativePlatform } from "../platform/runtime";

interface LinkPreview {
  description: string | null;
  faviconUrl: string | null;
  imageUrl: string | null;
  siteName: string;
  title: string;
  url: string;
}

interface LinkPreviewCardProps {
  url: string;
}

const HOSTED_APP_ORIGIN = "https://app.linky.fit";
const previewCache = new Map<string, LinkPreview | null>();
const previewRequests = new Map<string, Promise<LinkPreview | null>>();

const isUnknownRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const nullableString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const parseLinkPreview = (value: unknown): LinkPreview | null => {
  if (!isUnknownRecord(value)) return null;
  const title = nullableString(value.title);
  const siteName = nullableString(value.siteName);
  const url = nullableString(value.url);
  if (!title || !siteName || !url) return null;
  return {
    description: nullableString(value.description),
    faviconUrl: nullableString(value.faviconUrl),
    imageUrl: nullableString(value.imageUrl),
    siteName,
    title,
    url,
  };
};

const getPreviewEndpoint = (url: string): string => {
  const path = `/api/link-preview?url=${encodeURIComponent(url)}`;
  return isNativePlatform() ? `${HOSTED_APP_ORIGIN}${path}` : path;
};

const loadLinkPreview = (url: string): Promise<LinkPreview | null> => {
  if (previewCache.has(url)) {
    return Promise.resolve(previewCache.get(url) ?? null);
  }
  const existing = previewRequests.get(url);
  if (existing) return existing;

  const request = fetch(getPreviewEndpoint(url), {
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) return null;
      return parseLinkPreview(await response.json());
    })
    .catch(() => null)
    .then((preview) => {
      previewCache.set(url, preview);
      previewRequests.delete(url);
      return preview;
    });
  previewRequests.set(url, request);
  return request;
};

export function LinkPreviewCard({ url }: LinkPreviewCardProps) {
  const cardRef = React.useRef<HTMLAnchorElement | null>(null);
  const [shouldLoad, setShouldLoad] = React.useState(
    previewCache.has(url) || typeof IntersectionObserver === "undefined",
  );
  const [preview, setPreview] = React.useState<LinkPreview | null>(
    previewCache.get(url) ?? null,
  );

  React.useEffect(() => {
    if (shouldLoad || typeof IntersectionObserver === "undefined") return;
    const element = cardRef.current;
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
    let active = true;
    void loadLinkPreview(url).then((nextPreview) => {
      if (active) setPreview(nextPreview);
    });
    return () => {
      active = false;
    };
  }, [shouldLoad, url]);

  if (!preview) {
    return shouldLoad ? null : (
      <a
        ref={cardRef}
        className="chat-link-preview chat-link-preview-placeholder"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-hidden="true"
        tabIndex={-1}
      />
    );
  }

  return (
    <a
      ref={cardRef}
      className="chat-link-preview"
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {preview.imageUrl ? (
        <img
          className="chat-link-preview-image"
          src={preview.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <span className="chat-link-preview-body">
        <span className="chat-link-preview-site">
          {preview.faviconUrl ? (
            <img
              className="chat-link-preview-favicon"
              src={preview.faviconUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : null}
          {preview.siteName}
        </span>
        <strong className="chat-link-preview-title">{preview.title}</strong>
        {preview.description ? (
          <span className="chat-link-preview-description">
            {preview.description}
          </span>
        ) : null}
      </span>
    </a>
  );
}
