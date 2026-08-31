import React from "react";
import {
  BANK_PAYMENT_OFFER_RECIPIENT_COUNT_STORAGE_KEY,
  BANK_PAYMENT_OFFER_STAGGER_DELAY_SEC_STORAGE_KEY,
  CASHU_AUTOSWAP_STORAGE_KEY,
  DECIMAL_AMOUNT_INPUT_STORAGE_KEY,
  DISPLAY_ALLOWED_CURRENCIES_STORAGE_KEY,
  DISPLAY_CURRENCY_STORAGE_KEY,
  LIGHTNING_INVOICE_AUTO_PAY_LIMIT_STORAGE_KEY,
  PAY_WITH_CASHU_STORAGE_KEY,
  SEEN_RECEIPTS_ENABLED_AT_SEC_STORAGE_KEY,
  SHOW_PROFILE_QR_ON_TILT_STORAGE_KEY,
  UNIT_TOGGLE_STORAGE_KEY,
} from "../../utils/constants";
import type { DisplayCurrency } from "../../utils/displayAmounts";

interface UseAppPreferencesParams {
  allowedDisplayCurrencies: readonly DisplayCurrency[];
  cashuAutoswapEnabled: boolean;
  decimalAmountInputEnabled: boolean;
  displayCurrency: DisplayCurrency;
  bankPaymentOfferRecipientCount: number;
  bankPaymentOfferStaggerDelaySec: number;
  lightningInvoiceAutoPayLimit: number;
  payWithCashuEnabled: boolean;
  seenReceiptsEnabledAtSec: number | null;
  showProfileQrOnTiltEnabled: boolean;
}

export const useAppPreferences = ({
  allowedDisplayCurrencies,
  cashuAutoswapEnabled,
  decimalAmountInputEnabled,
  displayCurrency,
  bankPaymentOfferRecipientCount,
  bankPaymentOfferStaggerDelaySec,
  lightningInvoiceAutoPayLimit,
  payWithCashuEnabled,
  seenReceiptsEnabledAtSec,
  showProfileQrOnTiltEnabled,
}: UseAppPreferencesParams): void => {
  React.useEffect(() => {
    try {
      localStorage.setItem(
        DECIMAL_AMOUNT_INPUT_STORAGE_KEY,
        decimalAmountInputEnabled ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [decimalAmountInputEnabled]);

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
        BANK_PAYMENT_OFFER_RECIPIENT_COUNT_STORAGE_KEY,
        String(bankPaymentOfferRecipientCount),
      );
    } catch {
      // ignore
    }
  }, [bankPaymentOfferRecipientCount]);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        BANK_PAYMENT_OFFER_STAGGER_DELAY_SEC_STORAGE_KEY,
        String(bankPaymentOfferStaggerDelaySec),
      );
    } catch {
      // ignore
    }
  }, [bankPaymentOfferStaggerDelaySec]);

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
      // "0" (not key removal) persists the off state: an absent key means
      // "never decided" and re-enables by default on the next launch.
      localStorage.setItem(
        SEEN_RECEIPTS_ENABLED_AT_SEC_STORAGE_KEY,
        seenReceiptsEnabledAtSec === null
          ? "0"
          : String(seenReceiptsEnabledAtSec),
      );
    } catch {
      // ignore
    }
  }, [seenReceiptsEnabledAtSec]);

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
