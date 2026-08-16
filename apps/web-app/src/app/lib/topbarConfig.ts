import type { ContactId } from "../../evolu";
import { navigateTo, returnFromBankPaymentOffer } from "../../hooks/useRouting";
import type { Route } from "../../types/route";
import { setLinkyBankPaymentOfferMinimized } from "./bankPaymentOffer";
import type { TopbarButton } from "../types/appTypes";

export interface BackActionContext {
  closeContactDetail: () => void;
  contactPayBackToChatId: ContactId | null;
  navigateToMainReturn: () => void;
}

interface BuildTopbarArgs extends BackActionContext {
  route: Route;
  t: (key: string) => string;
}

interface BuildTopbarRightArgs {
  chatEditContactId: ContactId | null;
  isProfileEditing: boolean;
  openReceiveScan: () => void;
  openScan: () => void;
  route: Route;
  t: (key: string) => string;
  toggleMenu: () => void;
}

/**
 * Single source of truth for "go one level up" navigation.
 *
 * Both the top-left topbar button and the Android hardware/gesture back button
 * resolve through this, so the two can never drift apart as routes are added.
 * Returning `null` means the route is a root screen with nowhere to go back to
 * (the hardware back press then falls through and closes the app).
 */
export const resolveBackAction = (
  route: Route,
  {
    closeContactDetail,
    contactPayBackToChatId,
    navigateToMainReturn,
  }: BackActionContext,
): (() => void) | null => {
  switch (route.kind) {
    case "settings":
    case "advanced":
    case "profile":
      return navigateToMainReturn;

    case "settingsLanguage":
    case "settingsUnits":
    case "settingsMasterKeys":
    case "advancedAutoPayLimit":
    case "advancedInspector":
    case "advancedPushDebug":
    case "mints":
    case "nostrRelays":
    case "evoluServers":
      return () => navigateTo({ route: "settings" });

    case "mint":
      return () => navigateTo({ route: "mints" });

    case "profileEdit":
      return () => navigateTo({ route: "profile" });

    case "transactions":
    case "manualPay":
    case "bankPayment":
    case "cashuTokens":
    case "cashuTokenEmit":
    case "topup":
      return () => navigateTo({ route: "wallet" });

    case "topupNoAmount":
    case "topupInvoice":
      return () => navigateTo({ route: "topup" });

    case "bankPaymentOffer": {
      const { chatId, offerId } = route;
      return () => {
        setLinkyBankPaymentOfferMinimized(chatId, offerId, true);
        returnFromBankPaymentOffer(chatId);
      };
    }

    case "cashuTokenNew":
    case "cashuToken":
      return () => navigateTo({ route: "cashuTokens" });

    case "evoluData":
      return () => navigateTo({ route: "advanced" });

    case "lnAddressPay":
    case "chat":
      return () => navigateTo({ route: "contacts" });

    case "nostrRelay":
    case "nostrRelayNew":
      return () => navigateTo({ route: "nostrRelays" });

    case "evoluServer":
    case "evoluServerNew":
    case "evoluCurrentData":
    case "evoluHistoryData":
      return () => navigateTo({ route: "evoluServers" });

    case "contactNew":
    case "contact":
      return closeContactDetail;

    case "contactEdit": {
      const contactId = route.id;
      return () => navigateTo({ route: "contact", id: contactId });
    }

    case "contactPay": {
      const contactId = route.id;
      const backToChat =
        String(contactPayBackToChatId ?? "") === String(contactId ?? "");

      return () => {
        if (backToChat && contactId) {
          navigateTo({ route: "chat", id: contactId });
          return;
        }
        if (contactId) {
          navigateTo({ route: "contact", id: contactId });
          return;
        }
        navigateTo({ route: "contacts" });
      };
    }

    // Root screens: nothing above them.
    case "contacts":
    case "wallet":
      return null;
  }
};

export const buildTopbar = ({
  closeContactDetail,
  contactPayBackToChatId,
  navigateToMainReturn,
  route,
  t,
}: BuildTopbarArgs): TopbarButton | null => {
  const onClick = resolveBackAction(route, {
    closeContactDetail,
    contactPayBackToChatId,
    navigateToMainReturn,
  });

  if (!onClick) return null;

  return {
    // A bank payment offer is dismissed rather than stepped out of, so it keeps
    // the close glyph instead of the back chevron.
    icon: route.kind === "bankPaymentOffer" ? "×" : "<",
    label: t("close"),
    onClick,
  };
};

