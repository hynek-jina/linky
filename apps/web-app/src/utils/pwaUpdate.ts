type Listener = (needRefresh: boolean) => void;

const listeners = new Set<Listener>();
let needRefresh = false;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

export const recordPwaRegistered = (
  fn: ((reloadPage?: boolean) => Promise<void>) | null,
) => {
  updateSW = fn;
};

export const markPwaNeedRefresh = (value: boolean) => {
  if (needRefresh === value) return;
  needRefresh = value;
  for (const listener of listeners) {
    listener(value);
  }
};

export const subscribePwaNeedRefresh = (listener: Listener) => {
  listeners.add(listener);
  listener(needRefresh);
  return () => {
    listeners.delete(listener);
  };
};

export const applyPwaUpdate = async () => {
  if (!updateSW) {
    if (typeof location !== "undefined") {
      location.reload();
    }
    return;
  }
  try {
    await updateSW(true);
  } catch (error) {
    console.warn("[linky][pwa] updateSW failed", error);
    if (typeof location !== "undefined") {
      location.reload();
    }
  }
};
