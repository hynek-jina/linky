import { navigateTo } from "../../hooks/useRouting";
import type { ContactId } from "../../evolu";
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
  route: Route;
  selectedContact: { id: ContactId } | null;
  t: (key: string) => string;
  toggleMenu: () => void;
  toggleProfileEditing: () => void;
}

export const buildTopbar = ({
  closeContactDetail,
  contactPayBackToChatId,
  navigateToMainReturn,
  route,
  t,
}: BuildTopbarArgs): TopbarButton | null => {
  if (route.kind === "advanced") {
    return {
      icon: "<",
      label: t("close"),
      onClick: navigateToMainReturn,
    };
  }

  if (route.kind === "mints") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "advanced" }),
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

  if (route.kind === "topup") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "wallet" }),
    };
  }

  if (route.kind === "topupInvoice") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "topup" }),
    };
  }

  if (route.kind === "cashuTokenNew" || route.kind === "cashuToken") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "wallet" }),
    };
  }

  if (route.kind === "credoToken") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "cashuTokenNew" }),
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
      onClick: () => navigateTo({ route: "advanced" }),
    };
  }

  if (route.kind === "evoluServers") {
    return {
      icon: "<",
      label: t("close"),
      onClick: () => navigateTo({ route: "advanced" }),
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
  route,
  selectedContact,
  t,
  toggleMenu,
  toggleProfileEditing,
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

  if (route.kind === "contact" && selectedContact) {
    return {
      icon: "✎",
      label: t("editContact"),
      onClick: () =>
        navigateTo({ route: "contactEdit", id: selectedContact.id }),
    };
  }

  if (route.kind === "chat" && selectedContact) {
    return {
      icon: "✎",
      label: t("editContact"),
      onClick: () =>
        navigateTo({ route: "contactEdit", id: selectedContact.id }),
    };
  }

  if (route.kind === "profile") {
    return {
      icon: "✎",
      label: t("edit"),
      onClick: toggleProfileEditing,
    };
  }

  if (
    route.kind === "advanced" ||
    route.kind === "mints" ||
    route.kind === "cashuToken" ||
    route.kind === "evoluCurrentData" ||
    route.kind === "evoluHistoryData" ||
    route.kind === "contactEdit"
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
  if (route.kind === "wallet") return t("wallet");
  if (route.kind === "topup") return t("topupTitle");
  if (route.kind === "topupInvoice") return t("topupInvoiceTitle");
  if (route.kind === "lnAddressPay") return t("pay");
  if (route.kind === "cashuTokenNew") return t("cashuToken");
  if (route.kind === "cashuToken") return t("cashuToken");
  if (route.kind === "credoToken") return t("credoTokenTitle");
  if (route.kind === "advanced") return t("advanced");
  if (route.kind === "mints") return t("mints");
  if (route.kind === "mint") return t("mints");
  if (route.kind === "profile") return t("profile");
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
