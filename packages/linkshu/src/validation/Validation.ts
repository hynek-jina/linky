import { Effect } from "effect";
import { TokenRowNotFound } from "../domain/errors";
import type { TokenRowId } from "../domain/primitives";
import { Inspector } from "../inspector/Inspector";
import { notImplemented } from "../internal/skeleton";
import { CashuSeed } from "../ports/CashuSeed";
import { TokenStore } from "../ports/TokenStore";
import type {
  IssuedClaimReport,
  RowCheckResult,
  ValidationReport,
} from "./domain";

/**
 * NUT-07 proof-state validation of stored rows. One batched checkstate call
 * per mint+unit group; per row, any unspent proof keeps it live (with only
 * the unspent proofs), all-spent marks it `error` individually, and an
 * unknown or truncated response never marks anything. Surviving proofs of a
 * group are merged locally into one re-encoded `accepted` row — validation
 * performs no swap, so it costs no mint signatures. Mint unavailability is
 * data in the reports, never a failure of the operation.
 */
export class Validation extends Effect.Service<Validation>()(
  "linkshu/Validation",
  {
    effect: Effect.gen(function* () {
      // Contract-level dependency declarations; bodies land with the vertical.
      yield* CashuSeed;
      yield* TokenStore;
      yield* Inspector.orNoop;

      /** Check and consolidate every non-emitted row. */
      const checkAll: Effect.Effect<ValidationReport> = notImplemented(
        "validation.checkAll",
      );

      const checkRow = (
        rowId: TokenRowId,
      ): Effect.Effect<RowCheckResult, TokenRowNotFound> =>
        notImplemented("validation.checkRow", { rowId });

      /** Detect issued tokens the recipient has claimed, and prune them. */
      const checkIssued: Effect.Effect<IssuedClaimReport> = notImplemented(
        "validation.checkIssued",
      );

      return { checkAll, checkRow, checkIssued } as const;
    }),
  },
) {}
