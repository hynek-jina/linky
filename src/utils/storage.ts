export const safeLocalStorageGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const safeLocalStorageSet = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

export const safeLocalStorageRemove = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

export const safeLocalStorageGetJson = <T>(key: string, fallback: T): T => {
  const raw = safeLocalStorageGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const safeLocalStorageSetJson = (key: string, value: unknown): void => {
  try {
    safeLocalStorageSet(key, JSON.stringify(value));
  } catch {
    // ignore
  }
};
