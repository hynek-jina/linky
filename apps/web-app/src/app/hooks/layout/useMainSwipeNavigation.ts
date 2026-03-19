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

interface MainSwipeScrollable {
  clientWidth: number;
  scrollLeft: number;
  scrollTo: (options: { behavior: ScrollBehavior; left: number }) => void;
}

const ROUTES_WITHOUT_WALLET_RETURN_ANIMATION = new Set<Route["kind"]>([
  "cashuTokenNew",
  "cashuToken",
  "topup",
  "topupInvoice",
]);

const getMainSwipeTargetLeft = (
  width: number,
  target: "contacts" | "wallet",
): number => (target === "wallet" ? width : 0);

const shouldDisableWalletReturnAnimation = (
  routeKind: Route["kind"],
  previousRouteKind: Route["kind"],
): boolean =>
  routeKind === "wallet" &&
  ROUTES_WITHOUT_WALLET_RETURN_ANIMATION.has(previousRouteKind);

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
  target: "contacts" | "wallet",
): void => {
  const width = element.clientWidth || 1;
  const targetLeft = getMainSwipeTargetLeft(width, target);

  if (Math.abs(element.scrollLeft - targetLeft) <= 0.01) {
    return;
  }

  element.scrollTo({ left: targetLeft, behavior: "auto" });
};

export const useMainSwipeNavigation = ({
  isMainSwipeRoute,
  mainSwipeProgressRef,
  mainSwipeRef,
  mainSwipeScrollTimerRef,
  routeKind,
  setMainSwipeProgress,
}: UseMainSwipeNavigationParams) => {
  const previousRouteKindRef = React.useRef<Route["kind"]>(routeKind);

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
      const element = mainSwipeRef.current;
      if (element) {
        alignMainSwipeToTarget(element, target);
      }
      if (target !== routeKind) {
        navigateTo({ route: target });
      }
    },
    [mainSwipeRef, routeKind, updateMainSwipeProgress],
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

    alignMainSwipeToTarget(
      element,
      routeKind === "wallet" ? "wallet" : "contacts",
    );

    updateMainSwipeProgress(routeKind === "wallet" ? 1 : 0);

    if (!disableSmoothAlignment) return;

    return restoreScrollBehaviorNextFrame(
      element,
      mainSwipeRef,
      previousScrollBehavior,
    );
  }, [isMainSwipeRoute, mainSwipeRef, routeKind, updateMainSwipeProgress]);

  React.useEffect(() => {
    previousRouteKindRef.current = routeKind;
  }, [routeKind]);

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
