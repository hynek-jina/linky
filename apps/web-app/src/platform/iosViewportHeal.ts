// Works around an iOS standalone-PWA WebKit bug: opening the software
// keyboard permanently shrinks the layout viewport by the top safe-area
// inset (window.innerHeight, 100dvh and visualViewport.height all stay
// ~60px short after the keyboard closes, until the app is force-quit).
// Toggling display on the app root forces WebKit to re-measure the
// viewport. See
// https://dev.to/cederhook/fixing-the-ios-standalone-pwa-keyboard-bug-that-shrinks-your-viewport-for-good-63d
export const installIosViewportHeal = (): void => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const nav: Navigator & { standalone?: boolean } = navigator;
  if (nav.standalone !== true) return;

  let maxInnerHeight = window.innerHeight;
  window.addEventListener("orientationchange", () => {
    maxInnerHeight = 0;
  });
  window.addEventListener("resize", () => {
    maxInnerHeight = Math.max(maxInnerHeight, window.innerHeight);
  });

  const heal = () => {
    maxInnerHeight = Math.max(maxInnerHeight, window.innerHeight);
    if (maxInnerHeight - window.innerHeight <= 4) return;
    const rootEl = document.getElementById("root");
    if (!rootEl) return;
    const previousDisplay = rootEl.style.display;
    rootEl.style.display = "none";
    void rootEl.offsetHeight;
    rootEl.style.display = previousDisplay;
  };

  document.addEventListener("focusout", () => {
    window.setTimeout(heal, 150);
  });
};
