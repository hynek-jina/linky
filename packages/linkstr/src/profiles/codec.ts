import { Either, Option, Schema } from "effect";
import { isUnixSeconds } from "../domain/primitives";
import type { UnixSeconds } from "../domain/primitives";
import { firstTagValue } from "../internal/nostrEvent";
import type { SignedPlainEvent } from "../internal/nostrEvent";
import { ProfileMetadata } from "./domain";
import { ProfileUpdated, StatusUpdated } from "./events";
import type { ProfileDropReason } from "./events";

export const PROFILE_KIND = 0;
export const STATUS_KIND = 30315;
export const STATUS_D_GENERAL = "general";

const decodeJsonRecord = Schema.decodeUnknownOption(
  Schema.Record({ key: Schema.String, value: Schema.Unknown }),
);

const stringField = (
  record: Record<string, unknown>,
  ...keys: ReadonlyArray<string>
): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return undefined;
};

/**
 * Tolerant kind-0 decode: unknown fields ignored, non-string fields dropped.
 * The wire's `display_name` wins over the nonstandard `displayName` spelling,
 * and the legacy `image` field stands in for a missing `picture`.
 */
export const decodeProfileMetadata = (
  content: string,
): Option.Option<ProfileMetadata> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return Option.none();
  }
  return Option.map(decodeJsonRecord(parsed), (record) => {
    const name = stringField(record, "name");
    const displayName = stringField(record, "display_name", "displayName");
    const picture = stringField(record, "picture", "image");
    const lud16 = stringField(record, "lud16");
    const lud06 = stringField(record, "lud06");
    const nip05 = stringField(record, "nip05");
    const about = stringField(record, "about");
    return new ProfileMetadata({
      ...(name === undefined ? {} : { name }),
      ...(displayName === undefined ? {} : { displayName }),
      ...(picture === undefined ? {} : { picture }),
      ...(lud16 === undefined ? {} : { lud16 }),
      ...(lud06 === undefined ? {} : { lud06 }),
      ...(nip05 === undefined ? {} : { nip05 }),
      ...(about === undefined ? {} : { about }),
    });
  });
};

/** Standard wire field names only; empty fields omitted. */
export const encodeProfileContent = (metadata: ProfileMetadata): string => {
  const wire: Record<string, string> = {};
  const put = (key: string, value: string | undefined) => {
    if (value !== undefined && value !== "") wire[key] = value;
  };
  put("name", metadata.name);
  put("display_name", metadata.displayName);
  put("picture", metadata.picture);
  put("lud16", metadata.lud16);
  put("lud06", metadata.lud06);
  put("nip05", metadata.nip05);
  put("about", metadata.about);
  return JSON.stringify(wire);
};

export const decodeProfileEvent = (
  event: SignedPlainEvent,
): Either.Either<ProfileUpdated, ProfileDropReason> =>
  Option.match(decodeProfileMetadata(event.content), {
    onNone: () => Either.left("malformed-profile"),
    onSome: (metadata) =>
      Either.right(
        new ProfileUpdated({
          pubkey: event.pubkey,
          metadata,
          updatedAt: event.created_at,
        }),
      ),
  });

/** NIP-40 expiration tag, tolerantly: an unparsable value means no expiry. */
const expirationOf = (event: SignedPlainEvent): UnixSeconds | null => {
  const raw = firstTagValue(event.tags, "expiration");
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return isUnixSeconds(parsed) ? parsed : null;
};

export const decodeStatusEvent = (
  event: SignedPlainEvent,
  now: UnixSeconds,
): Either.Either<StatusUpdated, ProfileDropReason> => {
  if (firstTagValue(event.tags, "d") !== STATUS_D_GENERAL) {
    return Either.left("other-d-tag");
  }
  const expiresAt = expirationOf(event);
  if (expiresAt !== null && expiresAt <= now) return Either.left("expired");
  return Either.right(
    new StatusUpdated({
      pubkey: event.pubkey,
      content: event.content,
      expiresAt,
      updatedAt: event.created_at,
    }),
  );
};
