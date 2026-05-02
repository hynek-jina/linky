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
  const contactsHeaderVisibleRef = React.useRef(contactsHeaderVisible);
  const contactsPullProgressRef = React.useRef(contactsPullProgress);

  React.useEffect(() => {
    contactsHeaderVisibleRef.current = contactsHeaderVisible;
  }, [contactsHeaderVisible]);

  React.useEffect(() => {
    contactsPullProgressRef.current = contactsPullProgress;
  }, [contactsPullProgress]);

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

    const getWindowScrollTop = () =>
      Math.max(
        window.scrollY,
        window.pageYOffset,
        document.documentElement.scrollTop,
        document.body.scrollTop,
      );

    const isWindowScrolled = () => getWindowScrollTop() > 1;

    const resetPull = () => {
      contactsPullDistanceRef.current = 0;
    };

    const hidePullUi = () => {
      if (contactsHeaderVisibleRef.current) {
        contactsHeaderVisibleRef.current = false;
        setContactsHeaderVisible(false);
      }
      if (contactsPullProgressRef.current > 0) {
        contactsPullProgressRef.current = 0;
        setContactsPullProgress(0);
      }
    };

    const onScroll = () => {
      const scrollTop = getWindowScrollTop();
      if (isMainSwipeRoute) setMainSwipeScrollY(scrollTop);
      if (scrollTop > 1) {
        resetPull();
        hidePullUi();
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (isWindowScrolled()) return;
      if (event.deltaY < 0) {
        contactsPullDistanceRef.current = Math.min(
          contactsPullDistanceRef.current + Math.abs(event.deltaY),
          pullThreshold * 3,
        );
        const progress = Math.min(
          contactsPullDistanceRef.current / pullThreshold,
          1,
        );
        contactsPullProgressRef.current = progress;
        setContactsPullProgress(progress);
        if (progress >= 1 && !contactsHeaderVisibleRef.current) {
          contactsHeaderVisibleRef.current = true;
          setContactsHeaderVisible(true);
        }
        return;
      }
      if (event.deltaY > 0) {
        resetPull();
        hidePullUi();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (isWindowScrolled()) return;
      const touch = event.touches[0];
      if (!touch) return;
      trackingTouch = true;
      touchStartY = touch.clientY;
      resetPull();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!trackingTouch || isWindowScrolled()) return;
      const touch = event.touches[0];
      if (!touch) return;
      const delta = touch.clientY - touchStartY;
      if (delta <= 0) {
        resetPull();
        hidePullUi();
        return;
      }
      contactsPullDistanceRef.current = delta;
      const progress = Math.min(delta / pullThreshold, 1);
      contactsPullProgressRef.current = progress;
      setContactsPullProgress(progress);
      if (progress >= 1 && !contactsHeaderVisibleRef.current) {
        contactsHeaderVisibleRef.current = true;
        setContactsHeaderVisible(true);
      }
    };

    const onTouchEnd = () => {
      trackingTouch = false;
      if (!contactsHeaderVisibleRef.current) {
        resetPull();
        if (contactsPullProgressRef.current > 0) {
          contactsPullProgressRef.current = 0;
          setContactsPullProgress(0);
        }
      } else {
        contactsPullProgressRef.current = 1;
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
    contactsPullDistanceRef,
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
