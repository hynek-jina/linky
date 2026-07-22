import { sha256 } from "@noble/hashes/sha2.js";
import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import { finalizeEvent } from "nostr-tools";

const PRIVATE_IMAGE_MESSAGE_TYPE = "linky.private_image.v1";
const PRIVATE_IMAGE_COMPACT_PREFIX = "linky:image:v1:";
const BLOSSOM_UPLOAD_SERVERS = ["https://blossom.primal.net"];
const MAX_IMAGE_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_SIDE_PX = 1600;
const IMAGE_JPEG_QUALITY = 0.84;

export interface PrivateImageMessagePayload {
  encryptedSha256: string;
  encryptedSize: number;
  encryptionAlgorithm: "aes-gcm";
  fileType: string;
  height: number;
  key: string;
  nonce: string;
  originalSha256: string;
  type: "linky.private_image.v1";
  url: string;
  width: number;
}

interface CompactPrivateImageMessagePayload {
  a: "g";
  h: number;
  k: string;
  m: string;
  n: string;
  o: string;
  s: number;
  t: "i1";
  u: string;
  w: number;
  x: string;
}

interface PreparedPrivateImage {
  encryptedBytes: Uint8Array;
  encryptedSha256: string;
  encryptedSize: number;
  fileType: string;
  height: number;
  key: string;
  nonce: string;
  originalSha256: string;
  width: number;
}

interface UploadDescriptor {
  sha256: string;
  url: string;
}

interface BlossomUploadAuth {
  privateKey: Uint8Array;
  pubkey: string;
}

export interface PrivateImageSendResult {
  content: string;
  eventContent: string;
  tags: string[][];
}

const textEncoder = new TextEncoder();

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const hexToBytes = (hex: string): Uint8Array | null => {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized)) return null;
  if (normalized.length % 2 !== 0) return null;

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    const value = Number.parseInt(
      normalized.slice(index * 2, index * 2 + 2),
      16,
    );
    if (!Number.isFinite(value)) return null;
    bytes[index] = value;
  }
  return bytes;
};

const sha256Hex = (bytes: Uint8Array): string => bytesToHex(sha256(bytes));

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const base64UrlToText = (value: string): string | null => {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    return atob(`${normalized}${padding}`);
  } catch {
    return null;
  }
};

const textToBase64Url = (value: string): string =>
  bytesToBase64Url(textEncoder.encode(value));

const randomHex = (byteLength: number): string => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
};

const copyToArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

const readTagValue = (
  tags: readonly string[][],
  tagName: string,
): string | null => {
  for (const tag of tags) {
    if (!Array.isArray(tag)) continue;
    if (tag[0] !== tagName) continue;
    const value = String(tag[1] ?? "").trim();
    if (value) return value;
  }
  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const readPositiveInteger = (value: unknown): number | null => {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
};

const loadImage = async (file: File): Promise<HTMLImageElement> => {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("image-load-failed"));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const canvasToBlob = async (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> =>
  await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("image-encode-failed"));
      },
      type,
      quality,
    );
  });

const resizeImageToJpegBytes = async (
  file: File,
): Promise<{ bytes: Uint8Array; height: number; width: number }> => {
  if (!file.type.startsWith("image/")) {
    throw new Error("chat-image-unsupported");
  }
  if (file.size > MAX_IMAGE_SOURCE_BYTES) {
    throw new Error("chat-image-too-large");
  }

  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error("chat-image-invalid");

  const scale = Math.min(
    1,
    MAX_IMAGE_SIDE_PX / Math.max(sourceWidth, sourceHeight),
  );
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("chat-image-canvas-unavailable");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, "image/jpeg", IMAGE_JPEG_QUALITY);
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    height,
    width,
  };
};

const encryptImageBytes = async (file: File): Promise<PreparedPrivateImage> => {
  const resized = await resizeImageToJpegBytes(file);
  const key = randomHex(32);
  const nonce = randomHex(12);
  const keyBytes = hexToBytes(key);
  const nonceBytes = hexToBytes(nonce);
  if (!keyBytes || !nonceBytes) throw new Error("chat-image-encryption-failed");

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    copyToArrayBuffer(keyBytes),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: copyToArrayBuffer(nonceBytes) },
    cryptoKey,
    copyToArrayBuffer(resized.bytes),
  );
  const encryptedBytes = new Uint8Array(encryptedBuffer);

  return {
    encryptedBytes,
    encryptedSha256: sha256Hex(encryptedBytes),
    encryptedSize: encryptedBytes.byteLength,
    fileType: "image/jpeg",
    height: resized.height,
    key,
    nonce,
    originalSha256: sha256Hex(resized.bytes),
    width: resized.width,
  };
};

