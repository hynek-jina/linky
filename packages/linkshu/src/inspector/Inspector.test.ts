import { Effect, Stream } from "effect";
import { OperationSucceeded } from "./events";
import { Inspector } from "./Inspector";

const event = (name: string): OperationSucceeded =>
  new OperationSucceeded({ name, params: null, result: null });

describe("Inspector.live", () => {
  it("buffers emitted events and delivers them via events", async () => {
    const collected = await Effect.runPromise(
      Effect.gen(function* () {
        const inspector = yield* Inspector;
        inspector.emit(() => event("first"));
        inspector.emit(() => event("second"));
        return yield* Stream.runCollect(Stream.take(inspector.events, 2));
      }).pipe(Effect.provide(Inspector.live)),
    );
    expect([...collected]).toEqual([
      expect.objectContaining({ name: "first" }),
      expect.objectContaining({ name: "second" }),
    ]);
  });

  it("swallows a throwing builder; later events still arrive", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const collected = await Effect.runPromise(
        Effect.gen(function* () {
          const inspector = yield* Inspector;
          inspector.emit(() => {
            throw new Error("bad builder");
          });
          inspector.emit(() => event("after"));
          return yield* Stream.runCollect(Stream.take(inspector.events, 1));
        }).pipe(Effect.provide(Inspector.live)),
      );
      expect([...collected]).toEqual([
        expect.objectContaining({ name: "after" }),
      ]);
      expect(warn).toHaveBeenCalledWith(
        "linkshu inspector emission failed",
        expect.any(Error),
      );
    } finally {
      warn.mockRestore();
    }
  });
});

describe("Inspector.orNoop", () => {
  it("yields the noop service when no layer is provided", async () => {
    const service = await Effect.runPromise(Inspector.orNoop);
    expect(() => service.emit(() => event("ignored"))).not.toThrow();
    const collected = await Effect.runPromise(
      Stream.runCollect(service.events),
    );
    expect([...collected]).toEqual([]);
  });
});
