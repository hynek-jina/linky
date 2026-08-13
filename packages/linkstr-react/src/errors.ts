import { Schema } from "effect";

export class LinkstrNotConfigured extends Schema.TaggedError<LinkstrNotConfigured>()(
  "LinkstrNotConfigured",
  {},
) {}