const uploadToBlossom = async (
  prepared: PreparedPrivateImage,
  auth: BlossomUploadAuth,
): Promise<UploadDescriptor> => {
  let lastError: unknown = null;

  for (const server of BLOSSOM_UPLOAD_SERVERS) {
    try {
      const baseUrl = server.replace(/\/+$/, "");
      const serverDomain = new URL(baseUrl).hostname.toLowerCase();
      const authEvent = {
        kind: 24242,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: auth.pubkey,
        tags: [
          ["t", "upload"],
          ["expiration", String(Math.floor(Date.now() / 1000) + 10 * 60)],
          ["x", prepared.encryptedSha256],
          ["server", serverDomain],
        ],
        content: "Upload Blob",
      } satisfies UnsignedEvent;
      const signedAuthEvent = finalizeEvent(authEvent, auth.privateKey);
      const authHeader = `Nostr ${bytesToBase64Url(
        textEncoder.encode(JSON.stringify(signedAuthEvent)),
      )}`;

      const response = await fetch(`${baseUrl}/upload`, {
        method: "PUT",
        headers: {
          Authorization: authHeader,
        },
        // The signed Blossom authorization already scopes the upload to this
        // hash. Keeping the body untyped also keeps mobile Safari/WebView's
        // CORS preflight to the explicitly allowed Authorization header.
        body: copyToArrayBuffer(prepared.encryptedBytes),
      });

      if (!response.ok) {
        throw new Error(`upload-failed:${response.status}`);
      }

      const json = await response.json();
      if (!isRecord(json)) throw new Error("upload-invalid-response");

      const url = readString(json.url);
      const sha = readString(json.sha256);
      if (!url || !sha) throw new Error("upload-invalid-response");
      if (sha.toLowerCase() !== prepared.encryptedSha256) {
        throw new Error("upload-hash-mismatch");
      }
      return { sha256: sha.toLowerCase(), url };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("upload-failed");
};

export const buildPrivateImageEventTags = (
  payload: PrivateImageMessagePayload,
): string[][] => [
  ["file-type", payload.fileType],
  ["encryption-algorithm", payload.encryptionAlgorithm],
  ["decryption-key", payload.key],
  ["decryption-nonce", payload.nonce],
  ["x", payload.encryptedSha256],
  ["ox", payload.originalSha256],
  ["size", String(payload.encryptedSize)],
  ["dim", `${payload.width}x${payload.height}`],
];

export const serializePrivateImageMessage = (
  payload: PrivateImageMessagePayload,
): string => {
  const compact: CompactPrivateImageMessagePayload = {
    a: "g",
    h: payload.height,
    k: payload.key,
    m: payload.fileType,
    n: payload.nonce,
    o: payload.originalSha256,
    s: payload.encryptedSize,
    t: "i1",
    u: payload.url,
    w: payload.width,
    x: payload.encryptedSha256,
  };
  return `${PRIVATE_IMAGE_COMPACT_PREFIX}${textToBase64Url(
    JSON.stringify(compact),
  )}`;
};

export const createPrivateImageSendPayload = async (
  file: File,
  auth: BlossomUploadAuth,
): Promise<PrivateImageSendResult> => {
  const prepared = await encryptImageBytes(file);
  const upload = await uploadToBlossom(prepared, auth);
  if (upload.sha256 !== prepared.encryptedSha256) {
    throw new Error("upload-hash-mismatch");
  }

  const payload: PrivateImageMessagePayload = {
    encryptedSha256: prepared.encryptedSha256,
    encryptedSize: prepared.encryptedSize,
    encryptionAlgorithm: "aes-gcm",
    fileType: prepared.fileType,
    height: prepared.height,
    key: prepared.key,
    nonce: prepared.nonce,
    originalSha256: prepared.originalSha256,
    type: PRIVATE_IMAGE_MESSAGE_TYPE,
    url: upload.url,
    width: prepared.width,
  };

  return {
    content: serializePrivateImageMessage(payload),
    eventContent: payload.url,
    tags: buildPrivateImageEventTags(payload),
  };
};

const parsePrivateImageRecord = (
  parsed: Record<string, unknown>,
): PrivateImageMessagePayload | null => {
  const isCompact = parsed.t === "i1";
  if (!isCompact && parsed.type !== PRIVATE_IMAGE_MESSAGE_TYPE) return null;

  const url = readString(isCompact ? parsed.u : parsed.url);
  const fileType = readString(isCompact ? parsed.m : parsed.fileType);
  const encryptionAlgorithm = isCompact
    ? parsed.a === "g"
      ? "aes-gcm"
      : null
    : readString(parsed.encryptionAlgorithm);
  const key = readString(isCompact ? parsed.k : parsed.key);
  const nonce = readString(isCompact ? parsed.n : parsed.nonce);
  const encryptedSha256 = readString(
    isCompact ? parsed.x : parsed.encryptedSha256,
  );
  const originalSha256 = readString(
    isCompact ? parsed.o : parsed.originalSha256,
  );
  const encryptedSize = readPositiveInteger(
    isCompact ? parsed.s : parsed.encryptedSize,
  );
  const width = readPositiveInteger(isCompact ? parsed.w : parsed.width);
  const height = readPositiveInteger(isCompact ? parsed.h : parsed.height);

  if (
    !url ||
    !fileType ||
    encryptionAlgorithm !== "aes-gcm" ||
    !key ||
    !nonce ||
    !encryptedSha256 ||
    !originalSha256 ||
    !encryptedSize ||
    !width ||
    !height
  ) {
    return null;
  }

  return {
    encryptedSha256: encryptedSha256.toLowerCase(),
    encryptedSize,
    encryptionAlgorithm,
    fileType,
    height,
    key: key.toLowerCase(),
    nonce: nonce.toLowerCase(),
    originalSha256: originalSha256.toLowerCase(),
    type: PRIVATE_IMAGE_MESSAGE_TYPE,
    url,
    width,
  };
};

export const parsePrivateImageMessage = (
  content: unknown,
): PrivateImageMessagePayload | null => {
  const text = readString(content);
  if (!text) return null;

  if (text.startsWith(PRIVATE_IMAGE_COMPACT_PREFIX)) {
    const encoded = text.slice(PRIVATE_IMAGE_COMPACT_PREFIX.length);
    const jsonText = base64UrlToText(encoded);
    if (!jsonText) return null;
    let compactParsed: unknown;
    try {
      compactParsed = JSON.parse(jsonText);
    } catch {
      return null;
    }
    if (!isRecord(compactParsed)) return null;
    return parsePrivateImageRecord(compactParsed);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  return parsePrivateImageRecord(parsed);
};

export const privateImageMessageFromEvent = (
  event: Pick<NostrToolsEvent, "content" | "kind" | "tags">,
): string | null => {
  if (event.kind !== 15) return null;
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const url = readString(event.content);
  const fileType = readTagValue(tags, "file-type");
  const encryptionAlgorithm = readTagValue(tags, "encryption-algorithm");
  const key = readTagValue(tags, "decryption-key");
  const nonce = readTagValue(tags, "decryption-nonce");
  const encryptedSha256 = readTagValue(tags, "x");
  const originalSha256 = readTagValue(tags, "ox");
  const sizeText = readTagValue(tags, "size");
  const dimText = readTagValue(tags, "dim");
  const size = Number.parseInt(String(sizeText ?? ""), 10);
  const dimMatch = /^(\d+)x(\d+)$/i.exec(String(dimText ?? ""));
  const width = dimMatch ? Number.parseInt(dimMatch[1] ?? "", 10) : 0;
  const height = dimMatch ? Number.parseInt(dimMatch[2] ?? "", 10) : 0;

  if (
    !url ||
    !fileType ||
    encryptionAlgorithm !== "aes-gcm" ||
    !key ||
    !nonce ||
    !encryptedSha256 ||
    !originalSha256 ||
    !Number.isFinite(size) ||
    size <= 0 ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    return null;
  }

  return serializePrivateImageMessage({
    encryptedSha256: encryptedSha256.toLowerCase(),
    encryptedSize: Math.trunc(size),
    encryptionAlgorithm,
    fileType,
    height: Math.trunc(height),
    key: key.toLowerCase(),
    nonce: nonce.toLowerCase(),
    originalSha256: originalSha256.toLowerCase(),
    type: PRIVATE_IMAGE_MESSAGE_TYPE,
    url,
    width: Math.trunc(width),
  });
};

export const decryptPrivateImageMessage = async (
  payload: PrivateImageMessagePayload,
): Promise<Blob> => {
  const response = await fetch(payload.url);
  if (!response.ok) throw new Error("chat-image-download-failed");

  const encryptedBytes = new Uint8Array(await response.arrayBuffer());
  if (encryptedBytes.byteLength !== payload.encryptedSize) {
    throw new Error("chat-image-size-mismatch");
  }
  if (sha256Hex(encryptedBytes) !== payload.encryptedSha256) {
    throw new Error("chat-image-hash-mismatch");
  }

  const keyBytes = hexToBytes(payload.key);
  const nonceBytes = hexToBytes(payload.nonce);
  if (!keyBytes || !nonceBytes) throw new Error("chat-image-invalid-key");

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    copyToArrayBuffer(keyBytes),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: copyToArrayBuffer(nonceBytes) },
    cryptoKey,
    copyToArrayBuffer(encryptedBytes),
  );
  const decryptedBytes = new Uint8Array(decryptedBuffer);

  if (sha256Hex(decryptedBytes) !== payload.originalSha256) {
    throw new Error("chat-image-original-hash-mismatch");
  }

  return new Blob([decryptedBytes], { type: payload.fileType });
};

export const privateImagePreviewText = (t: (key: string) => string): string =>
  t("chatImageMessage");

export const privateImageUploadDebugPayload = (payload: {
  encryptedSha256: string;
  encryptedSize: number;
  url: string;
}) => ({
  encryptedSha256: payload.encryptedSha256,
  encryptedSize: payload.encryptedSize,
  urlHash: sha256Hex(textEncoder.encode(payload.url)),
});
