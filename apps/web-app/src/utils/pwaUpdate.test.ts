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

  const stubSwController = (clientCount: number) => {
    vi.stubGlobal("navigator", {
      serviceWorker: {
        controller: {
          postMessage: (_message: unknown, transfer: Transferable[]) => {
            const port = transfer[0];
            if (port instanceof MessagePort) {
              port.postMessage({ count: clientCount });
            }
          },
        },
      },
    });
  };

  it("auto-applies a startup update when this tab is the only client", async () => {
    stubSwController(1);
    const pwaUpdate = await loadPwaUpdate();
    const values: boolean[] = [];
    const updateSW = vi.fn(() => Promise.resolve());

    pwaUpdate.subscribePwaNeedRefresh((value) => {
      values.push(value);
    });
    pwaUpdate.recordPwaRegistered(updateSW);

    await pwaUpdate.handlePwaUpdateAvailable();

    expect(updateSW).toHaveBeenCalledWith(true);
    expect(values).toEqual([false]);
  });

  it("shows the prompt instead of auto-applying when other tabs are open", async () => {
    stubSwController(2);
    const pwaUpdate = await loadPwaUpdate();
    const values: boolean[] = [];
    const updateSW = vi.fn(() => Promise.resolve());

    pwaUpdate.subscribePwaNeedRefresh((value) => {
      values.push(value);
    });
    pwaUpdate.recordPwaRegistered(updateSW);

    await pwaUpdate.handlePwaUpdateAvailable();

    expect(updateSW).not.toHaveBeenCalled();
    expect(values).toEqual([false, true]);
  });

  it("shows the prompt when the client count is unknown", async () => {
    vi.stubGlobal("navigator", {});
    const pwaUpdate = await loadPwaUpdate();
    const values: boolean[] = [];
    const updateSW = vi.fn(() => Promise.resolve());

    pwaUpdate.subscribePwaNeedRefresh((value) => {
      values.push(value);
    });
    pwaUpdate.recordPwaRegistered(updateSW);

    await pwaUpdate.handlePwaUpdateAvailable();

    expect(updateSW).not.toHaveBeenCalled();
    expect(values).toEqual([false, true]);
  });

  it("shows the prompt once the user has interacted", async () => {
    stubSwController(1);
    const pwaUpdate = await loadPwaUpdate();
    const values: boolean[] = [];
    const updateSW = vi.fn(() => Promise.resolve());

    pwaUpdate.subscribePwaNeedRefresh((value) => {
      values.push(value);
    });
    pwaUpdate.recordPwaRegistered(updateSW);
    window.dispatchEvent(new Event("pointerdown"));

    await pwaUpdate.handlePwaUpdateAvailable();

    expect(updateSW).not.toHaveBeenCalled();
    expect(values).toEqual([false, true]);
  });

  it("shows the prompt after the startup window has passed", async () => {
    stubSwController(1);
    const pwaUpdate = await loadPwaUpdate();
    const values: boolean[] = [];
    const updateSW = vi.fn(() => Promise.resolve());

    pwaUpdate.subscribePwaNeedRefresh((value) => {
      values.push(value);
    });
    pwaUpdate.recordPwaRegistered(updateSW);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_000);

    await pwaUpdate.handlePwaUpdateAvailable();

    expect(updateSW).not.toHaveBeenCalled();
    expect(values).toEqual([false, true]);
  });

  // A pending worker that answers APP_VERSION, alongside a controller that
  // reports enough open tabs to keep the silent auto-apply path out of the way.
  const stubPendingWorker = (pendingVersion: string | null) => {
    const replyWith = (message: unknown, transfer: Transferable[]) => {
      const port = transfer[0];
      if (port instanceof MessagePort) port.postMessage(message);
    };
    vi.stubGlobal("navigator", {
      serviceWorker: {
        controller: {
          postMessage: (_message: unknown, transfer: Transferable[]) => {
            replyWith({ count: 2 }, transfer);
          },
        },
        getRegistration: () =>
          Promise.resolve({
            waiting: {
              postMessage: (_message: unknown, transfer: Transferable[]) => {
                // null models a worker built before the APP_VERSION handler:
                // it never replies and the caller times out.
                if (pendingVersion === null) return;
                replyWith({ version: pendingVersion }, transfer);
              },
            },
          }),
      },
    });
  };

  it("does not prompt when the pending worker is the running version", async () => {
    vi.stubGlobal("__APP_VERSION__", "26.9.0");
    stubPendingWorker("26.9.0");
    const pwaUpdate = await loadPwaUpdate();
    const values: boolean[] = [];
    const updateSW = vi.fn(() => Promise.resolve());

    pwaUpdate.subscribePwaNeedRefresh((value) => {
      values.push(value);
    });
    pwaUpdate.recordPwaRegistered(updateSW);

    await pwaUpdate.handlePwaUpdateAvailable();

    expect(updateSW).not.toHaveBeenCalled();
    expect(values).toEqual([false]);
  });

  it("prompts when the pending worker is a different version", async () => {
    vi.stubGlobal("__APP_VERSION__", "26.9.0");
    stubPendingWorker("26.9.1");
    const pwaUpdate = await loadPwaUpdate();
    const values: boolean[] = [];

    pwaUpdate.subscribePwaNeedRefresh((value) => {
      values.push(value);
    });

    await pwaUpdate.handlePwaUpdateAvailable();

    expect(values).toEqual([false, true]);
  });

  it("prompts when the pending worker does not report a version", async () => {
    vi.stubGlobal("__APP_VERSION__", "26.9.0");
    stubPendingWorker(null);
    const pwaUpdate = await loadPwaUpdate();
    const values: boolean[] = [];

    pwaUpdate.subscribePwaNeedRefresh((value) => {
      values.push(value);
    });

    await pwaUpdate.handlePwaUpdateAvailable();

    expect(values).toEqual([false, true]);
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
