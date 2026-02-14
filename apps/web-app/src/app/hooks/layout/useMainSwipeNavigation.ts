import React from "react";
import { navigateTo } from "../../../hooks/useRouting";
import type { Route } from "../../../types/route";

interface UseMainSwipeNavigationParams {
  isMainSwipeRoute: boolean;
  mainSwipeProgressRef: React.MutableRefObject<number>;
  mainSwipeRef: React.RefObject<HTMLDivElement | null>;
  mainSwipeScrollTimerRef: React.MutableRefObject<number | null>;
  routeKind: Route["kind"];
  setMainSwipeProgress: React.Dispatch<React.SetStateAction<number>>;
}

export const useMainSwipeNavigation = ({
  isMainSwipeRoute,
  mainSwipeProgressRef,
  mainSwipeRef,
  mainSwipeScrollTimerRef,
  routeKind,
  setMainSwipeProgress,
}: UseMainSwipeNavigationParams) => {
  const updateMainSwipeProgress = React.useCallback(
    (value: number) => {
      const clamped = Math.min(1, Math.max(0, value));
      mainSwipeProgressRef.current = clamped;
      setMainSwipeProgress(clamped);
    },
    [mainSwipeProgressRef, setMainSwipeProgress],
  );

  const commitMainSwipe = React.useCallback(
    (target: "contacts" | "wallet") => {
      updateMainSwipeProgress(target === "wallet" ? 1 : 0);
      if (target !== routeKind) {
        navigateTo({ route: target });
      }
    },
    [routeKind, updateMainSwipeProgress],
  );

  React.useEffect(() => {
    if (!isMainSwipeRoute) return;
    const element = mainSwipeRef.current;
    if (!element) return;

    const width = element.clientWidth || 1;
    const targetLeft = routeKind === "wallet" ? width : 0;
    if (Math.abs(element.scrollLeft - targetLeft) > 1) {
      element.scrollTo({ left: targetLeft, behavior: "auto" });
    }

    updateMainSwipeProgress(routeKind === "wallet" ? 1 : 0);
  }, [isMainSwipeRoute, mainSwipeRef, routeKind, updateMainSwipeProgress]);

  React.useEffect(() => {
    if (isMainSwipeRoute) return;
    if (mainSwipeScrollTimerRef.current === null) return;

    window.clearTimeout(mainSwipeScrollTimerRef.current);
    mainSwipeScrollTimerRef.current = null;
  }, [isMainSwipeRoute, mainSwipeScrollTimerRef]);

  const handleMainSwipeScroll = isMainSwipeRoute
    ? (event: React.UIEvent<HTMLDivElement>) => {
        const element = event.currentTarget;
        const width = element.clientWidth || 1;
        const progress = element.scrollLeft / width;
        updateMainSwipeProgress(progress);

        if (mainSwipeScrollTimerRef.current !== null) {
          window.clearTimeout(mainSwipeScrollTimerRef.current);
        }

        mainSwipeScrollTimerRef.current = window.setTimeout(() => {
          mainSwipeScrollTimerRef.current = null;
          const current = mainSwipeProgressRef.current;
          commitMainSwipe(current > 0.5 ? "wallet" : "contacts");
        }, 140);
      }
    : undefined;

  return {
    handleMainSwipeScroll,
  };
};
