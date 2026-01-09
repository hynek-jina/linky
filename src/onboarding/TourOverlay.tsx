import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { tourSteps } from "./tourSteps";
import {
  navigateToContacts,
  navigateToWallet,
  navigateToSettings,
} from "../hooks/useRouting";
import type { I18nKey } from "../i18n";

type TranslateFn = (key: I18nKey) => string;

interface TourOverlayProps {
  step: number;
  onNext: () => void;
  onBack: () => void;
  onComplete: () => void;
  onSkip: () => void;
  t: TranslateFn;
  currentRoute: string;
}

interface TooltipPosition {
  top: number;
  left: number;
  arrowPosition: "top" | "bottom" | "left" | "right";
}

const navigateToRoute = (route: string) => {
  if (route === "" || route === "contacts") {
    navigateToContacts();
  } else if (route === "wallet") {
    navigateToWallet();
  } else if (route === "settings") {
    navigateToSettings();
  }
};

const calculateTooltipPosition = (
  targetRect: DOMRect,
  tooltipRect: DOMRect,
  stepPosition: "top" | "bottom" | "left" | "right"
): TooltipPosition => {
  const padding = 12;
  const arrowOffset = 16;

  let top = 0;
  let left = 0;
  const arrowPosition: "top" | "bottom" | "left" | "right" =
    stepPosition === "top"
      ? "bottom"
      : stepPosition === "bottom"
        ? "top"
        : stepPosition === "left"
          ? "right"
          : "left";

  switch (stepPosition) {
    case "top":
      top = targetRect.top - tooltipRect.height - padding - arrowOffset;
      left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
      break;
    case "bottom":
      top = targetRect.bottom + padding + arrowOffset;
      left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
      break;
    case "left":
      top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
      left = targetRect.left - tooltipRect.width - padding - arrowOffset;
      break;
    case "right":
      top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
      left = targetRect.right + padding + arrowOffset;
      break;
  }

  // Keep tooltip within viewport
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (left < padding) left = padding;
  if (left + tooltipRect.width > viewportWidth - padding) {
    left = viewportWidth - tooltipRect.width - padding;
  }
  if (top < padding) top = padding;
  if (top + tooltipRect.height > viewportHeight - padding) {
    top = viewportHeight - tooltipRect.height - padding;
  }

  return { top, left, arrowPosition };
};

