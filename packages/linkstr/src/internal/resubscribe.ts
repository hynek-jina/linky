import { Clock, Duration, Effect, Random } from "effect";

const BACKOFF_FACTOR = 2;
const MAX_DELAY_FACTOR = 12;
const HEALTHY_UPTIME_FACTOR = 6;
const JITTER_SPREAD = 0.4;

/**
 * Runs a subscription attempt forever, doubling the delay between attempts
 * (with ±20% jitter) up to `baseDelay * 12`, so a dead relay is retried ever
 * more lazily instead of on a fixed cadence. An attempt that stayed up for at
 * least `baseDelay * 6` counts as a healthy connection and resets the delay;
 * the threshold must exceed the transport's connection timeout, or a
 * black-holed dial would read as healthy. Every window scales from the one
 * `baseDelay` knob so millisecond-delay test configs stay fast.
 */
export const resubscribeForever = (
  attempt: Effect.Effect<unknown, unknown>,
  baseDelay: Duration.Duration,
): Effect.Effect<never> =>
  Effect.gen(function* () {
    const baseMs = Duration.toMillis(baseDelay);
    let delayMs = baseMs;
    while (true) {
      const startedAt = yield* Clock.currentTimeMillis;
      yield* Effect.ignore(attempt);
      const uptimeMs = (yield* Clock.currentTimeMillis) - startedAt;
      if (uptimeMs >= baseMs * HEALTHY_UPTIME_FACTOR) delayMs = baseMs;
      const jitter =
        1 - JITTER_SPREAD / 2 + JITTER_SPREAD * (yield* Random.next);
      // Whole milliseconds keep clock timestamps integral, so the uptime
      // measured against the healthy threshold is never off by a float ulp.
      yield* Effect.sleep(Duration.millis(Math.round(delayMs * jitter)));
      delayMs = Math.min(delayMs * BACKOFF_FACTOR, baseMs * MAX_DELAY_FACTOR);
    }
  });
