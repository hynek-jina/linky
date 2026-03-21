import { Schema } from "effect";
import { NonEmptyTrimmedString } from "../../utils/schemas";

export const NostrTagRaw = Schema.Array(Schema.String).pipe(Schema.minItems(2));
export type NostrTagRaw = typeof NostrTagRaw.Type;

const NostrTagPretty = Schema.Struct({
  name: NonEmptyTrimmedString,
  value: Schema.String,
  extra: Schema.optional(Schema.Array(Schema.String)),
});

export const NostrTag = Schema.transform(NostrTagRaw, NostrTagPretty, {
  decode: (fromTag) => {
    const [name = "", value = "", ...extra] = fromTag;

    if (extra.length > 0) {
      return {
        extra,
        name,
        value,
      };
    }

    return {
      name,
      value,
    };
  },
  encode: (toTag) => {
    const extra = toTag.extra ?? [];
    return [toTag.name, toTag.value, ...extra];
  },
  strict: true,
});

export type NostrTag = typeof NostrTag.Type;
export const makeNostrTag = (
  name: NonEmptyTrimmedString,
  value: string,
  ...extra: string[]
): NostrTag => ({
  name,
  value,
  extra: extra,
});
