import type { I18nKey } from "../i18n";

export interface TourStep {
  id: string;
  targetSelector: string;
  route: string;
  position: "top" | "bottom" | "left" | "right";
  titleKey: I18nKey;
  descriptionKey: I18nKey;
}

export const tourSteps: TourStep[] = [
  {
    id: "contacts-intro",
    targetSelector: ".contact-list",
    route: "",
    position: "bottom",
    titleKey: "tourStep1Title",
    descriptionKey: "tourStep1Desc",
  },
  {
    id: "add-contact",
    targetSelector: ".topbar-btn:last-of-type",
    route: "",
    position: "bottom",
    titleKey: "tourStep2Title",
    descriptionKey: "tourStep2Desc",
  },
  {
    id: "wallet-intro",
    targetSelector: ".wallet-hero",
    route: "wallet",
    position: "bottom",
    titleKey: "tourStep3Title",
    descriptionKey: "tourStep3Desc",
  },
  {
    id: "balance",
    targetSelector: ".balance-hero",
    route: "wallet",
    position: "bottom",
    titleKey: "tourStep4Title",
    descriptionKey: "tourStep4Desc",
  },
  {
    id: "topup",
    targetSelector: ".wallet-bottom-bar .btn-wide",
    route: "wallet",
    position: "top",
    titleKey: "tourStep5Title",
    descriptionKey: "tourStep5Desc",
  },
  {
    id: "profile",
    targetSelector: ".profile-button",
    route: "settings",
    position: "bottom",
    titleKey: "tourStep6Title",
    descriptionKey: "tourStep6Desc",
  },
];
