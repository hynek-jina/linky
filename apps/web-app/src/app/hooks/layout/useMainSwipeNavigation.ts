import React from "react";
import { navigateTo } from "../../../hooks/useRouting";
import type { Route } from "../../../types/route";
import { mainSwipeProgressStore } from "../../lib/mainSwipeProgressStore";

interface UseMainSwipeNavigationParams {
  isMainSwipeRoute: boolean;
  mainSwipeRef: React.RefObject<HTMLDivElement | null>;
  mainSwipeScrollTimerRef: React.MutableRefObject<number | null>;
  routeKind: Route["kind"];
}

interface MainSwipeScrollable {
  clientWidth: number;
  scrollLeft: number;
  scrollTo: (options: { behavior: ScrollBehavior; left: number }) => void;
}

type MainSwipeTarget = "contacts" | "wallet";

const MAIN_SWIPE_SETTLE_FALLBACK_MS = 240;

const getMainSwipeTargetLeft = (
  width: number,
  target: MainSwipeTarget,
): number => (target === "wallet" && width > 0 ? width : 0);

export const getMainSwipeTargetForProgress = (
  progress: number,
): MainSwipeTarget => (progress > 0.5 ? "wallet" : "contacts");

const getMainSwipeProgress = (element: MainSwipeScrollable): number => {
  const width = element.clientWidth > 0 ? element.clientWidth : 1;
  return element.scrollLeft / width;
};

export const shouldDisableWalletReturnAnimation = (
  routeKind: Route["kind"],
  previousRouteKind: Route["kind"],
): boolean => routeKind === "wallet" && previousRouteKind !== "contacts";

const restoreScrollBehaviorNextFrame = (
  element: HTMLDivElement,
  mainSwipeRef: React.RefObject<HTMLDivElement | null>,
  scrollBehavior: string,
): (() => void) => {
  const frameId = window.requestAnimationFrame(() => {
    if (mainSwipeRef.current !== element) return;
    element.style.scrollBehavior = scrollBehavior;
  });

  return () => {
    window.cancelAnimationFrame(frameId);
    if (mainSwipeRef.current === element) {
      element.style.scrollBehavior = scrollBehavior;
    }
  };
};

export const alignMainSwipeToTarget = (
  element: MainSwipeScrollable,
  target: MainSwipeTarget,
  behavior: ScrollBehavior = "auto",
): void => {
  const width = element.clientWidth;
  if (target === "wallet" && width <= 0) return;

  const targetLeft = getMainSwipeTargetLeft(width, target);

  if (Math.abs(element.scrollLeft - targetLeft) <= 0.01) {
    return;
  }

  element.scrollTo({ left: targetLeft, behavior });
};

