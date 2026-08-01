// Every localStorage access in `storage.ts` is wrapped in a try/catch that
// swallows the error, so a broken environment produces silent no-ops instead of
// failures. These cases pin down the observability that turns "silently did
// nothing" into an assertable fact, without changing the best-effort production
// behaviour: no wrapper may throw, and every fallback value stays identical.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOSTR_NSEC_STORAGE_KEY,
  SHOW_PROFILE_QR_ON_TILT_STORAGE_KEY,
} from "./constants";
import {
  getInitialNostrNsec,
  getInitialShowProfileQrOnTiltEnabled,
  getLastLocalStorageFailure,
  getLocalStorageFailureCount,
  resetLocalStorageFailures,
  safeLocalStorageGet,
  safeLocalStorageGetJson,
  safeLocalStorageSet,
  setLocalStorageFailureReporter,
  type LocalStorageFailure,
} from "./storage";

const TEST_KEY = "linky.test.obs";
const TEST_JSON_KEY = "linky.test.obs.json";

// jsdom's Storage is a Proxy: assigning or defineProperty-ing `setItem` on the
// localStorage *instance* stores a storage item keyed "setItem" and the real
// method keeps working, so such a test passes while verifying nothing. Always
// spy the prototype. Note this also affects sessionStorage, since both share
// Storage.prototype — harmless here, nothing below touches sessionStorage.
const stubThrowingSetItem = (): void => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("quota exceeded", "QuotaExceededError");
  });
};

const stubThrowingGetItem = (): void => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("storage is disabled", "SecurityError");
  });
};

describe("localStorage failure observability", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLocalStorageFailures();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setLocalStorageFailureReporter(null);
  });

  it("(a) counts nothing when a write and a read both succeed", () => {
    safeLocalStorageSet(TEST_KEY, "ok");

    expect(safeLocalStorageGet(TEST_KEY)).toBe("ok");
    expect(getLocalStorageFailureCount()).toBe(0);
    expect(getLastLocalStorageFailure()).toBeNull();
  });

  it("(b) counts a swallowed set failure exactly once without throwing", () => {
    stubThrowingSetItem();

    expect(() => {
      safeLocalStorageSet(TEST_KEY, "boom");
    }).not.toThrow();

    expect(getLocalStorageFailureCount()).toBe(1);

    const failure = getLastLocalStorageFailure();
    expect(failure?.operation).toBe("set");
    expect(failure?.key).toBe(TEST_KEY);
    expect(failure?.message.length).toBeGreaterThan(0);
  });

  it("(c) counts a swallowed get failure under 'get' and still returns null", () => {
    stubThrowingGetItem();

    expect(safeLocalStorageGet(TEST_KEY)).toBeNull();
    expect(getLocalStorageFailureCount()).toBe(1);
    expect(getLastLocalStorageFailure()?.operation).toBe("get");
    expect(getLastLocalStorageFailure()?.key).toBe(TEST_KEY);
  });

  it("(d) reports a corrupt-JSON read under 'getJson' and returns the fallback", () => {
    localStorage.setItem(TEST_JSON_KEY, "{not-json");

    const fallback = { fallback: true };
    expect(safeLocalStorageGetJson(TEST_JSON_KEY, fallback)).toEqual(fallback);

    expect(getLocalStorageFailureCount()).toBe(1);
    // A corrupt payload is data corruption, not a storage fault: it must be
    // distinguishable from a failing `get`.
    expect(getLastLocalStorageFailure()?.operation).toBe("getJson");
    expect(getLastLocalStorageFailure()?.key).toBe(TEST_JSON_KEY);
  });

  it("(e) clears the counter and the last failure on reset", () => {
    stubThrowingSetItem();
    safeLocalStorageSet(TEST_KEY, "boom");
    expect(getLocalStorageFailureCount()).toBe(1);
    expect(getLastLocalStorageFailure()).not.toBeNull();

    resetLocalStorageFailures();

    expect(getLocalStorageFailureCount()).toBe(0);
    expect(getLastLocalStorageFailure()).toBeNull();
  });

  it("(f) routes failures to a registered reporter and survives a throwing one", () => {
    const reporter = vi.fn<(failure: LocalStorageFailure) => void>();
    setLocalStorageFailureReporter(reporter);
    stubThrowingSetItem();

    safeLocalStorageSet(TEST_KEY, "boom");

    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter).toHaveBeenCalledWith({
      key: TEST_KEY,
      message: expect.any(String),
      operation: "set",
    });

    setLocalStorageFailureReporter(() => {
      throw new Error("reporter is broken");
    });

    // A broken reporter must never break a best-effort storage call.
    expect(() => {
      safeLocalStorageSet(TEST_KEY, "boom-again");
    }).not.toThrow();
    expect(getLocalStorageFailureCount()).toBe(2);
    expect(reporter).toHaveBeenCalledTimes(1);
  });

  it("(g) reports the read behind getInitialShowProfileQrOnTiltEnabled", () => {
    stubThrowingGetItem();

    // The fallback is unchanged — the reader still cannot throw — but the
    // failure is no longer invisible.
    expect(getInitialShowProfileQrOnTiltEnabled()).toBe(false);
    expect(getLocalStorageFailureCount()).toBe(1);
    expect(getLastLocalStorageFailure()?.operation).toBe("get");
    expect(getLastLocalStorageFailure()?.key).toBe(
      SHOW_PROFILE_QR_ON_TILT_STORAGE_KEY,
    );
  });

  it("(h) reports the nsec read without recording any value", () => {
    stubThrowingGetItem();

    expect(getInitialNostrNsec()).toBeNull();
    expect(getLocalStorageFailureCount()).toBe(1);

    const failure = getLastLocalStorageFailure();
    expect(failure?.key).toBe(NOSTR_NSEC_STORAGE_KEY);
    // A failure record must never carry the stored value: this reader owns the
    // nsec, so a `value` field here would leak a private key into any reporter.
    expect(Object.keys(failure ?? {}).sort()).toEqual([
      "key",
      "message",
      "operation",
    ]);
  });
});
