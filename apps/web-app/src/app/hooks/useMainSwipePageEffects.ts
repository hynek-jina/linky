import React from "react";

interface UseMainSwipePageEffectsParams {
  contactsHeaderVisible: boolean;
  contactsPullDistanceRef: React.MutableRefObject<number>;
  contactsPullProgress: number;
  routeKind: string;
  setContactsHeaderVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setContactsPullProgress: React.Dispatch<React.SetStateAction<number>>;
  setMainSwipeScrollY: React.Dispatch<React.SetStateAction<number>>;
}

export const useMainSwipePageEffects = ({
  contactsHeaderVisible,
  contactsPullDistanceRef,
  contactsPullProgress,
  routeKind,
  setContactsHeaderVisible,
  setContactsPullProgress,
  setMainSwipeScrollY,
}: UseMainSwipePageEffectsParams) => {
  const isMainSwipeRoute = routeKind === "contacts" || routeKind === "wallet";

  React.useEffect(() => {
    if (routeKind !== "contacts") {
      setContactsHeaderVisible(false);
      contactsPullDistanceRef.current = 0;
      setContactsPullProgress(0);
      return;
    }
    if (typeof window === "undefined") return;

    const pullThreshold = 36;
    let touchStartY = 0;
    let trackingTouch = false;

    const resetPull = () => {
      contactsPullDistanceRef.current = 0;
    };

    const onScroll = () => {
      if (isMainSwipeRoute) setMainSwipeScrollY(window.scrollY);
      if (window.scrollY > 0) {
        resetPull();
        if (contactsHeaderVisible) setContactsHeaderVisible(false);
        if (contactsPullProgress > 0) setContactsPullProgress(0);
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (window.scrollY > 0) return;
      if (event.deltaY < 0) {
        contactsPullDistanceRef.current = Math.min(
          contactsPullDistanceRef.current + Math.abs(event.deltaY),
          pullThreshold * 3,
        );
        const progress = Math.min(
          contactsPullDistanceRef.current / pullThreshold,
          1,
        );
        setContactsPullProgress(progress);
        if (progress >= 1) setContactsHeaderVisible(true);
        return;
      }
      if (event.deltaY > 0) {
        resetPull();
        if (contactsHeaderVisible) setContactsHeaderVisible(false);
        if (contactsPullProgress > 0) setContactsPullProgress(0);
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (window.scrollY > 0) return;
      const touch = event.touches[0];
      if (!touch) return;
      trackingTouch = true;
      touchStartY = touch.clientY;
      resetPull();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!trackingTouch || window.scrollY > 0) return;
      const touch = event.touches[0];
      if (!touch) return;
      const delta = touch.clientY - touchStartY;
      if (delta <= 0) {
        resetPull();
        if (contactsHeaderVisible) setContactsHeaderVisible(false);
        if (contactsPullProgress > 0) setContactsPullProgress(0);
        return;
      }
      contactsPullDistanceRef.current = delta;
      const progress = Math.min(delta / pullThreshold, 1);
      setContactsPullProgress(progress);
      if (progress >= 1) setContactsHeaderVisible(true);
    };

    const onTouchEnd = () => {
      trackingTouch = false;
      if (!contactsHeaderVisible) {
        resetPull();
        if (contactsPullProgress > 0) setContactsPullProgress(0);
      } else {
        setContactsPullProgress(1);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [
    contactsHeaderVisible,
    contactsPullDistanceRef,
    contactsPullProgress,
    isMainSwipeRoute,
    routeKind,
    setContactsHeaderVisible,
    setContactsPullProgress,
    setMainSwipeScrollY,
  ]);

  React.useEffect(() => {
    if (routeKind !== "wallet") return;
    if (typeof document === "undefined") return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    try {
      window.scrollTo(0, 0);
    } catch {
      // ignore
    }
    setMainSwipeScrollY(0);

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [routeKind, setMainSwipeScrollY]);

  return {
    isMainSwipeRoute,
  };
};
