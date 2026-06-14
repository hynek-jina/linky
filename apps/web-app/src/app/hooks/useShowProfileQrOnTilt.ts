import React from "react";

interface UseShowProfileQrOnTiltParams {
  enabled: boolean;
  onHideProfileQr: () => void;
  onShowProfileQr: () => void;
}

const ORIENTATION_TILT_DELTA = 35;
const ORIENTATION_RESET_DELTA = 12;
const GRAVITY_TILT_DELTA = 3.2;
const GRAVITY_RESET_DELTA = 1.2;
const OPEN_COOLDOWN_MS = 2500;

export const getAngleDelta = (value: number, baseline: number): number => {
  let delta = value - baseline;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
};

export const isProfileQrTilt = (beta: number, baseline: number): boolean =>
  Math.abs(getAngleDelta(beta, baseline)) >= ORIENTATION_TILT_DELTA;

export const isResetTilt = (beta: number, baseline: number): boolean =>
  Math.abs(getAngleDelta(beta, baseline)) <= ORIENTATION_RESET_DELTA;

export const isMotionProfileQrTilt = (
  gravityY: number,
  baseline: number,
): boolean => Math.abs(gravityY - baseline) >= GRAVITY_TILT_DELTA;

export const isMotionResetTilt = (
  gravityY: number,
  baseline: number,
): boolean => Math.abs(gravityY - baseline) <= GRAVITY_RESET_DELTA;

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
  onHideProfileQr,
  onShowProfileQr,
}: UseShowProfileQrOnTiltParams): void => {
  const armedRef = React.useRef(true);
  const baselineBetaRef = React.useRef<number | null>(null);
  const baselineGravityYRef = React.useRef<number | null>(null);
  const lastOpenedAtRef = React.useRef(0);
  const motionTiltedRef = React.useRef(false);
  const openedByTiltRef = React.useRef(false);
  const orientationTiltedRef = React.useRef(false);
  const onHideProfileQrRef = React.useRef(onHideProfileQr);
  const onShowProfileQrRef = React.useRef(onShowProfileQr);

  React.useEffect(() => {
    onHideProfileQrRef.current = onHideProfileQr;
  }, [onHideProfileQr]);

  React.useEffect(() => {
    onShowProfileQrRef.current = onShowProfileQr;
  }, [onShowProfileQr]);

  React.useEffect(() => {
    if (!enabled) {
      armedRef.current = true;
      baselineBetaRef.current = null;
      baselineGravityYRef.current = null;
      motionTiltedRef.current = false;
      openedByTiltRef.current = false;
      orientationTiltedRef.current = false;
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
      if (!motionTiltedRef.current && !orientationTiltedRef.current) return;
      const now = Date.now();
      if (now - lastOpenedAtRef.current < OPEN_COOLDOWN_MS) return;

      armedRef.current = false;
      openedByTiltRef.current = true;
      lastOpenedAtRef.current = now;
      onShowProfileQrRef.current();
    };

    const maybeCloseProfileQr = () => {
      if (motionTiltedRef.current || orientationTiltedRef.current) return;
      armedRef.current = true;
      if (!openedByTiltRef.current) return;
      openedByTiltRef.current = false;
      onHideProfileQrRef.current();
    };

    const onDeviceOrientation = (event: DeviceOrientationEvent) => {
      const beta = readFiniteNumber(event.beta);
      if (beta === null) return;
      const baselineBeta = baselineBetaRef.current;
      if (baselineBeta === null) {
        baselineBetaRef.current = beta;
        return;
      }

      if (isProfileQrTilt(beta, baselineBeta)) {
        orientationTiltedRef.current = true;
        if (armedRef.current) maybeOpenProfileQr();
        return;
      }

      if (isResetTilt(beta, baselineBeta)) {
        orientationTiltedRef.current = false;
        maybeCloseProfileQr();
        return;
      }
    };

    const onDeviceMotion = (event: DeviceMotionEvent) => {
      const gravityY = readFiniteNumber(event.accelerationIncludingGravity?.y);
      if (gravityY === null) return;
      const baselineGravityY = baselineGravityYRef.current;
      if (baselineGravityY === null) {
        baselineGravityYRef.current = gravityY;
        return;
      }

      if (isMotionProfileQrTilt(gravityY, baselineGravityY)) {
        motionTiltedRef.current = true;
        if (armedRef.current) maybeOpenProfileQr();
        return;
      }

      if (isMotionResetTilt(gravityY, baselineGravityY)) {
        motionTiltedRef.current = false;
        maybeCloseProfileQr();
        return;
      }
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
