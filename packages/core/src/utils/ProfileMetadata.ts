import { Schema } from "effect";
import { HttpsUrl, Lud16Address } from "../identity";

export const ProfileMetadata = Schema.Struct({
  name: Schema.String,
  display_name: Schema.String,
  picture: HttpsUrl,
  lud16: Lud16Address,
}).pipe(Schema.partial);
export type ProfileMetadata = typeof ProfileMetadata.Type;
