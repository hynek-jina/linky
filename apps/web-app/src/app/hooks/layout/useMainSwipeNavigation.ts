import React from "react";
import { navigateTo } from "../../../hooks/useRouting";
import type { Route } from "../../../types/route";

interface UseMainSwipeNavigationParams {
  isMainSwipeRoute: boolean;
  mainSwipeProgressRef: React.MutableRefObject<number>;
  mainSwipeRef: React.RefObject<HTMLDivElement | null>;
  mainSwipeScrollTimerRef: React.MutableRefObject<number | null>;
  routeKind: Route["kind"];
  setIsMainSwipeDragging: React.Dispatch<React.SetStateAction<boolean>>;
  setMainSwipeProgress: React.Dispatch<React.SetStateAction<number>>;
}

interface MainSwipeScrollable {
  clientWidth: number;
  scrollLeft: number;
  scrollTo: (options: { behavior: ScrollBehavior; left: number }) => void;
}

type MainSwipeTarget = "contacts" | "wallet";

type MainSwipeGestureDecision = "lock" | "wait";

interface MainSwipePointerState {
  activePointerId: number | null;
  didLockHorizontally: boolean;
  startScrollLeft: number;
  startX: number;
  startY: number;
}

const MAIN_SWIPE_DIRECTION_LOCK_PX = 12;

const createMainSwipePointerState = (): MainSwipePointerState => ({
  activePointerId: null,
  didLockHorizontally: false,
  startScrollLeft: 0,
  startX: 0,
  startY: 0,
});

const getMainSwipeTargetLeft = (
  width: number,
  target: MainSwipeTarget,
): number => (target === "wallet" ? width : 0);

export const isAllowedMainSwipeDrag = (
  routeKind: Route["kind"],
  deltaX: number,
): boolean => {
  if (routeKind === "contacts") {
    return deltaX < 0;
  }

  if (routeKind === "wallet") {
    return deltaX > 0;
  }

  return false;
};

export const clampMainSwipeLeft = (left: number, width: number): number =>
  Math.min(Math.max(left, 0), width);

export const getMainSwipeGestureDecision = (
  routeKind: Route["kind"],
  deltaX: number,
  deltaY: number,
): MainSwipeGestureDecision => {
  if (
    Math.abs(deltaX) < MAIN_SWIPE_DIRECTION_LOCK_PX &&
    Math.abs(deltaY) < MAIN_SWIPE_DIRECTION_LOCK_PX
  ) {
    return "wait";
  }

  if (Math.abs(deltaY) >= Math.abs(deltaX)) {
    return "wait";
  }

  if (!isAllowedMainSwipeDrag(routeKind, deltaX)) {
    return "wait";
  }

  return "lock";
};

const getMainSwipeProgress = (element: MainSwipeScrollable): number => {
  const width = element.clientWidth || 1;
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
  const width = element.clientWidth || 1;
  const targetLeft = getMainSwipeTargetLeft(width, target);

  if (Math.abs(element.scrollLeft - targetLeft) <= 0.01) {
    return;
  }

  element.scrollTo({ left: targetLeft, behavior });
};

