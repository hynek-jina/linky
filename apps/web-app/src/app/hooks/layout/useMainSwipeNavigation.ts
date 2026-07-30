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

const getMainSwipeTargetLeft = (
  width: number,
  target: MainSwipeTarget,
): number => (target === "wallet" && width > 0 ? width : 0);

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
  const swipeStartWindowScrollYRef = React.useRef<number | null>(null);
  const swipeWindowScrollLockedRef = React.useRef(false);

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

  const updateMainSwipeProgress = React.useCallback((value: number) => {
    mainSwipeProgressStore.setProgress(value);
  }, []);

  const releaseWindowScrollLock = React.useCallback(() => {
    document.documentElement.classList.remove("is-main-swipe-dragging");
    const scrollY = swipeStartWindowScrollYRef.current;
    swipeWindowScrollLockedRef.current = false;
    swipeStartWindowScrollYRef.current = null;

    if (scrollY === null) return;
    try {
      window.scrollTo(window.scrollX, scrollY);
    } catch {
      // ignore
    }
  }, []);

  const lockWindowScrollForSwipe = React.useCallback(() => {
    if (typeof document === "undefined") return;

    const scrollY =
      swipeStartWindowScrollYRef.current ??
      Math.max(
        window.scrollY,
        window.pageYOffset,
        document.documentElement.scrollTop,
        document.body.scrollTop,
      );
    swipeStartWindowScrollYRef.current = scrollY;
    if (!swipeWindowScrollLockedRef.current) {
      swipeWindowScrollLockedRef.current = true;
      document.documentElement.classList.add("is-main-swipe-dragging");
    }
    try {
      window.scrollTo(window.scrollX, scrollY);
    } catch {
      // ignore
    }
  }, []);

  const stopInteractiveState = React.useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
    }
    mainSwipeProgressStore.setDragging(false);
  }, []);

  const finishProgrammaticScroll = React.useCallback(
    (target: MainSwipeTarget, shouldNavigate: boolean) => {
      cancelProgrammaticFrame();
      programmaticTargetRef.current = null;
      stopInteractiveState();
      releaseWindowScrollLock();

      const element = mainSwipeRef.current;
      if (element) {
        alignMainSwipeToTarget(element, target, "auto");
        updateMainSwipeProgress(getMainSwipeProgress(element));
      } else {
        updateMainSwipeProgress(target === "wallet" ? 1 : 0);
      }

      if (shouldNavigate && target !== routeKind) {
        navigateTo({ route: target });
      }
    },
    [
      cancelProgrammaticFrame,
      mainSwipeRef,
      releaseWindowScrollLock,
      routeKind,
      stopInteractiveState,
      updateMainSwipeProgress,
    ],
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
        updateMainSwipeProgress(getMainSwipeProgress(element));

        if (Math.abs(element.scrollLeft - targetLeft) <= 1) {
          finishProgrammaticScroll(target, shouldNavigate);
          return;
        }

        programmaticFrameRef.current = window.requestAnimationFrame(tick);
      };

      programmaticFrameRef.current = window.requestAnimationFrame(tick);
    },
    [
      cancelProgrammaticFrame,
      finishProgrammaticScroll,
      mainSwipeRef,
      updateMainSwipeProgress,
    ],
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
      mainSwipeProgressStore.setDragging(true);
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
      releaseWindowScrollLock();
      alignMainSwipeToTarget(element, target);
      updateMainSwipeProgress(target === "wallet" ? 1 : 0);
      stopInteractiveState();
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
  }, [
    cancelProgrammaticFrame,
    isMainSwipeRoute,
    mainSwipeRef,
    routeKind,
    releaseWindowScrollLock,
    stopInteractiveState,
    updateMainSwipeProgress,
  ]);

  React.useEffect(() => {
    previousRouteKindRef.current = routeKind;
  }, [routeKind]);

  React.useEffect(() => {
    if (isMainSwipeRoute) return;
    cancelProgrammaticFrame();
    programmaticTargetRef.current = null;
    clearMainSwipeScrollTimer();
    stopInteractiveState();
    releaseWindowScrollLock();
  }, [
    cancelProgrammaticFrame,
    clearMainSwipeScrollTimer,
    isMainSwipeRoute,
    releaseWindowScrollLock,
    stopInteractiveState,
  ]);

  React.useEffect(() => {
    if (!isMainSwipeRoute) return;
    const element = mainSwipeRef.current;
    if (!element) return;

    const rememberWindowScroll = () => {
      touchActiveRef.current = true;
      swipeStartWindowScrollYRef.current = Math.max(
        window.scrollY,
        window.pageYOffset,
        document.documentElement.scrollTop,
        document.body.scrollTop,
      );
    };
    const forgetWindowScroll = () => {
      touchActiveRef.current = false;
      if (!swipeWindowScrollLockedRef.current) {
        swipeStartWindowScrollYRef.current = null;
      }
    };

    element.addEventListener("touchstart", rememberWindowScroll, {
      passive: true,
    });
    element.addEventListener("touchend", forgetWindowScroll, { passive: true });
    element.addEventListener("touchcancel", forgetWindowScroll, {
      passive: true,
    });

    return () => {
      element.removeEventListener("touchstart", rememberWindowScroll);
      element.removeEventListener("touchend", forgetWindowScroll);
      element.removeEventListener("touchcancel", forgetWindowScroll);
    };
  }, [isMainSwipeRoute, mainSwipeRef]);

  React.useEffect(
    () => () => {
      cancelProgrammaticFrame();
      clearMainSwipeScrollTimer();
      releaseWindowScrollLock();
    },
    [
      cancelProgrammaticFrame,
      clearMainSwipeScrollTimer,
      releaseWindowScrollLock,
    ],
  );

  const handleMainSwipeScroll = React.useMemo(
    () =>
      isMainSwipeRoute
        ? (event: React.UIEvent<HTMLDivElement>) => {
            const element = event.currentTarget;
            const progress = getMainSwipeProgress(element);

            if (programmaticTargetRef.current !== null) {
              updateMainSwipeProgress(progress);
              return;
            }

            if (touchActiveRef.current) {
              lockWindowScrollForSwipe();
            }

            if (!isDraggingRef.current) {
              isDraggingRef.current = true;
              mainSwipeProgressStore.setDragging(true);
            }

            updateMainSwipeProgress(progress);

            clearMainSwipeScrollTimer();

            mainSwipeScrollTimerRef.current = window.setTimeout(() => {
              mainSwipeScrollTimerRef.current = null;
              const current = mainSwipeProgressStore.get().progress;
              isDraggingRef.current = false;
              mainSwipeProgressStore.setDragging(false);
              commitMainSwipe(current > 0.5 ? "wallet" : "contacts");
            }, 140);
          }
        : undefined,
    [
      clearMainSwipeScrollTimer,
      commitMainSwipe,
      isMainSwipeRoute,
      lockWindowScrollForSwipe,
      mainSwipeScrollTimerRef,
      updateMainSwipeProgress,
    ],
  );

  return {
    commitMainSwipe,
    handleMainSwipeScroll,
  };
};
