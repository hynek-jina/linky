import type { ContactId } from "../../evolu";
import { navigateTo } from "../../hooks/useRouting";
import type { Route } from "../../types/route";
import type { TopbarButton } from "../types/appTypes";

interface BuildTopbarArgs {
  closeContactDetail: () => void;
  contactPayBackToChatId: ContactId | null;
  navigateToMainReturn: () => void;
  route: Route;
  t: (key: string) => string;
}

interface BuildTopbarRightArgs {
  chatEditContactId: ContactId | null;
  isProfileEditing: boolean;
  openScan: () => void;
  route: Route;
  t: (key: string) => string;
  toggleMenu: () => void;
}

export const buildTopbar = ({
  closeContactDetail,
  contactPayBackToChatId,
  navigateToMainReturn,
  route,
  t,
}: BuildTopbarArgs): TopbarButton | null => {
  if (route.kind === "settings") {
    return {
      icon: "<",
      label: t("close"),
      onClick: navigateToMainReturn,
    };
  }

  if (route.kind === "settingsUnits") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "settings" }),
    };
  }

  if (route.kind === "settingsMasterKeys") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "settings" }),
    };
  }

  if (route.kind === "advanced") {
    return {
      icon: "<",
      label: t("close"),
      onClick: navigateToMainReturn,
    };
  }

  if (route.kind === "advancedAutoPayLimit") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "settings" }),
    };
  }

  if (route.kind === "advancedPushDebug") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "settings" }),
    };
  }

  if (route.kind === "mints") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "settings" }),
    };
  }

  if (route.kind === "mint") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "mints" }),
    };
  }

  if (route.kind === "profile") {
    return {
      icon: "<",
      label: t("close"),
      onClick: navigateToMainReturn,
    };
  }

  if (route.kind === "profileEdit") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "profile" }),
    };
  }

  if (route.kind === "transactions") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "wallet" }),
    };
  }

  if (route.kind === "topup" || route.kind === "topupNoAmount") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () =>
        navigateTo({ route: route.kind === "topup" ? "wallet" : "topup" }),
    };
  }

  if (route.kind === "topupInvoice") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "topup" }),
    };
  }

  if (route.kind === "manualPay" || route.kind === "bankPayment") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "wallet" }),
    };
  }

  if (route.kind === "bankPaymentOffer") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "chat", id: route.chatId }),
    };
  }

  if (
    route.kind === "cashuTokens" ||
    route.kind === "cashuTokenNew" ||
    route.kind === "cashuTokenEmit" ||
    route.kind === "cashuToken"
  ) {
    return {
      icon: "<",
      label: t("close"),
      onClick: () =>
        navigateTo({
          route:
            route.kind === "cashuTokens" || route.kind === "cashuTokenEmit"
              ? "wallet"
              : "cashuTokens",
        }),
    };
  }

  if (route.kind === "evoluData") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "advanced" }),
    };
  }

  if (route.kind === "lnAddressPay") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "contacts" }),
    };
  }

  if (route.kind === "nostrRelays") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "settings" }),
    };
  }

  if (route.kind === "evoluServers") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "settings" }),
    };
  }

  if (route.kind === "nostrRelay") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "nostrRelays" }),
    };
  }

  if (route.kind === "evoluServer") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "evoluServers" }),
    };
  }

  if (route.kind === "evoluServerNew") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "evoluServers" }),
    };
  }

  if (route.kind === "evoluCurrentData") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "evoluServers" }),
    };
  }

  if (route.kind === "evoluHistoryData") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "evoluServers" }),
    };
  }

  if (route.kind === "nostrRelayNew") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "nostrRelays" }),
    };
  }

  if (route.kind === "contactNew") {
    return {
      icon: "<",
      label: t("close"),
      onClick: closeContactDetail,
    };
  }

  if (route.kind === "contact") {
    return {
      icon: "<",
      label: t("close"),
      onClick: closeContactDetail,
    };
  }

  if (route.kind === "contactEdit") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "contact", id: route.id }),
    };
  }

  if (route.kind === "contactPay") {
    const contactId = route.id;
    const backToChat =
      String(contactPayBackToChatId ?? "") === String(contactId ?? "");

    return {
      icon: "<",
      label: t("close"),
      onClick: () => {
        if (backToChat && contactId) {
          navigateTo({ route: "chat", id: contactId });
          return;
        }
        if (contactId) {
          navigateTo({ route: "contact", id: contactId });
          return;
        }
        navigateTo({ route: "contacts" });
      },
    };
  }

  if (route.kind === "chat") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "contacts" }),
    };
  }

  return null;
};

export const buildTopbarRight = ({
  chatEditContactId,
  isProfileEditing,
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

  if (
    route.kind === "settings" ||
    route.kind === "settingsUnits" ||
    route.kind === "settingsMasterKeys" ||
    route.kind === "advanced" ||
    route.kind === "advancedAutoPayLimit" ||
    route.kind === "advancedPushDebug" ||
    route.kind === "mints" ||
    route.kind === "topup" ||
    route.kind === "topupNoAmount" ||
    route.kind === "topupInvoice" ||
    route.kind === "manualPay" ||
    route.kind === "bankPayment" ||
    route.kind === "bankPaymentOffer" ||
    route.kind === "cashuTokens" ||
    route.kind === "cashuTokenEmit" ||
    route.kind === "cashuToken" ||
    route.kind === "transactions" ||
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
  if (route.kind === "settingsUnits") return t("unit");
  if (route.kind === "settingsMasterKeys") return t("masterKeys");
  if (route.kind === "wallet") return t("wallet");
  if (route.kind === "transactions") return t("transactionsTitle");
  if (route.kind === "topup") return t("topupTitle");
  if (route.kind === "topupNoAmount") return t("topupNoAmountTitle");
  if (route.kind === "topupInvoice") return t("topupInvoiceTitle");
  if (route.kind === "manualPay") return t("manualPayTitle");
  if (route.kind === "bankPayment") return t("spdPaymentTitle");
  if (route.kind === "bankPaymentOffer") return t("bankPaymentOfferDetails");
  if (route.kind === "lnAddressPay") return t("pay");
  if (route.kind === "cashuTokens") return t("tokens");
  if (route.kind === "cashuTokenEmit") return t("cashuEmit");
  if (route.kind === "cashuTokenNew") return t("cashuAddToken");
  if (route.kind === "cashuToken") return t("cashuToken");
  if (route.kind === "advanced") return t("settings");
  if (route.kind === "advancedAutoPayLimit") {
    return t("lightningInvoiceAutoPayLimit");
  }
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
  if (route.kind === "evoluCurrentData") return t("evoluData");
  if (route.kind === "evoluHistoryData") return t("evoluHistory");
  if (route.kind === "contactNew") return t("newContact");
  if (route.kind === "contact") return t("contact");
  if (route.kind === "contactEdit") return t("contactEditTitle");
  if (route.kind === "contactPay") return t("contactPayTitle");
  if (route.kind === "chat") return t("messagesTitle");
  return null;
};