export const useMainSwipeNavigation = ({
  isMainSwipeRoute,
  mainSwipeProgressRef,
  mainSwipeRef,
  mainSwipeScrollTimerRef,
  routeKind,
  setIsMainSwipeDragging,
  setMainSwipeProgress,
}: UseMainSwipeNavigationParams) => {
  const previousRouteKindRef = React.useRef<Route["kind"]>(routeKind);
  const programmaticTargetRef = React.useRef<MainSwipeTarget | null>(null);
  const programmaticFrameRef = React.useRef<number | null>(null);
  const isDraggingRef = React.useRef(false);
  const pointerStateRef = React.useRef<MainSwipePointerState>(
    createMainSwipePointerState(),
  );

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

  const resetPointerState = React.useCallback(() => {
    pointerStateRef.current = createMainSwipePointerState();
  }, []);

  const updateMainSwipeProgress = React.useCallback(
    (value: number) => {
      const clamped = Math.min(1, Math.max(0, value));
      mainSwipeProgressRef.current = clamped;
      setMainSwipeProgress(clamped);
    },
    [mainSwipeProgressRef, setMainSwipeProgress],
  );

  const stopInteractiveState = React.useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
    }
    setIsMainSwipeDragging(false);
  }, [setIsMainSwipeDragging]);

  const finishProgrammaticScroll = React.useCallback(
    (target: MainSwipeTarget, shouldNavigate: boolean) => {
      cancelProgrammaticFrame();
      programmaticTargetRef.current = null;
      stopInteractiveState();

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
      setIsMainSwipeDragging(true);
      alignMainSwipeToTarget(element, target, "smooth");
      trackProgrammaticScroll(target, true);
    },
    [
      clearMainSwipeScrollTimer,
      finishProgrammaticScroll,
      mainSwipeRef,
      setIsMainSwipeDragging,
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

    cancelProgrammaticFrame();
    programmaticTargetRef.current = null;
    alignMainSwipeToTarget(
      element,
      routeKind === "wallet" ? "wallet" : "contacts",
    );

    updateMainSwipeProgress(routeKind === "wallet" ? 1 : 0);
    stopInteractiveState();
    resetPointerState();

    if (!disableSmoothAlignment) return;

    const restoreScrollBehavior = restoreScrollBehaviorNextFrame(
      element,
      mainSwipeRef,
      previousScrollBehavior,
    );

    return () => {
      restoreScrollBehavior();
    };
  }, [
    cancelProgrammaticFrame,
    isMainSwipeRoute,
    mainSwipeRef,
    resetPointerState,
    routeKind,
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
    resetPointerState();
    stopInteractiveState();
  }, [
    cancelProgrammaticFrame,
    clearMainSwipeScrollTimer,
    isMainSwipeRoute,
    resetPointerState,
    stopInteractiveState,
  ]);

  React.useEffect(
    () => () => {
      cancelProgrammaticFrame();
      clearMainSwipeScrollTimer();
      resetPointerState();
    },
    [cancelProgrammaticFrame, clearMainSwipeScrollTimer, resetPointerState],
  );

  const handleMainSwipePointerDown = isMainSwipeRoute
    ? (event: React.PointerEvent<HTMLDivElement>) => {
        if (!event.isPrimary || event.pointerType === "mouse") {
          return;
        }

        const element = mainSwipeRef.current;
        pointerStateRef.current = {
          activePointerId: event.pointerId,
          didLockHorizontally: false,
          startScrollLeft: element?.scrollLeft ?? 0,
          startX: event.clientX,
          startY: event.clientY,
        };
      }
    : undefined;

  const handleMainSwipePointerMove = isMainSwipeRoute
    ? (event: React.PointerEvent<HTMLDivElement>) => {
        const pointerState = pointerStateRef.current;
        if (pointerState.activePointerId !== event.pointerId) {
          return;
        }

        const element = mainSwipeRef.current;
        if (!element) {
          return;
        }

        const deltaX = event.clientX - pointerState.startX;
        const deltaY = event.clientY - pointerState.startY;

        if (!pointerState.didLockHorizontally) {
          if (
            getMainSwipeGestureDecision(routeKind, deltaX, deltaY) !== "lock"
          ) {
            return;
          }

          pointerState.didLockHorizontally = true;
          cancelProgrammaticFrame();
          clearMainSwipeScrollTimer();

          if (!isDraggingRef.current) {
            isDraggingRef.current = true;
            setIsMainSwipeDragging(true);
          }

          if (typeof element.setPointerCapture === "function") {
            try {
              element.setPointerCapture(event.pointerId);
            } catch {
              // Some mobile browsers reject pointer capture during touch panning.
            }
          }
        }

        event.preventDefault();

        const width = element.clientWidth || 1;
        element.scrollLeft = clampMainSwipeLeft(
          pointerState.startScrollLeft - deltaX,
          width,
        );
        updateMainSwipeProgress(getMainSwipeProgress(element));
      }
    : undefined;

  const handleMainSwipePointerRelease = isMainSwipeRoute
    ? (event: React.PointerEvent<HTMLDivElement>) => {
        const pointerState = pointerStateRef.current;
        if (pointerState.activePointerId !== event.pointerId) {
          return;
        }

        const didLockHorizontally = pointerState.didLockHorizontally;
        resetPointerState();

        if (!didLockHorizontally) {
          return;
        }

        if (
          typeof event.currentTarget.hasPointerCapture === "function" &&
          event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {
            // Ignore browsers that drop capture before pointerup/cancel.
          }
        }

        clearMainSwipeScrollTimer();
        commitMainSwipe(
          mainSwipeProgressRef.current > 0.5 ? "wallet" : "contacts",
        );
      }
    : undefined;

  const handleMainSwipeScroll = isMainSwipeRoute
    ? (event: React.UIEvent<HTMLDivElement>) => {
        const element = event.currentTarget;
        const progress = getMainSwipeProgress(element);

        if (programmaticTargetRef.current !== null) {
          updateMainSwipeProgress(progress);
          return;
        }

        if (!isDraggingRef.current) {
          isDraggingRef.current = true;
          setIsMainSwipeDragging(true);
        }

        updateMainSwipeProgress(progress);

        clearMainSwipeScrollTimer();

        mainSwipeScrollTimerRef.current = window.setTimeout(() => {
          mainSwipeScrollTimerRef.current = null;
          const current = mainSwipeProgressRef.current;
          isDraggingRef.current = false;
          setIsMainSwipeDragging(false);
          commitMainSwipe(current > 0.5 ? "wallet" : "contacts");
        }, 140);
      }
    : undefined;

  return {
    commitMainSwipe,
    handleMainSwipePointerCancel: handleMainSwipePointerRelease,
    handleMainSwipePointerDown,
    handleMainSwipePointerMove,
    handleMainSwipePointerUp: handleMainSwipePointerRelease,
    handleMainSwipeScroll,
  };
};
