import React from "react";

interface UseShowProfileQrOnTiltParams {
  enabled: boolean;
  onShowProfileQr: () => void;
}

const TILT_ANGLE_THRESHOLD = 70;
const RESET_ANGLE_THRESHOLD = 35;
const GRAVITY_TILT_THRESHOLD = 5.4;
const GRAVITY_RESET_THRESHOLD = 2.4;
const OPEN_COOLDOWN_MS = 2500;

const isProfileQrTilt = (beta: number, gamma: number | null): boolean =>
  Math.abs(beta) >= TILT_ANGLE_THRESHOLD ||
  (gamma !== null && Math.abs(gamma) >= TILT_ANGLE_THRESHOLD);

const isResetTilt = (beta: number, gamma: number | null): boolean =>
  Math.abs(beta) < RESET_ANGLE_THRESHOLD &&
  (gamma === null || Math.abs(gamma) < RESET_ANGLE_THRESHOLD);

const readFiniteNumber = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const requestSensorPermission = async (constructor: unknown): Promise<void> => {
  if (!constructor) return;
  if (typeof constructor !== "object" && typeof constructor !== "function") {
    return;
  }

  const requestPermission = Reflect.get(constructor, "requestPermission");
  if (typeof requestPermission !== "function") return;

  try {
    await Reflect.apply(requestPermission, constructor, []);
  } catch {
    // Browsers that do not allow prompting here will simply keep sensor events
    // silent; the profile button remains the reliable manual path.
  }
};

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

    let permissionRequested = false;

    const requestPermissionsFromGesture = () => {
      if (permissionRequested) return;
      permissionRequested = true;
      void requestSensorPermission(window.DeviceOrientationEvent);
      void requestSensorPermission(window.DeviceMotionEvent);
    };

    const maybeOpenProfileQr = () => {
      const now = Date.now();
      if (now - lastOpenedAtRef.current < OPEN_COOLDOWN_MS) return;

      armedRef.current = false;
      lastOpenedAtRef.current = now;
      onShowProfileQrRef.current();
    };

    const onDeviceOrientation = (event: DeviceOrientationEvent) => {
      const beta = readFiniteNumber(event.beta);
      const gamma = readFiniteNumber(event.gamma);
      if (beta === null) return;

      if (isResetTilt(beta, gamma)) {
        armedRef.current = true;
        return;
      }

      if (!armedRef.current || !isProfileQrTilt(beta, gamma)) return;

      maybeOpenProfileQr();
    };

    const onDeviceMotion = (event: DeviceMotionEvent) => {
      const gravityY = readFiniteNumber(event.accelerationIncludingGravity?.y);
      if (gravityY === null) return;
      const absGravityY = Math.abs(gravityY);

      if (absGravityY < GRAVITY_RESET_THRESHOLD) {
        armedRef.current = true;
        return;
      }

      if (!armedRef.current || absGravityY < GRAVITY_TILT_THRESHOLD) return;

      maybeOpenProfileQr();
    };

    window.addEventListener("pointerdown", requestPermissionsFromGesture, {
      passive: true,
    });
    window.addEventListener("touchstart", requestPermissionsFromGesture, {
      passive: true,
    });
    window.addEventListener("click", requestPermissionsFromGesture, {
      passive: true,
    });
    window.addEventListener("deviceorientation", onDeviceOrientation, {
      passive: true,
    });
    window.addEventListener("devicemotion", onDeviceMotion, {
      passive: true,
    });

    return () => {
      window.removeEventListener("pointerdown", requestPermissionsFromGesture);
      window.removeEventListener("touchstart", requestPermissionsFromGesture);
      window.removeEventListener("click", requestPermissionsFromGesture);
      window.removeEventListener("deviceorientation", onDeviceOrientation);
      window.removeEventListener("devicemotion", onDeviceMotion);
    };
  }, [enabled]);
};
