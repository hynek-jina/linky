import React from "react";

export const shouldLockWalletWindowScroll = (routeKind: string): boolean => {
  return routeKind === "wallet";
};

/**
 * Per-frame pull progress is published as a CSS variable instead of React
 * state: the previous setState-per-touchmove re-rendered the whole app shell
 * for every frame of the pull gesture. React only sees the discrete
 * transitions (pull started/ended, header revealed), each at most once per
 * gesture; the toolbar style reads `--contacts-pull` directly.
 */
export const CONTACTS_PULL_CSS_VAR = "--contacts-pull";

const setContactsPullCssVar = (progress: number): void => {
  document.documentElement.style.setProperty(
    CONTACTS_PULL_CSS_VAR,
    String(Math.min(1, Math.max(0, progress))),
  );
};

interface UseMainSwipePageEffectsParams {
  contactsHeaderVisible: boolean;
  contactsPullDistanceRef: React.MutableRefObject<number>;
  routeKind: string;
  setContactsHeaderVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setContactsPulling: React.Dispatch<React.SetStateAction<boolean>>;
}

export const useMainSwipePageEffects = ({
  contactsHeaderVisible,
  contactsPullDistanceRef,
  routeKind,
  setContactsHeaderVisible,
  setContactsPulling,
}: UseMainSwipePageEffectsParams) => {
  const contactsHeaderVisibleRef = React.useRef(contactsHeaderVisible);

  React.useEffect(() => {
    contactsHeaderVisibleRef.current = contactsHeaderVisible;
  }, [contactsHeaderVisible]);

  React.useEffect(() => {
    if (routeKind !== "contacts") {
      setContactsHeaderVisible(false);
      setContactsPulling(false);
      contactsPullDistanceRef.current = 0;
      setContactsPullCssVar(0);
      return;
    }
    if (typeof window === "undefined") return;

    const pullThreshold = 36;
    let touchStartY = 0;
    let trackingTouch = false;
    let pulling = false;

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

    const updatePullProgress = (progress: number) => {
      setContactsPullCssVar(progress);
      if (progress > 0 && !pulling) {
        pulling = true;
        setContactsPulling(true);
      }
    };

    const stopPulling = () => {
      if (pulling) {
        pulling = false;
        setContactsPulling(false);
      }
    };

    const hidePullUi = () => {
      if (contactsHeaderVisibleRef.current) {
        contactsHeaderVisibleRef.current = false;
        setContactsHeaderVisible(false);
      }
      stopPulling();
      setContactsPullCssVar(0);
    };

    const onScroll = () => {
      const scrollTop = getWindowScrollTop();
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
        updatePullProgress(progress);
        if (progress >= 1 && !contactsHeaderVisibleRef.current) {
          contactsHeaderVisibleRef.current = true;
          setContactsHeaderVisible(true);
        }
        return;
      }
      if (event.deltaY > 0) {
        // On desktop, let downward wheel input start the actual page scroll.
        // The subsequent scroll event will collapse the visible toolbar once the
        // page is moving, which avoids a "stuck first tick" feeling.
        if (!contactsHeaderVisibleRef.current) {
          resetPull();
          hidePullUi();
        }
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
      updatePullProgress(progress);
      if (progress >= 1 && !contactsHeaderVisibleRef.current) {
        contactsHeaderVisibleRef.current = true;
        setContactsHeaderVisible(true);
      }
    };

    const onTouchEnd = () => {
      trackingTouch = false;
      if (!contactsHeaderVisibleRef.current) {
        resetPull();
        stopPulling();
        setContactsPullCssVar(0);
      } else {
        stopPulling();
        setContactsPullCssVar(1);
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
    routeKind,
    setContactsHeaderVisible,
    setContactsPulling,
  ]);

  React.useEffect(() => {
    if (!shouldLockWalletWindowScroll(routeKind)) return;
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

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [routeKind]);

  return {
    isMainSwipeRoute: routeKind === "contacts" || routeKind === "wallet",
  };
};
