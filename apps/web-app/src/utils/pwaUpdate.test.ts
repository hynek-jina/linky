import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadPwaUpdate = async () => {
  vi.resetModules();
  return import("./pwaUpdate");
};

describe("pwaUpdate", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.stubGlobal("location", { reload: vi.fn() });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clears and suppresses the prompt until the accepted update reloads", async () => {
    vi.useFakeTimers();
    const pwaUpdate = await loadPwaUpdate();
    const values: boolean[] = [];

    pwaUpdate.subscribePwaNeedRefresh((value) => {
      values.push(value);
    });

    pwaUpdate.markPwaNeedRefresh(true);
    pwaUpdate.recordPwaRegistered(() => Promise.resolve());

    await pwaUpdate.applyPwaUpdate();
    pwaUpdate.markPwaNeedRefresh(true);

    expect(values).toEqual([false, true, false]);

    pwaUpdate.recordPwaControllerChange();
    pwaUpdate.markPwaNeedRefresh(true);

    expect(values).toEqual([false, true, false]);
  });

  it("keeps the prompt available when applying the update fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pwaUpdate = await loadPwaUpdate();
    const values: boolean[] = [];

    pwaUpdate.subscribePwaNeedRefresh((value) => {
      values.push(value);
    });

    pwaUpdate.markPwaNeedRefresh(true);
    pwaUpdate.recordPwaRegistered(() => Promise.reject(new Error("boom")));

    await pwaUpdate.applyPwaUpdate();

    expect(values).toEqual([false, true, false, true]);
  });
});
