import { describe, expect, it } from "vitest";
import {
  isCashuOutputsAlreadySignedError,
  isCashuOutputsArePendingError,
  isCashuRecoverableOutputCollisionError,
} from "./cashuErrors";

describe("isCashuOutputsArePendingError", () => {
  it("matches NUT error code 11004", () => {
    const err = Object.assign(new Error("outputs are pending"), {
      code: 11004,
    });
    expect(isCashuOutputsArePendingError(err)).toBe(true);
  });

  it("matches by message when no code is present", () => {
    expect(
      isCashuOutputsArePendingError(new Error("outputs are pending")),
    ).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isCashuOutputsArePendingError(new Error("network down"))).toBe(
      false,
    );
    expect(
      isCashuOutputsArePendingError(
        Object.assign(new Error("nope"), { code: 11005 }),
      ),
    ).toBe(false);
  });
});

describe("isCashuOutputsAlreadySignedError", () => {
  it("matches NUT error code 11005", () => {
    const err = Object.assign(new Error("outputs already signed"), {
      code: 11005,
    });
    expect(isCashuOutputsAlreadySignedError(err)).toBe(true);
  });

  it("does not confuse pending with already-signed", () => {
    const pending = Object.assign(new Error("outputs are pending"), {
      code: 11004,
    });
    expect(isCashuOutputsAlreadySignedError(pending)).toBe(false);
  });
});

describe("isCashuRecoverableOutputCollisionError", () => {
  it("matches both 11004 and 11005", () => {
    expect(
      isCashuRecoverableOutputCollisionError(
        Object.assign(new Error("x"), { code: 11004 }),
      ),
    ).toBe(true);
    expect(
      isCashuRecoverableOutputCollisionError(
        Object.assign(new Error("x"), { code: 11005 }),
      ),
    ).toBe(true);
  });

  it("does not match other codes", () => {
    expect(
      isCashuRecoverableOutputCollisionError(
        Object.assign(new Error("x"), { code: 11000 }),
      ),
    ).toBe(false);
  });
});
