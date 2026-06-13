import React from "react";

interface UseShowProfileQrOnTiltParams {
  enabled: boolean;
  onShowProfileQr: () => void;
}

const FORWARD_BETA_THRESHOLD = 95;
const BACKWARD_BETA_THRESHOLD = -95;
const RESET_BETA_MIN = -45;
const RESET_BETA_MAX = 65;
const FORWARD_GRAVITY_Y_THRESHOLD = 6.4;
const RESET_GRAVITY_Y_THRESHOLD = 3.2;
const OPEN_COOLDOWN_MS = 2500;

const isProfileQrTilt = (beta: number): boolean =>
  beta <= BACKWARD_BETA_THRESHOLD || beta >= FORWARD_BETA_THRESHOLD;

const isResetTilt = (beta: number): boolean =>
  beta > RESET_BETA_MIN && beta < RESET_BETA_MAX;

const readFiniteNumber = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

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

    const maybeOpenProfileQr = () => {
      const now = Date.now();
      if (now - lastOpenedAtRef.current < OPEN_COOLDOWN_MS) return;

      armedRef.current = false;
      lastOpenedAtRef.current = now;
      onShowProfileQrRef.current();
    };

    const onDeviceOrientation = (event: DeviceOrientationEvent) => {
      const beta = readFiniteNumber(event.beta);
      if (beta === null) return;

      if (isResetTilt(beta)) {
        armedRef.current = true;
        return;
      }

      if (!armedRef.current || !isProfileQrTilt(beta)) return;

      maybeOpenProfileQr();
    };

    const onDeviceMotion = (event: DeviceMotionEvent) => {
      const gravityY = readFiniteNumber(event.accelerationIncludingGravity?.y);
      if (gravityY === null) return;

      if (gravityY < RESET_GRAVITY_Y_THRESHOLD) {
        armedRef.current = true;
        return;
      }

      if (!armedRef.current || gravityY < FORWARD_GRAVITY_Y_THRESHOLD) return;

      maybeOpenProfileQr();
    };

    window.addEventListener("deviceorientation", onDeviceOrientation, {
      passive: true,
    });
    window.addEventListener("devicemotion", onDeviceMotion, {
      passive: true,
    });

    return () => {
      window.removeEventListener("deviceorientation", onDeviceOrientation);
      window.removeEventListener("devicemotion", onDeviceMotion);
    };
  }, [enabled]);
};
