import React from "react";

interface UseShowProfileQrOnTiltParams {
  enabled: boolean;
  onShowProfileQr: () => void;
}

const INVERTED_BETA_THRESHOLD = -110;
const DEEPLY_INVERTED_BETA_THRESHOLD = 155;
const RESET_BETA_THRESHOLD = -60;
const RESET_DEEP_BETA_THRESHOLD = 130;
const OPEN_COOLDOWN_MS = 2500;

const isProfileQrTilt = (beta: number): boolean =>
  beta <= INVERTED_BETA_THRESHOLD || beta >= DEEPLY_INVERTED_BETA_THRESHOLD;

const isResetTilt = (beta: number): boolean =>
  beta > RESET_BETA_THRESHOLD && beta < RESET_DEEP_BETA_THRESHOLD;

export const useShowProfileQrOnTilt = ({
  enabled,
  onShowProfileQr,
}: UseShowProfileQrOnTiltParams): void => {
  const armedRef = React.useRef(true);
  const lastOpenedAtRef = React.useRef(0);
  const onShowProfileQrRef = React.useRef(onShowProfileQr);

  React.useEffect(() => {
    onShowProfileQrRef.current = onShowProfileQr;
  }, [onShowProfileQr]);

  React.useEffect(() => {
    if (!enabled) {
      armedRef.current = true;
      return;
    }
    if (typeof window === "undefined") return;

    const onDeviceOrientation = (event: DeviceOrientationEvent) => {
      const beta = event.beta;
      if (typeof beta !== "number" || !Number.isFinite(beta)) return;

      if (isResetTilt(beta)) {
        armedRef.current = true;
        return;
      }

      if (!armedRef.current || !isProfileQrTilt(beta)) return;

      const now = Date.now();
      if (now - lastOpenedAtRef.current < OPEN_COOLDOWN_MS) return;

      armedRef.current = false;
      lastOpenedAtRef.current = now;
      onShowProfileQrRef.current();
    };

    window.addEventListener("deviceorientation", onDeviceOrientation, {
      passive: true,
    });

    return () => {
      window.removeEventListener("deviceorientation", onDeviceOrientation);
    };
  }, [enabled]);
};
