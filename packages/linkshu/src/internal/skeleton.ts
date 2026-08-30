import { Effect } from "effect";

const skeletonError = (operation: string): Error =>
  new Error(
    `@linky/linkshu: ${operation} is not implemented (interface-contract skeleton)`,
  );

/**
 * Placeholder body for the interface-contract skeleton (#286). Accepting the
 * operation inputs keeps call-site signatures fully typed while every body is
 * still a stub.
 */
export const notImplemented = (
  operation: string,
  params?: object,
): Effect.Effect<never> => {
  void params;
  return Effect.die(skeletonError(operation));
};
