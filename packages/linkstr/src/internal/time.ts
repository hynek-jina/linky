import { Clock, Effect } from "effect";
import { UnixSeconds } from "../domain/primitives";

export const nowUnixSeconds: Effect.Effect<UnixSeconds> = Effect.map(
  Clock.currentTimeMillis,
  (millis) => UnixSeconds.make(Math.floor(millis / 1000)),
);
