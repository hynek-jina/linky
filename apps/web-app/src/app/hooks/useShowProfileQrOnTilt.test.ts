import { describe, expect, it } from "vitest";
import {
  getAngleDelta,
  isMotionProfileQrTilt,
  isMotionResetTilt,
  isProfileQrTilt,
  isResetTilt,
  isScreenProfileQrTilt,
  isScreenResetTilt,
  normalizeScreenAngle,
} from "./useShowProfileQrOnTilt";

describe("profile QR tilt thresholds", () => {
  it("normalizes orientation deltas across the beta wrap-around", () => {
    expect(getAngleDelta(-170, 170)).toBe(20);
    expect(getAngleDelta(170, -170)).toBe(-20);
  });

  it("opens after a significant orientation change from normal use", () => {
    expect(isProfileQrTilt(35, 90)).toBe(true);
    expect(isProfileQrTilt(145, 90)).toBe(true);
    expect(isProfileQrTilt(68, 90)).toBe(false);
  });

  it("resets after returning near the calibrated orientation", () => {
    expect(isResetTilt(96, 90)).toBe(true);
    expect(isResetTilt(60, 90)).toBe(false);
  });

  it("opens only after gravity changes away from normal use", () => {
    expect(isMotionProfileQrTilt(-9.8, -9.8)).toBe(false);
    expect(isMotionProfileQrTilt(-7, -9.8)).toBe(false);
    expect(isMotionProfileQrTilt(0, -9.8)).toBe(true);
  });

  it("resets motion after returning near calibrated gravity", () => {
    expect(isMotionResetTilt(-8.7, -9.8)).toBe(true);
    expect(isMotionResetTilt(-6, -9.8)).toBe(false);
  });

  it("opens when the browser reports upside-down portrait", () => {
    expect(normalizeScreenAngle(-180)).toBe(180);
    expect(isScreenProfileQrTilt({ angle: 180, type: null })).toBe(true);
    expect(
      isScreenProfileQrTilt({ angle: null, type: "portrait-secondary" }),
    ).toBe(true);
    expect(isScreenProfileQrTilt({ angle: 0, type: "portrait-primary" })).toBe(
      false,
    );
  });

  it("resets when the browser returns to primary portrait", () => {
    expect(isScreenResetTilt({ angle: 0, type: null })).toBe(true);
    expect(isScreenResetTilt({ angle: null, type: "portrait-primary" })).toBe(
      true,
    );
    expect(isScreenResetTilt({ angle: 180, type: "portrait-secondary" })).toBe(
      false,
    );
  });
});