export const buildTopbarRight = ({
  chatEditContactId,
  isProfileEditing,
  openReceiveScan,
  openScan,
  route,
  t,
  toggleMenu,
}: BuildTopbarRightArgs): TopbarButton | null => {
  if (route.kind === "nostrRelays") {
    return {
      icon: "+",
      label: t("addRelay"),
      onClick: () => navigateTo({ route: "nostrRelayNew" }),
    };
  }

  if (route.kind === "evoluServers") {
    return {
      icon: "+",
      label: t("evoluAddServerLabel"),
      onClick: () => navigateTo({ route: "evoluServerNew" }),
    };
  }

  if (route.kind === "profile" && !isProfileEditing) {
    return {
      icon: "edit",
      label: t("edit"),
      onClick: () => navigateTo({ route: "profileEdit" }),
    };
  }

  if (route.kind === "chat") {
    if (!chatEditContactId) return null;
    return {
      icon: "edit",
      label: t("edit"),
      onClick: () =>
        navigateTo({ route: "contactEdit", id: chatEditContactId }),
    };
  }

  if (route.kind === "contact") {
    return {
      icon: "edit",
      label: t("editContact"),
      onClick: () => navigateTo({ route: "contactEdit", id: route.id }),
    };
  }

  if (route.kind === "contactNew") {
    return {
      icon: "scan",
      label: t("contactLoadQr"),
      onClick: openScan,
    };
  }

  if (route.kind === "topup") {
    return {
      icon: "scan",
      label: t("scan"),
      onClick: openReceiveScan,
    };
  }

  if (
    route.kind === "settings" ||
    route.kind === "settingsLanguage" ||
    route.kind === "settingsUnits" ||
    route.kind === "settingsMasterKeys" ||
    route.kind === "advanced" ||
    route.kind === "advancedAutoPayLimit" ||
    route.kind === "advancedInspector" ||
    route.kind === "advancedPushDebug" ||
    route.kind === "mints" ||
    route.kind === "topupNoAmount" ||
    route.kind === "topupInvoice" ||
    route.kind === "manualPay" ||
    route.kind === "bankPayment" ||
    route.kind === "bankPaymentOffer" ||
    route.kind === "cashuTokens" ||
    route.kind === "cashuTokenNew" ||
    route.kind === "cashuTokenEmit" ||
    route.kind === "cashuToken" ||
    route.kind === "transactions" ||
    route.kind === "evoluData" ||
    route.kind === "evoluCurrentData" ||
    route.kind === "evoluHistoryData" ||
    route.kind === "contactEdit" ||
    route.kind === "profileEdit"
  ) {
    return null;
  }

  return {
    icon: "☰",
    label: t("menu"),
    onClick: toggleMenu,
  };
};

export const buildTopbarTitle = (
  route: Route,
  t: (key: string) => string,
): string | null => {
  if (route.kind === "contacts") return t("contactsTitle");
  if (route.kind === "settings") return t("settings");
  if (route.kind === "settingsLanguage") return t("language");
  if (route.kind === "settingsUnits") return t("unit");
  if (route.kind === "settingsMasterKeys") return t("masterKeys");
  if (route.kind === "wallet") return t("wallet");
  if (route.kind === "transactions") return t("transactionsTitle");
  if (route.kind === "topup") return t("topupTitle");
  if (route.kind === "topupNoAmount") return t("topupNoAmountTitle");
  if (route.kind === "topupInvoice") return t("topupInvoiceTitle");
  if (route.kind === "manualPay") return t("manualPayTitle");
  if (route.kind === "bankPayment") return t("spdPaymentTitle");
  if (route.kind === "bankPaymentOffer")
    return t("bankPaymentOfferIncomingTitle");
  if (route.kind === "lnAddressPay") return t("pay");
  if (route.kind === "cashuTokens") return t("tokens");
  if (route.kind === "cashuTokenEmit") return t("cashuEmit");
  if (route.kind === "cashuTokenNew") return t("cashuAddToken");
  if (route.kind === "cashuToken") return t("cashuToken");
  if (route.kind === "advanced") return t("settings");
  if (route.kind === "advancedAutoPayLimit") {
    return t("lightningInvoiceAutoPayLimit");
  }
  if (route.kind === "advancedInspector") return t("nostrInspector");
  if (route.kind === "advancedPushDebug") return "Push Debug";
  if (route.kind === "mints") return t("mints");
  if (route.kind === "mint") return t("mints");
  if (route.kind === "profile" || route.kind === "profileEdit") {
    return t("profile");
  }
  if (route.kind === "nostrRelays") return t("nostrRelay");
  if (route.kind === "nostrRelay") return t("nostrRelay");
  if (route.kind === "nostrRelayNew") return t("nostrRelay");
  if (route.kind === "evoluServers") return t("evoluServer");
  if (route.kind === "evoluServer") return t("evoluServer");
  if (route.kind === "evoluServerNew") return t("evoluAddServerLabel");
  if (route.kind === "evoluData") return t("evoluData");
  if (route.kind === "evoluCurrentData") return t("evoluData");
  if (route.kind === "evoluHistoryData") return t("evoluHistory");
  if (route.kind === "contactNew") return t("newContact");
  if (route.kind === "contact") return t("contact");
  if (route.kind === "contactEdit") return t("contactEditTitle");
  if (route.kind === "contactPay") return t("contactPayTitle");
  if (route.kind === "chat") return t("messagesTitle");
  return null;
};
