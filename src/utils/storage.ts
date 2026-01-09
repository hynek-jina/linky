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

// Onboarding localStorage keys
export const ONBOARDING_COMPLETED_KEY = "linky.onboarding_completed";
export const ONBOARDING_DEMO_ADDED_KEY = "linky.demo_added";
