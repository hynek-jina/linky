import { Context, Effect, Layer, Option, Stream } from "effect";
import { notImplemented } from "../internal/skeleton";
import type { LinkshuInspectorEvent } from "./events";

export interface InspectorService {
  /**
   * Sync so hot paths can emit without running Effects, lazy so the builder
   * is not invoked when nobody consumes, and total so a throwing builder is
   * logged and dropped, never a defect of the observed operation.
   */
  readonly emit: (build: () => LinkshuInspectorEvent) => void;
  /** Single-consumer; fan out downstream. */
  readonly events: Stream.Stream<LinkshuInspectorEvent>;
}

const noop: InspectorService = { emit: () => {}, events: Stream.empty };

/**
 * Optional diagnostics bus, cloned from linkstr's `Inspector` (the packages
 * stay dependency-free of each other by design). Services emit through
 * `Inspector.orNoop`, so providing no layer costs nothing; a composition
 * root that wants the feed provides `Inspector.live` and consumes `events`.
 */
export class Inspector extends Context.Tag("linkshu/Inspector")<
  Inspector,
  InspectorService
>() {
  /** Sliding in-memory buffer; old diagnostics are droppable by design. */
  static readonly live: Layer.Layer<Inspector> = Layer.effect(
    Inspector,
    notImplemented("Inspector.live"),
  );

  /** For composition roots that provide the tag unconditionally. */
  static readonly disabled: Layer.Layer<Inspector> = Layer.succeed(
    Inspector,
    noop,
  );

  static readonly orNoop: Effect.Effect<InspectorService> = Effect.map(
    Effect.serviceOption(Inspector),
    Option.getOrElse(() => noop),
  );
}
