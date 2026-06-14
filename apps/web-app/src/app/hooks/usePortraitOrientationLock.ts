import React from "react";

export const usePortraitOrientationLock = (): void => {
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    let lockRequested = false;

    const requestLock = () => {
      if (lockRequested) return;
      lockRequested = true;
      try {
        const orientation = window.screen.orientation;
        if (!orientation) return;
        const lock = Reflect.get(orientation, "lock");
        if (typeof lock !== "function") return;
        void Promise.resolve(
          Reflect.apply(lock, orientation, ["portrait"]),
        ).catch(() => {});
      } catch {
        // Normal browser tabs often reject orientation locks. Installed PWAs and
        // native shells are the places where this can actually stick.
      }
    };

    requestLock();
    window.addEventListener("pointerdown", requestLock, { passive: true });
    window.addEventListener("touchstart", requestLock, { passive: true });
    window.addEventListener("click", requestLock, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", requestLock);
      window.removeEventListener("touchstart", requestLock);
      window.removeEventListener("click", requestLock);
    };
  }, []);
};
