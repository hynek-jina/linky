import { Effect } from "effect";
import type { InspectorService } from "../inspector/Inspector";
import { OperationFailed, OperationSucceeded } from "../inspector/events";

/**
 * Taps a wallet operation into the inspector: success as
 * `OperationSucceeded` (the receipt travels as `result`), failure as
 * `OperationFailed`. Never alters the operation's outcome.
 */
export const inspectOperation =
  (inspector: InspectorService, name: string, params: unknown) =>
  <A, E, R>(operation: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    operation.pipe(
      Effect.tap((result) =>
        Effect.sync(() =>
          inspector.emit(
            () =>
              new OperationSucceeded(
                { name, params, result },
                { disableValidation: true },
              ),
          ),
        ),
      ),
      Effect.tapError((error) =>
        Effect.sync(() =>
          inspector.emit(
            () =>
              new OperationFailed(
                { name, params, error },
                { disableValidation: true },
              ),
          ),
        ),
      ),
    );
