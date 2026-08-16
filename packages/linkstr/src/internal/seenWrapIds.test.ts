import { describe, expect, it } from "vitest";
import { makeSeenWrapIds } from "./seenWrapIds";

describe("makeSeenWrapIds", () => {
  it("reports ids after they are added", () => {
    const seen = makeSeenWrapIds(2);

    expect(seen.has("a")).toBe(false);
    seen.add("a");
    expect(seen.has("a")).toBe(true);
  });

  it("evicts the oldest id first when capacity is exceeded", () => {
    const seen = makeSeenWrapIds(2);

    seen.add("a");
    seen.add("b");
    seen.add("c");

    expect(seen.has("a")).toBe(false);
    expect(seen.has("b")).toBe(true);
    expect(seen.has("c")).toBe(true);
  });

  it("allows an evicted id to be re-added", () => {
    const seen = makeSeenWrapIds(2);

    seen.add("a");
    seen.add("b");
    seen.add("c");
    seen.add("a");

    expect(seen.has("a")).toBe(true);
    expect(seen.has("b")).toBe(false);
    expect(seen.has("c")).toBe(true);
  });

  it("does not grow or refresh insertion order for an existing id", () => {
    const seen = makeSeenWrapIds(2);

    seen.add("a");
    seen.add("b");
    seen.add("a");
    seen.add("c");

    expect(seen.has("a")).toBe(false);
    expect(seen.has("b")).toBe(true);
    expect(seen.has("c")).toBe(true);
  });
});
