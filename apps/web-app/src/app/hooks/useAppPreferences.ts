import React from "react";
import { persistLang, type Lang } from "../../i18n";
import {
  ALLOW_PROMISES_STORAGE_KEY,
  CASHU_AUTOSWAP_STORAGE_KEY,
  DISPLAY_ALLOWED_CURRENCIES_STORAGE_KEY,
  DISPLAY_CURRENCY_STORAGE_KEY,
  LIGHTNING_INVOICE_AUTO_PAY_LIMIT_STORAGE_KEY,
  PAY_WITH_CASHU_STORAGE_KEY,
  SHOW_PROFILE_QR_ON_TILT_STORAGE_KEY,
  UNIT_TOGGLE_STORAGE_KEY,
} from "../../utils/constants";
import type { DisplayCurrency } from "../../utils/displayAmounts";

interface UseAppPreferencesParams {
  allowPromisesEnabled: boolean;
  allowedDisplayCurrencies: readonly DisplayCurrency[];
  cashuAutoswapEnabled: boolean;
  displayCurrency: DisplayCurrency;
  lang: Lang;
  lightningInvoiceAutoPayLimit: number;
  payWithCashuEnabled: boolean;
  showProfileQrOnTiltEnabled: boolean;
}

export const useAppPreferences = ({
  allowPromisesEnabled,
  allowedDisplayCurrencies,
  cashuAutoswapEnabled,
  displayCurrency,
  lang,
  lightningInvoiceAutoPayLimit,
  payWithCashuEnabled,
  showProfileQrOnTiltEnabled,
}: UseAppPreferencesParams): void => {
  React.useEffect(() => {
    persistLang(lang);
    try {
      document.documentElement.lang = lang;
      document.documentElement.setAttribute("translate", "no");
      document.documentElement.classList.add("notranslate");
    } catch {
      // ignore
    }
  }, [lang]);

  React.useEffect(() => {
    try {
      localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, displayCurrency);
      localStorage.setItem(
        DISPLAY_ALLOWED_CURRENCIES_STORAGE_KEY,
        JSON.stringify(allowedDisplayCurrencies),
      );
      localStorage.setItem(
        UNIT_TOGGLE_STORAGE_KEY,
        displayCurrency === "btc" ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [allowedDisplayCurrencies, displayCurrency]);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        PAY_WITH_CASHU_STORAGE_KEY,
        payWithCashuEnabled ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [payWithCashuEnabled]);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        LIGHTNING_INVOICE_AUTO_PAY_LIMIT_STORAGE_KEY,
        String(lightningInvoiceAutoPayLimit),
      );
    } catch {
      // ignore
    }
  }, [lightningInvoiceAutoPayLimit]);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        ALLOW_PROMISES_STORAGE_KEY,
        allowPromisesEnabled ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [allowPromisesEnabled]);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        CASHU_AUTOSWAP_STORAGE_KEY,
        cashuAutoswapEnabled ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [cashuAutoswapEnabled]);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        SHOW_PROFILE_QR_ON_TILT_STORAGE_KEY,
        showProfileQrOnTiltEnabled ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [showProfileQrOnTiltEnabled]);
};
