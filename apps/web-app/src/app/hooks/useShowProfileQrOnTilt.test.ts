import { describe, expect, it } from "vitest";
import {
  isMotionProfileQrTilt,
  isMotionResetTilt,
  isProfileQrTilt,
  isResetTilt,
} from "./useShowProfileQrOnTilt";

describe("profile QR tilt thresholds", () => {
  it("opens only after a forward orientation tilt", () => {
    expect(isProfileQrTilt(-100)).toBe(true);
    expect(isProfileQrTilt(-90)).toBe(false);
    expect(isProfileQrTilt(90)).toBe(false);
  });

  it("resets after returning from the forward tilt", () => {
    expect(isResetTilt(-40)).toBe(true);
    expect(isResetTilt(-60)).toBe(false);
  });

  it("does not treat normal portrait gravity as forward tilt", () => {
    expect(isMotionProfileQrTilt(-9.8)).toBe(false);
    expect(isMotionProfileQrTilt(0)).toBe(false);
    expect(isMotionProfileQrTilt(6)).toBe(true);
  });

  it("resets motion after tilting back toward normal use", () => {
    expect(isMotionResetTilt(1)).toBe(true);
    expect(isMotionResetTilt(3)).toBe(false);
  });
});
