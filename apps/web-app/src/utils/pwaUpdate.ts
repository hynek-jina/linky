type Listener = (needRefresh: boolean) => void;

const listeners = new Set<Listener>();
let needRefresh = false;
let applyingUpdate = false;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

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
