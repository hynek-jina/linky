import React from "react";

/**
 * Per-frame pull progress is published as a CSS variable instead of React
 * state: the previous setState-per-touchmove re-rendered the whole app shell
 * for every frame of the pull gesture. React only sees the discrete
 * transitions (pull started/ended, header revealed), each at most once per
 * gesture; the toolbar style reads `--contacts-pull` directly.
 */
export const CONTACTS_PULL_CSS_VAR = "--contacts-pull";
export const CONTACTS_PULL_REVEAL_DISTANCE_PX = 72;
const CONTACTS_PULLING_CLASS = "is-pulling-contacts-toolbar";

const setContactsPullCssVar = (progress: number): void => {
  document.documentElement.style.setProperty(
    CONTACTS_PULL_CSS_VAR,
    String(Math.min(1, Math.max(0, progress))),
  );
};

export const getContactsPullProgress = (distance: number): number =>
  Math.min(1, Math.max(0, distance / CONTACTS_PULL_REVEAL_DISTANCE_PX));

const setContactsPullingClass = (pulling: boolean): void => {
  document.documentElement.classList.toggle(CONTACTS_PULLING_CLASS, pulling);
};

interface UseMainSwipePageEffectsParams {
  contactsHeaderVisible: boolean;
  contactsPullDistanceRef: React.MutableRefObject<number>;
  mainSwipeRef: React.RefObject<HTMLDivElement | null>;
  routeKind: string;
  setContactsHeaderVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setContactsPulling: React.Dispatch<React.SetStateAction<boolean>>;
}

export const useMainSwipePageEffects = ({
  contactsHeaderVisible,
  contactsPullDistanceRef,
  mainSwipeRef,
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
      setContactsPullingClass(false);
      setContactsPullCssVar(0);
      return;
    }
    if (typeof window === "undefined") return;
    const contactsScroller =
      mainSwipeRef.current?.querySelector<HTMLDivElement>(
        ".main-swipe-contacts-page",
      ) ?? null;
    if (!contactsScroller) return;

    let touchStartY = 0;
    let trackingTouch = false;
    let pulling = false;

    const isContactsScrollerScrolled = () => contactsScroller.scrollTop > 1;

    const resetPull = () => {
      contactsPullDistanceRef.current = 0;
    };

    const updatePullProgress = (progress: number) => {
      if (progress > 0 && !pulling) {
        pulling = true;
        setContactsPullingClass(true);
        setContactsPulling(true);
      }
      setContactsPullCssVar(progress);
    };

    const stopPulling = () => {
      setContactsPullingClass(false);
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
      if (isContactsScrollerScrolled()) {
        resetPull();
        hidePullUi();
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (isContactsScrollerScrolled()) return;
      if (event.deltaY < 0) {
        contactsPullDistanceRef.current = Math.min(
          contactsPullDistanceRef.current + Math.abs(event.deltaY),
          CONTACTS_PULL_REVEAL_DISTANCE_PX * 3,
        );
        const progress = getContactsPullProgress(
          contactsPullDistanceRef.current,
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
      if (isContactsScrollerScrolled()) return;
      const touch = event.touches[0];
      if (!touch) return;
      trackingTouch = true;
      touchStartY = touch.clientY;
      resetPull();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!trackingTouch || isContactsScrollerScrolled()) return;
      const touch = event.touches[0];
      if (!touch) return;
      const delta = touch.clientY - touchStartY;
      if (delta <= 0) {
        resetPull();
        hidePullUi();
        return;
      }
      contactsPullDistanceRef.current = delta;
      const progress = getContactsPullProgress(delta);
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

    contactsScroller.addEventListener("scroll", onScroll, { passive: true });
    contactsScroller.addEventListener("wheel", onWheel, { passive: true });
    contactsScroller.addEventListener("touchstart", onTouchStart, {
      passive: true,
    });
    contactsScroller.addEventListener("touchmove", onTouchMove, {
      passive: true,
    });
    contactsScroller.addEventListener("touchend", onTouchEnd, {
      passive: true,
    });
    contactsScroller.addEventListener("touchcancel", onTouchEnd, {
      passive: true,
    });

    return () => {
      contactsScroller.removeEventListener("scroll", onScroll);
      contactsScroller.removeEventListener("wheel", onWheel);
      contactsScroller.removeEventListener("touchstart", onTouchStart);
      contactsScroller.removeEventListener("touchmove", onTouchMove);
      contactsScroller.removeEventListener("touchend", onTouchEnd);
      contactsScroller.removeEventListener("touchcancel", onTouchEnd);
      setContactsPullingClass(false);
    };
  }, [
    contactsPullDistanceRef,
    mainSwipeRef,
    routeKind,
    setContactsHeaderVisible,
    setContactsPulling,
  ]);

  return {
    isMainSwipeRoute: routeKind === "contacts" || routeKind === "wallet",
  };
};
