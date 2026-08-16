import { Clock, Effect } from "effect";
import type { WrapDelivery } from "../domain/delivery";
import { ClientId, UnixSeconds } from "../domain/primitives";
import type { RumorId } from "../domain/primitives";
import type { InspectorService } from "../inspector/Inspector";
import { OperationFailed, OperationSucceeded } from "../inspector/events";

export const freshClientId = Effect.sync(() =>
  ClientId.make(crypto.randomUUID()),
);

export const nowSeconds = Clock.currentTimeMillis.pipe(
  Effect.map((millis) => UnixSeconds.make(Math.floor(millis / 1000))),
);

export interface OperationReceiptSummary {
  readonly rumorId: RumorId;
  readonly clientId: ClientId;
  readonly sentAt: UnixSeconds;
  readonly selfCopy: WrapDelivery | null;
  readonly recipientCopy: WrapDelivery;
}

export const inspectOperation =
  <A>(
    inspector: InspectorService,
    name: string,
    params: unknown,
    summarize: (receipt: A) => OperationReceiptSummary,
  ) =>
  <T extends A, E>(operation: Effect.Effect<T, E>): Effect.Effect<T, E> =>
    operation.pipe(
      Effect.tap((receipt) =>
        Effect.sync(() =>
          inspector.emit(
            () =>
              new OperationSucceeded(
                { name, params, ...summarize(receipt) },
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
