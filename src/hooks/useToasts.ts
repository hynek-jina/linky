import { useState, useCallback, useRef, useEffect } from "react";

export const useToasts = () => {
  const [toasts, setToasts] = useState<Array<{ id: string; message: string }>>(
    []
  );
  const toastTimersRef = useRef<Map<string, number>>(new Map());

  const pushToast = useCallback((message: string) => {
    const text = String(message ?? "").trim();
    if (!text) return;

    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, message: text }]);

    const timeoutId = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimersRef.current.delete(id);
    }, 2500);

    toastTimersRef.current.set(id, timeoutId);
  }, []);

  useEffect(() => {
    const toastTimers = toastTimersRef.current;
    return () => {
      for (const timeoutId of toastTimers.values()) {
        try {
          window.clearTimeout(timeoutId);
        } catch {
          // ignore
        }
      }
      toastTimers.clear();
    };
  }, []);

  return { toasts, pushToast };
};
