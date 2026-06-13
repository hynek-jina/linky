import { useState, useCallback, useRef, useEffect } from "react";

export interface Toast {
  id: string;
  message: string;
  onClick?: () => void;
}

export interface PushToastOptions {
  onClick?: () => void;
}

export const useToasts = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimersRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timeoutId = toastTimersRef.current.get(id);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      toastTimersRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (message: string, options?: PushToastOptions) => {
      const text = String(message ?? "").trim();
      if (!text) return;

      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      setToasts((prev) => [
        ...prev,
        {
          id,
          message: text,
          ...(options?.onClick ? { onClick: options.onClick } : {}),
        },
      ]);

      const timeoutId = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        toastTimersRef.current.delete(id);
      }, 2500);

      toastTimersRef.current.set(id, timeoutId);
    },
    [],
  );

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

  return { dismissToast, toasts, pushToast };
};
