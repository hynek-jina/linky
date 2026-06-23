import { beforeEach, describe, expect, it } from "vitest";
import { SHOW_PROFILE_QR_ON_TILT_STORAGE_KEY } from "./constants";
import { getInitialShowProfileQrOnTiltEnabled } from "./storage";

describe("profile QR tilt preference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is opt-in", () => {
    expect(getInitialShowProfileQrOnTiltEnabled()).toBe(false);
  });

  it("is enabled only by the stored opt-in value", () => {
    localStorage.setItem(SHOW_PROFILE_QR_ON_TILT_STORAGE_KEY, "0");
    expect(getInitialShowProfileQrOnTiltEnabled()).toBe(false);

    localStorage.setItem(SHOW_PROFILE_QR_ON_TILT_STORAGE_KEY, "1");
    expect(getInitialShowProfileQrOnTiltEnabled()).toBe(true);
  });
});
