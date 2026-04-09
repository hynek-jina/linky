import { Buffer } from "buffer";
import { UR, UREncoder } from "@ngraveio/bc-ur";
import { describe, expect, it } from "vitest";
import { AnimatedQrDecoder } from "../src/utils/animatedQr";

const buildAnimatedParts = (payload: string): string[] => {
  const ur = UR.fromBuffer(Buffer.from(payload, "utf8"));
  const encoder = new UREncoder(ur, 18);
  return encoder.encodeWhole();
};

describe("AnimatedQrDecoder", () => {
  it("reconstructs animated UR fragments into the original text", () => {
    const decoder = new AnimatedQrDecoder();
    const payload =
      "cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHBzOi8vbWludC5leGFtcGxlIiwicHJvb2ZzIjpbeyJhbW91bnQiOjIxLCJzZWNyZXQiOiJzZWNyZXQiLCJDIjoiYyIsImlkIjoia2V5c2V0In1dfV19";
    const parts = buildAnimatedParts(payload);

    expect(parts.length).toBeGreaterThan(1);

    for (const part of parts.slice(0, -1)) {
      expect(decoder.receive(part)).toEqual({
        accepted: true,
        completeText: null,
      });
    }

    expect(decoder.receive(parts[parts.length - 1])).toEqual({
      accepted: true,
      completeText: payload,
    });
  });

  it("ignores non-UR QR payloads", () => {
    const decoder = new AnimatedQrDecoder();

    expect(decoder.receive("cashuAfoobar")).toEqual({
      accepted: false,
      completeText: null,
    });
  });
});