export const useMainSwipeNavigation = ({
  isMainSwipeRoute,
  mainSwipeRef,
  mainSwipeScrollTimerRef,
  routeKind,
}: UseMainSwipeNavigationParams) => {
  const previousRouteKindRef = React.useRef<Route["kind"]>(routeKind);
  const programmaticTargetRef = React.useRef<MainSwipeTarget | null>(null);
  const programmaticFrameRef = React.useRef<number | null>(null);
  const isDraggingRef = React.useRef(false);
  const touchActiveRef = React.useRef(false);

  const cancelProgrammaticFrame = React.useCallback(() => {
    if (programmaticFrameRef.current === null) return;
    window.cancelAnimationFrame(programmaticFrameRef.current);
    programmaticFrameRef.current = null;
  }, []);

  const clearMainSwipeScrollTimer = React.useCallback(() => {
    if (mainSwipeScrollTimerRef.current === null) return;
    window.clearTimeout(mainSwipeScrollTimerRef.current);
    mainSwipeScrollTimerRef.current = null;
  }, [mainSwipeScrollTimerRef]);

  const stopInteractiveState = React.useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const finishProgrammaticScroll = React.useCallback(
    (target: MainSwipeTarget, shouldNavigate: boolean) => {
      cancelProgrammaticFrame();
      programmaticTargetRef.current = null;
      stopInteractiveState();

      const element = mainSwipeRef.current;
      if (element) {
        alignMainSwipeToTarget(element, target, "auto");
      }
      mainSwipeProgressStore.set({
        progress: target === "wallet" ? 1 : 0,
      });

      if (shouldNavigate && target !== routeKind) {
        navigateTo({ route: target });
      }
    },
    [cancelProgrammaticFrame, mainSwipeRef, routeKind, stopInteractiveState],
  );

  const trackProgrammaticScroll = React.useCallback(
    (target: MainSwipeTarget, shouldNavigate: boolean) => {
      cancelProgrammaticFrame();

      const tick = () => {
        const element = mainSwipeRef.current;
        if (!element) {
          finishProgrammaticScroll(target, shouldNavigate);
          return;
        }

        const width = element.clientWidth || 1;
        const targetLeft = getMainSwipeTargetLeft(width, target);

        if (Math.abs(element.scrollLeft - targetLeft) <= 1) {
          finishProgrammaticScroll(target, shouldNavigate);
          return;
        }

        programmaticFrameRef.current = window.requestAnimationFrame(tick);
      };

      programmaticFrameRef.current = window.requestAnimationFrame(tick);
    },
    [cancelProgrammaticFrame, finishProgrammaticScroll, mainSwipeRef],
  );

  const commitMainSwipe = React.useCallback(
    (target: MainSwipeTarget) => {
      clearMainSwipeScrollTimer();

      const element = mainSwipeRef.current;
      if (!element) {
        finishProgrammaticScroll(target, true);
        return;
      }

      const targetLeft = getMainSwipeTargetLeft(
        element.clientWidth || 1,
        target,
      );
      if (Math.abs(element.scrollLeft - targetLeft) <= 1) {
        finishProgrammaticScroll(target, true);
        return;
      }

      stopInteractiveState();
      programmaticTargetRef.current = target;
      mainSwipeProgressStore.set({
        progress: target === "wallet" ? 1 : 0,
      });
      alignMainSwipeToTarget(element, target, "smooth");
      trackProgrammaticScroll(target, true);
    },
    [
      clearMainSwipeScrollTimer,
      finishProgrammaticScroll,
      mainSwipeRef,
      stopInteractiveState,
      trackProgrammaticScroll,
    ],
  );

  const finishNativeScroll = React.useCallback(() => {
    clearMainSwipeScrollTimer();
    if (programmaticTargetRef.current !== null) return;

    const element = mainSwipeRef.current;
    if (!element) {
      stopInteractiveState();
      return;
    }

    const progress = getMainSwipeProgress(element);
    const target = getMainSwipeTargetForProgress(progress);
    isDraggingRef.current = false;
    mainSwipeProgressStore.set({
      progress: target === "wallet" ? 1 : 0,
    });

    if (target !== routeKind) {
      navigateTo({ route: target });
    }
  }, [
    clearMainSwipeScrollTimer,
    mainSwipeRef,
    routeKind,
    stopInteractiveState,
  ]);

  const scheduleNativeScrollFinish = React.useCallback(() => {
    clearMainSwipeScrollTimer();
    mainSwipeScrollTimerRef.current = window.setTimeout(() => {
      mainSwipeScrollTimerRef.current = null;
      finishNativeScroll();
    }, MAIN_SWIPE_SETTLE_FALLBACK_MS);
  }, [clearMainSwipeScrollTimer, finishNativeScroll, mainSwipeScrollTimerRef]);

  React.useLayoutEffect(() => {
    if (!isMainSwipeRoute) return;
    const element = mainSwipeRef.current;
    if (!element) return;

    const previousRouteKind = previousRouteKindRef.current;
    const disableSmoothAlignment = shouldDisableWalletReturnAnimation(
      routeKind,
      previousRouteKind,
    );
    const previousScrollBehavior = element.style.scrollBehavior;

    if (disableSmoothAlignment) {
      element.style.scrollBehavior = "auto";
    }

    const target = routeKind === "wallet" ? "wallet" : "contacts";
    const syncMainSwipeToRoute = () => {
      if (mainSwipeRef.current !== element) return;
      alignMainSwipeToTarget(element, target);
      isDraggingRef.current = false;
      mainSwipeProgressStore.set({
        progress: target === "wallet" ? 1 : 0,
      });
    };

    cancelProgrammaticFrame();
    programmaticTargetRef.current = null;
    syncMainSwipeToRoute();

    const syncFrame = window.requestAnimationFrame(() => {
      syncMainSwipeToRoute();
    });

    let resizeObserver: ResizeObserver | null = null;
    let removeResizeListener: (() => void) | null = null;

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncMainSwipeToRoute);
      removeResizeListener = () => {
        window.removeEventListener("resize", syncMainSwipeToRoute);
      };
    } else {
      resizeObserver = new ResizeObserver(() => {
        syncMainSwipeToRoute();
      });
      resizeObserver.observe(element);
    }

    const restoreScrollBehavior = disableSmoothAlignment
      ? restoreScrollBehaviorNextFrame(
          element,
          mainSwipeRef,
          previousScrollBehavior,
        )
      : null;

    return () => {
      window.cancelAnimationFrame(syncFrame);
      resizeObserver?.disconnect();
      removeResizeListener?.();
      restoreScrollBehavior?.();
    };
  }, [cancelProgrammaticFrame, isMainSwipeRoute, mainSwipeRef, routeKind]);

  React.useEffect(() => {
    previousRouteKindRef.current = routeKind;
  }, [routeKind]);

  React.useEffect(() => {
    if (isMainSwipeRoute) return;
    cancelProgrammaticFrame();
    programmaticTargetRef.current = null;
    clearMainSwipeScrollTimer();
    stopInteractiveState();
  }, [
    cancelProgrammaticFrame,
    clearMainSwipeScrollTimer,
    isMainSwipeRoute,
    stopInteractiveState,
  ]);

  React.useEffect(() => {
    if (!isMainSwipeRoute) return;
    const element = mainSwipeRef.current;
    if (!element) return;
    const supportsScrollEnd = "onscrollend" in element;

    const markTouchActive = () => {
      touchActiveRef.current = true;
      clearMainSwipeScrollTimer();
    };
    const markTouchInactive = () => {
      touchActiveRef.current = false;
      if (isDraggingRef.current && !supportsScrollEnd) {
        scheduleNativeScrollFinish();
      }
    };
    const finishScroll = () => {
      if (!touchActiveRef.current) {
        finishNativeScroll();
      }
    };
    // Keep WebKit's native scroll/compositing path free of per-frame React
    // work. The tab indicator and FAB update once when the swipe settles.
    const handleScroll = () => {
      if (programmaticTargetRef.current !== null) return;

      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
      }

      if (!touchActiveRef.current && !supportsScrollEnd) {
        scheduleNativeScrollFinish();
      }
    };

    element.addEventListener("touchstart", markTouchActive, {
      passive: true,
    });
    element.addEventListener("touchend", markTouchInactive, { passive: true });
    element.addEventListener("touchcancel", markTouchInactive, {
      passive: true,
    });
    element.addEventListener("scroll", handleScroll, { passive: true });
    element.addEventListener("scrollend", finishScroll, { passive: true });

    return () => {
      element.removeEventListener("touchstart", markTouchActive);
      element.removeEventListener("touchend", markTouchInactive);
      element.removeEventListener("touchcancel", markTouchInactive);
      element.removeEventListener("scroll", handleScroll);
      element.removeEventListener("scrollend", finishScroll);
    };
  }, [
    clearMainSwipeScrollTimer,
    finishNativeScroll,
    isMainSwipeRoute,
    mainSwipeRef,
    scheduleNativeScrollFinish,
  ]);

  React.useEffect(
    () => () => {
      cancelProgrammaticFrame();
      clearMainSwipeScrollTimer();
    },
    [cancelProgrammaticFrame, clearMainSwipeScrollTimer],
  );

  return { commitMainSwipe };
};
