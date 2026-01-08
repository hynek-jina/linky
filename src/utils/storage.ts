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
