type Listener = (needRefresh: boolean) => void;

const STARTUP_AUTO_UPDATE_WINDOW_MS = 5_000;
const CLIENT_COUNT_TIMEOUT_MS = 1_000;
const APP_VERSION_TIMEOUT_MS = 1_000;

const listeners = new Set<Listener>();
let needRefresh = false;
let applyingUpdate = false;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

const appStartTime = Date.now();
let userHasInteracted = false;

if (typeof window !== "undefined") {
  for (const eventName of ["pointerdown", "keydown"]) {
    window.addEventListener(
      eventName,
      () => {
        userHasInteracted = true;
      },
      { capture: true, once: true },
    );
  }
}

const reloadPage = () => {
  if (typeof location !== "undefined") {
    location.reload();
  }
};

const scheduleReloadFallback = () => {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    if (applyingUpdate) reloadPage();
  }, 1_500);
};

export const recordPwaRegistered = (
  fn: ((reloadPage?: boolean) => Promise<void>) | null,
) => {
  updateSW = fn;
};

export const markPwaNeedRefresh = (value: boolean) => {
  if (value && applyingUpdate) return;
  if (needRefresh === value) return;
  needRefresh = value;
  for (const listener of listeners) {
    listener(value);
  }
};

export const recordPwaControllerChange = () => {
  markPwaNeedRefresh(false);
};

export const subscribePwaNeedRefresh = (listener: Listener) => {
  listeners.add(listener);
  listener(needRefresh);
  return () => {
    listeners.delete(listener);
  };
};

export const isApplyingPwaUpdate = () => applyingUpdate;

const readClientCount = (data: unknown): number | null => {
  if (typeof data === "object" && data !== null && "count" in data) {
    const { count } = data;
    if (typeof count === "number") return count;
  }
  return null;
};

// Asks the controlling service worker how many window clients are open.
// Resolves null when there is no controller or the SW predates the
// CLIENT_COUNT handler (the reply then never arrives and the timeout fires).
const countSwClients = (): Promise<number | null> => {
  const controller =
    typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? navigator.serviceWorker.controller
      : null;
  if (!controller) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), CLIENT_COUNT_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      clearTimeout(timer);
      resolve(readClientCount(event.data));
    };
    controller.postMessage({ type: "CLIENT_COUNT" }, [channel.port2]);
  });
};

const readAppVersion = (data: unknown): string | null => {
  if (typeof data === "object" && data !== null && "version" in data) {
    const { version } = data;
    if (typeof version === "string" && version) return version;
  }
  return null;
};

// Asks the pending worker which app version it carries. Resolves null when
// there is no pending worker, the browser exposes no registration, or the
// pending worker predates the APP_VERSION handler (the reply then never
// arrives and the timeout fires) — callers treat null as "assume a release".
const readPendingSwVersion = async (): Promise<string | null> => {
  const container =
    typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? navigator.serviceWorker
      : null;
  if (typeof container?.getRegistration !== "function") return null;
  const registration = await container.getRegistration();
  const pending = registration?.waiting ?? registration?.installing ?? null;
  if (!pending) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), APP_VERSION_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      clearTimeout(timer);
      resolve(readAppVersion(event.data));
    };
    pending.postMessage({ type: "APP_VERSION" }, [channel.port2]);
  });
};

// A rebuilt service worker means "the assets changed", not "the app was
// released". Any deploy rewrites the precache manifest, so without this check
// a same-version redeploy tells the user a new version is available and the
// version in Settings is identical after they accept it.
const isSameVersionRedeploy = async () => {
  const pendingVersion = await readPendingSwVersion();
  return pendingVersion !== null && pendingVersion === __APP_VERSION__;
};

// Hybrid update flow: a fresh, untouched, single-tab load applies a pending
// service worker update silently (one reload before the user does anything);
// a genuine new version otherwise falls back to the update banner. Auto-
// applying is skipped whenever other tabs are open because SKIP_WAITING
// reloads all of them. A same-version redeploy never prompts — the pending
// worker just activates on the next natural load, and the old assets it keeps
// serving until then are all still in its own precache.
export const handlePwaUpdateAvailable = async () => {
  const withinStartupWindow =
    Date.now() - appStartTime < STARTUP_AUTO_UPDATE_WINDOW_MS;
  if (withinStartupWindow && !userHasInteracted) {
    const clientCount = await countSwClients();
    if (clientCount === 1 && !userHasInteracted) {
      console.log("[linky][pwa] auto-applying update on fresh load");
      await applyPwaUpdate();
      return;
    }
  }
  if (await isSameVersionRedeploy()) {
    console.log(
      "[linky][pwa] pending worker is the running version, no prompt",
    );
    return;
  }
  markPwaNeedRefresh(true);
};

export const applyPwaUpdate = async () => {
  if (applyingUpdate) return;
  applyingUpdate = true;
  markPwaNeedRefresh(false);
  if (!updateSW) {
    reloadPage();
    return;
  }
  try {
    await updateSW(true);
    scheduleReloadFallback();
  } catch (error) {
    applyingUpdate = false;
    markPwaNeedRefresh(true);
    console.warn("[linky][pwa] updateSW failed", error);
    reloadPage();
  }
};
