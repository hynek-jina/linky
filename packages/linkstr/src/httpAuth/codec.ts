import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { getPublicKey } from "nostr-tools";
import type { NostrSecretKey, UnixSeconds } from "../domain/primitives";
import type { SignedPlainEvent } from "../internal/nostrEvent";
import { signPlainEvent } from "../internal/plainEvent";
import type {
  BlossomUploadAuthDraft,
  Nip98AuthDraft,
  PushOwnershipProofDraft,
} from "./domain";

export const BLOSSOM_AUTH_KIND = 24242;
export const BLOSSOM_AUTH_EXPIRATION_SECONDS = 600;
export const HTTP_AUTH_KIND = 27235;

const utf8Encoder = new TextEncoder();

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const bytesToBase64Url = (bytes: Uint8Array): string =>
  bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const encodeEvent = (event: SignedPlainEvent): Uint8Array =>
  utf8Encoder.encode(JSON.stringify(event));

export const makeBlossomUploadAuthHeader = (
  draft: BlossomUploadAuthDraft,
  secretKey: NostrSecretKey,
  now: UnixSeconds,
): string => {
  const event = signPlainEvent(
    {
      kind: BLOSSOM_AUTH_KIND,
      tags: [
        ["t", "upload"],
        ["expiration", String(now + BLOSSOM_AUTH_EXPIRATION_SECONDS)],
        ["x", draft.sha256],
        ["server", draft.serverDomain],
      ],
      content: "Upload Blob",
    },
    now,
    secretKey,
  );

  return `Nostr ${bytesToBase64Url(encodeEvent(event))}`;
};

export const makePushOwnershipProof = (
  draft: PushOwnershipProofDraft,
  secretKey: NostrSecretKey,
  now: UnixSeconds,
): SignedPlainEvent => {
  const pubkey = getPublicKey(secretKey);
  return signPlainEvent(
    {
      kind: HTTP_AUTH_KIND,
      tags: [
        ["challenge", draft.challenge],
        ["action", draft.action],
        ["pubkey", pubkey],
      ],
      content: `linky-push-${draft.action}`,
    },
    now,
    secretKey,
  );
};

export const makeNip98AuthHeader = (
  draft: Nip98AuthDraft,
  secretKey: NostrSecretKey,
  now: UnixSeconds,
): string => {
  const payloadTag = draft.payload
    ? [
        [
          "payload",
          bytesToHex(sha256(utf8Encoder.encode(JSON.stringify(draft.payload)))),
        ],
      ]
    : [];
  const event = signPlainEvent(
    {
      kind: HTTP_AUTH_KIND,
      tags: [["u", draft.url], ["method", draft.method], ...payloadTag],
      content: "",
    },
    now,
    secretKey,
  );

  return `Nostr ${bytesToBase64(encodeEvent(event))}`;
};
