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

const getMainSwipeTargetLeft = (
  width: number,
  target: MainSwipeTarget,
): number => (target === "wallet" ? width : 0);

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

  const cancelProgrammaticFrame = React.useCallback(() => {
    if (programmaticFrameRef.current === null) return;
    window.cancelAnimationFrame(programmaticFrameRef.current);
    programmaticFrameRef.current = null;
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
      if (mainSwipeScrollTimerRef.current !== null) {
        window.clearTimeout(mainSwipeScrollTimerRef.current);
        mainSwipeScrollTimerRef.current = null;
      }

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
      finishProgrammaticScroll,
      mainSwipeRef,
      mainSwipeScrollTimerRef,
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
    if (mainSwipeScrollTimerRef.current === null) return;

    window.clearTimeout(mainSwipeScrollTimerRef.current);
    mainSwipeScrollTimerRef.current = null;
    stopInteractiveState();
  }, [
    cancelProgrammaticFrame,
    isMainSwipeRoute,
    mainSwipeScrollTimerRef,
    stopInteractiveState,
  ]);

  React.useEffect(
    () => () => {
      cancelProgrammaticFrame();
    },
    [cancelProgrammaticFrame],
  );

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

        if (mainSwipeScrollTimerRef.current !== null) {
          window.clearTimeout(mainSwipeScrollTimerRef.current);
        }

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
    handleMainSwipeScroll,
  };
};
