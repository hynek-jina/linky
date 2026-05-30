import { describe, expect, it } from "vitest";
import {
  decodeRotationSnapshot,
  encodeRotationSnapshot,
} from "./rotationSnapshot";

describe("rotationSnapshot", () => {
  describe("encode + decode round trip", () => {
    it("preserves contacts snapshot with cashuBaseline", () => {
      const snap = {
        index: 3,
        baseline: 800,
        cashuBaseline: 42,
        rotatedAtMs: 1_716_250_000_000,
      } as const;
      const encoded = encodeRotationSnapshot(snap);
      expect(decodeRotationSnapshot(encoded, "contacts")).toEqual(snap);
    });

    it("preserves messages snapshot (no cashuBaseline)", () => {
      const snap = {
        index: 2,
        baseline: 0,
        cashuBaseline: null,
        rotatedAtMs: 1_716_250_000_000,
      } as const;
      const encoded = encodeRotationSnapshot(snap);
      expect(decodeRotationSnapshot(encoded, "messages")).toEqual(snap);
    });

    it("preserves transactions snapshot", () => {
      const snap = {
        index: 5,
        baseline: 1234,
        cashuBaseline: null,
        rotatedAtMs: 1_716_300_000_000,
      } as const;
      const encoded = encodeRotationSnapshot(snap);
      expect(decodeRotationSnapshot(encoded, "transactions")).toEqual(snap);
    });

    it("preserves cashu snapshot", () => {
      const snap = {
        index: 4,
        baseline: 87,
        cashuBaseline: null,
        rotatedAtMs: 1_716_350_000_000,
      } as const;
      const encoded = encodeRotationSnapshot(snap);
      expect(decodeRotationSnapshot(encoded, "cashu")).toEqual(snap);
    });

    it("strips cashuBaseline when decoded under a non-contacts scope", () => {
      const encoded = encodeRotationSnapshot({
        index: 4,
        baseline: 7,
        cashuBaseline: 9,
        rotatedAtMs: 1_716_400_000_000,
      });
      expect(decodeRotationSnapshot(encoded, "messages")).toEqual({
        index: 4,
        baseline: 7,
        cashuBaseline: null,
        rotatedAtMs: 1_716_400_000_000,
      });
    });

    it("omits null fields from the encoded JSON to keep it compact", () => {
      const encoded = encodeRotationSnapshot({
        index: 1,
        baseline: null,
        cashuBaseline: null,
        rotatedAtMs: null,
      });
      expect(encoded).toBe('{"index":1}');
    });
  });

  describe("legacy format", () => {
    it("decodes contacts-N", () => {
      expect(decodeRotationSnapshot("contacts-3", "contacts")).toEqual({
        index: 3,
        baseline: null,
        cashuBaseline: null,
        rotatedAtMs: null,
      });
    });

    it("decodes cashu-N", () => {
      expect(decodeRotationSnapshot("cashu-4", "cashu")).toEqual({
        index: 4,
        baseline: null,
        cashuBaseline: null,
        rotatedAtMs: null,
      });
    });

    it("decodes messages-N", () => {
      expect(decodeRotationSnapshot("messages-7", "messages")).toEqual({
        index: 7,
        baseline: null,
        cashuBaseline: null,
        rotatedAtMs: null,
      });
    });

    it("decodes transactions-N", () => {
      expect(decodeRotationSnapshot("transactions-12", "transactions")).toEqual(
        {
          index: 12,
          baseline: null,
          cashuBaseline: null,
          rotatedAtMs: null,
        },
      );
    });

    it("rejects legacy values whose scope prefix doesn't match", () => {
      expect(decodeRotationSnapshot("messages-3", "contacts")).toBeNull();
      expect(decodeRotationSnapshot("contacts-3", "messages")).toBeNull();
    });

    it("trims surrounding whitespace", () => {
      expect(decodeRotationSnapshot("  contacts-3  ", "contacts")).toEqual({
        index: 3,
        baseline: null,
        cashuBaseline: null,
        rotatedAtMs: null,
      });
    });
  });

  describe("invalid input", () => {
    it("returns null for non-string input", () => {
      expect(decodeRotationSnapshot(null, "contacts")).toBeNull();
      expect(decodeRotationSnapshot(undefined, "contacts")).toBeNull();
      expect(decodeRotationSnapshot(42, "contacts")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(decodeRotationSnapshot("", "contacts")).toBeNull();
      expect(decodeRotationSnapshot("   ", "contacts")).toBeNull();
    });

    it("returns null for unparseable JSON-looking input", () => {
      expect(decodeRotationSnapshot("{garbage", "contacts")).toBeNull();
    });

    it("returns null when index is missing or negative", () => {
      expect(decodeRotationSnapshot('{"baseline":5}', "contacts")).toBeNull();
      expect(decodeRotationSnapshot('{"index":-1}', "contacts")).toBeNull();
      expect(decodeRotationSnapshot('{"index":"3"}', "contacts")).toBeNull();
    });

    it("ignores invalid numeric fields and treats them as null", () => {
      expect(
        decodeRotationSnapshot(
          '{"index":3,"baseline":"bad","cashuBaseline":-1,"rotatedAtMs":0}',
          "contacts",
        ),
      ).toEqual({
        index: 3,
        baseline: null,
        cashuBaseline: null,
        rotatedAtMs: null,
      });
    });

    it("rejects fully malformed strings", () => {
      expect(decodeRotationSnapshot("hello world", "contacts")).toBeNull();
      expect(decodeRotationSnapshot("contacts-abc", "contacts")).toBeNull();
    });
  });
});