export const TourOverlay: React.FC<TourOverlayProps> = ({
  step,
  onNext,
  onBack,
  onComplete,
  onSkip,
  t,
  currentRoute,
}) => {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const currentStep = tourSteps[step];
  const isLastStep = step === tourSteps.length - 1;
  const isFirstStep = step === 0;

  // Calculate tooltip position using useMemo instead of useEffect + setState
  const tooltipPosition = useMemo<TooltipPosition | null>(() => {
    if (!targetRect || !tooltipRect || !currentStep) {
      return null;
    }
    return calculateTooltipPosition(targetRect, tooltipRect, currentStep.position);
  }, [targetRect, tooltipRect, currentStep]);

  // Handle next button click - defined before conditional return
  const handleNext = useCallback(() => {
    if (isLastStep) {
      onComplete();
    } else {
      onNext();
    }
  }, [isLastStep, onComplete, onNext]);

  // Navigate to the required route for this step
  useEffect(() => {
    if (!currentStep) return;

    const requiredRoute = currentStep.route || "";
    // Map route kind to our step route names
    const currentRouteNormalized =
      currentRoute === "contacts"
        ? ""
        : currentRoute === "wallet"
          ? "wallet"
          : currentRoute === "settings"
            ? "settings"
            : currentRoute;

    if (requiredRoute !== currentRouteNormalized) {
      navigateToRoute(requiredRoute);
    }
  }, [step, currentStep, currentRoute]);

  // Find and track target element
  useEffect(() => {
    if (!currentStep) return;

    const findTarget = () => {
      const target = document.querySelector(currentStep.targetSelector);
      if (target) {
        const rect = target.getBoundingClientRect();
        setTargetRect(rect);
      } else {
        setTargetRect(null);
      }
    };

    // Initial find with small delay to allow route change
    const timer = setTimeout(findTarget, 100);

    // Update on resize/scroll
    window.addEventListener("resize", findTarget);
    window.addEventListener("scroll", findTarget);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", findTarget);
      window.removeEventListener("scroll", findTarget);
    };
  }, [currentStep, currentRoute]);

  // Track tooltip dimensions
  useEffect(() => {
    if (!tooltipRef.current) return;

    const updateTooltipRect = () => {
      if (tooltipRef.current) {
        setTooltipRect(tooltipRef.current.getBoundingClientRect());
      }
    };

    // Initial measurement
    updateTooltipRect();

    // Re-measure on resize
    const resizeObserver = new ResizeObserver(updateTooltipRect);
    resizeObserver.observe(tooltipRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [step]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onSkip();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        if (isLastStep) {
          onComplete();
        } else {
          onNext();
        }
      } else if (e.key === "ArrowLeft" && !isFirstStep) {
        onBack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLastStep, isFirstStep, onNext, onBack, onComplete, onSkip]);

  // Focus tooltip when it appears
  useEffect(() => {
    if (tooltipRef.current) {
      tooltipRef.current.focus();
    }
  }, [step]);

  if (!currentStep) return null;

  return (
    <div className="tour-overlay" aria-hidden="false">
      {/* Spotlight backdrop with hole for target element */}
      {targetRect && (
        <div
          className="tour-spotlight"
          aria-hidden="true"
          onClick={onSkip}
          style={{
            // Use clip-path to create a hole
            clipPath: `polygon(
              0% 0%,
              0% 100%,
              ${targetRect.left - 8}px 100%,
              ${targetRect.left - 8}px ${targetRect.top - 8}px,
              ${targetRect.right + 8}px ${targetRect.top - 8}px,
              ${targetRect.right + 8}px ${targetRect.bottom + 8}px,
              ${targetRect.left - 8}px ${targetRect.bottom + 8}px,
              ${targetRect.left - 8}px 100%,
              100% 100%,
              100% 0%
            )`,
          }}
        />
      )}

      {/* Highlight ring around target */}
      {targetRect && (
        <div
          className="tour-highlight-ring"
          aria-hidden="true"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="tour-tooltip"
        role="dialog"
        aria-modal="true"
        aria-label={`${t("tourStep")} ${step + 1}`}
        tabIndex={0}
        style={
          tooltipPosition
            ? {
                top: tooltipPosition.top,
                left: tooltipPosition.left,
                visibility: "visible",
              }
            : { visibility: "hidden" }
        }
      >
        {tooltipPosition && (
          <div
            className={`tour-tooltip-arrow tour-tooltip-arrow-${tooltipPosition.arrowPosition}`}
            aria-hidden="true"
          />
        )}

        <div className="tour-tooltip-progress" role="status" aria-live="polite">
          {step + 1} / {tourSteps.length}
        </div>

        <h3 className="tour-tooltip-title">
          {t(currentStep.titleKey)}
        </h3>

        <p className="tour-tooltip-desc">
          {t(currentStep.descriptionKey)}
        </p>

        <div className="tour-tooltip-actions" role="group" aria-label="Tour navigation">
          <button
            type="button"
            className="tour-btn tour-btn-ghost"
            onClick={onSkip}
            aria-label={t("tourSkip")}
          >
            {t("tourSkip")}
          </button>

          {!isFirstStep && (
            <button
              type="button"
              className="tour-btn tour-btn-secondary"
              onClick={onBack}
              aria-label={t("tourBack")}
            >
              {t("tourBack")}
            </button>
          )}

          <button
            type="button"
            className="tour-btn tour-btn-primary"
            onClick={handleNext}
            aria-label={isLastStep ? t("tourDone") : t("tourNext")}
          >
            {isLastStep ? t("tourDone") : t("tourNext")}
          </button>
        </div>
      </div>
    </div>
  );
};
