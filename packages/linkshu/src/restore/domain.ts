import { Schema } from "effect";
import { MintUrl, NonNegativeAmount, TokenRowId } from "../domain/primitives";

export class RestoreDraft extends Schema.Class<RestoreDraft>("RestoreDraft")({
  /** Defaults to every known mint (stored rows, seen mints, defaults). */
  mints: Schema.optional(Schema.Array(MintUrl)),
}) {}

export class RestoreReport extends Schema.Class<RestoreReport>("RestoreReport")(
  {
    restoredAmount: NonNegativeAmount,
    /** `accepted` rows created from restored proofs. */
    rows: Schema.Array(TokenRowId),
    scannedMints: Schema.Array(MintUrl),
    unavailableMints: Schema.Array(MintUrl),
  },
) {}
