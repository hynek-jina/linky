import { useEffect } from "react";

/**
 * Helper hook for one-time initialization effects.
 * Use this instead of useEffect when you want to run code only once on mount.
 */
export const useInit = (callback: () => void | (() => void)) => {
  useEffect(() => {
    return callback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
