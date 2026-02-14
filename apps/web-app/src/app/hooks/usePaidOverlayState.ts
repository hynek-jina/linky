import React from "react";
import { useInit } from "../../hooks/useInit";

interface UsePaidOverlayStateParams {
  t: (key: string) => string;
}

interface UsePaidOverlayStateResult {
  paidOverlayIsOpen: boolean;
  paidOverlayTitle: string | null;
  showPaidOverlay: (title?: string) => void;
  topupPaidNavTimerRef: React.MutableRefObject<number | null>;
}

export const usePaidOverlayState = ({
  t,
}: UsePaidOverlayStateParams): UsePaidOverlayStateResult => {
  const [paidOverlayIsOpen, setPaidOverlayIsOpen] = React.useState(false);
  const [paidOverlayTitle, setPaidOverlayTitle] = React.useState<string | null>(
    null,
  );
  const paidOverlayTimerRef = React.useRef<number | null>(null);
  const topupPaidNavTimerRef = React.useRef<number | null>(null);

  useInit(() => {
    const paidTimerRef = paidOverlayTimerRef;
    const topupNavTimerRef = topupPaidNavTimerRef;
    return () => {
      if (paidTimerRef.current !== null) {
        try {
          window.clearTimeout(paidTimerRef.current);
        } catch {
          // ignore
        }
      }
      paidTimerRef.current = null;

      if (topupNavTimerRef.current !== null) {
        try {
          window.clearTimeout(topupNavTimerRef.current);
        } catch {
          // ignore
        }
      }
      topupNavTimerRef.current = null;
    };
  });

  const showPaidOverlay = React.useCallback(
    (title?: string) => {
      const resolved = title ?? t("paid");
      setPaidOverlayTitle(resolved);
      setPaidOverlayIsOpen(true);
      if (paidOverlayTimerRef.current !== null) {
        try {
          window.clearTimeout(paidOverlayTimerRef.current);
        } catch {
          // ignore
        }
      }
      paidOverlayTimerRef.current = window.setTimeout(() => {
        setPaidOverlayIsOpen(false);
        paidOverlayTimerRef.current = null;
      }, 3000);
    },
    [t],
  );

  return {
    paidOverlayIsOpen,
    paidOverlayTitle,
    showPaidOverlay,
    topupPaidNavTimerRef,
  };
};
