import React from "react";

interface UseShowProfileQrOnTiltParams {
  enabled: boolean;
  onHideProfileQr: () => void;
  onShowProfileQr: () => void;
}

const FORWARD_BETA_THRESHOLD = -95;
const RESET_BETA_THRESHOLD = -45;
const GRAVITY_TILT_THRESHOLD = -5.4;
const GRAVITY_RESET_THRESHOLD = -2.4;
const OPEN_COOLDOWN_MS = 2500;

const isProfileQrTilt = (beta: number): boolean =>
  beta <= FORWARD_BETA_THRESHOLD;

const isResetTilt = (beta: number): boolean => beta > RESET_BETA_THRESHOLD;

const isMotionProfileQrTilt = (gravityY: number): boolean =>
  gravityY <= GRAVITY_TILT_THRESHOLD;

const isMotionResetTilt = (gravityY: number): boolean =>
  gravityY > GRAVITY_RESET_THRESHOLD;

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

      if (isProfileQrTilt(beta)) {
        orientationTiltedRef.current = true;
        if (armedRef.current) maybeOpenProfileQr();
        return;
      }

      if (isResetTilt(beta)) {
        orientationTiltedRef.current = false;
        maybeCloseProfileQr();
        return;
      }
    };

    const onDeviceMotion = (event: DeviceMotionEvent) => {
      const gravityY = readFiniteNumber(event.accelerationIncludingGravity?.y);
      if (gravityY === null) return;

      if (isMotionProfileQrTilt(gravityY)) {
        motionTiltedRef.current = true;
        if (armedRef.current) maybeOpenProfileQr();
        return;
      }

      if (isMotionResetTilt(gravityY)) {
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
