import React from "react";
import type { ContactId } from "../../../evolu";
import { navigateTo } from "../../../hooks/useRouting";
import type { Route } from "../../../types/route";
import type { ContactsGuideKey, ContactsGuideStep } from "../../types/appTypes";

interface UseContactsGuideParams {
  cashuBalance: number;
  contacts: readonly Record<string, unknown>[];
  contactsOnboardingHasPaid: boolean;
  contactsOnboardingHasSentMessage: boolean;
  openMenu: () => void;
  openNewContactPage: () => void;
  route: Route;
}

interface ContactsGuideState {
  step: number;
  task: ContactsGuideKey;
}

export const useContactsGuide = ({
  cashuBalance,
  contacts,
  contactsOnboardingHasPaid,
  contactsOnboardingHasSentMessage,
  openMenu,
  openNewContactPage,
  route,
}: UseContactsGuideParams) => {
  const [contactsGuide, setContactsGuide] =
    React.useState<ContactsGuideState | null>(null);

  const [contactsGuideTargetContactId, setContactsGuideTargetContactId] =
    React.useState<ContactId | null>(null);

  const [contactsGuideHighlightRect, setContactsGuideHighlightRect] =
    React.useState<null | {
      height: number;
      left: number;
      top: number;
      width: number;
    }>(null);

  const startContactsGuide = React.useCallback((task: ContactsGuideKey) => {
    setContactsGuideTargetContactId(null);
    setContactsGuide({ task, step: 0 });
  }, []);

  const stopContactsGuide = React.useCallback(() => {
    setContactsGuideTargetContactId(null);
    setContactsGuide(null);
  }, []);

  const contactsGuideSteps = React.useMemo(() => {
    if (!contactsGuide) return null;

    const firstContactId = (contacts[0]?.id ?? null) as ContactId | null;
    const routeContactId =
      route.kind === "contact" ||
      route.kind === "contactPay" ||
      route.kind === "chat"
        ? ((route as { id?: unknown }).id as ContactId | null)
        : null;

    const targetContactId =
      contactsGuideTargetContactId ?? routeContactId ?? firstContactId;

    const ensureRoute = (kind: Route["kind"], contactId?: ContactId | null) => {
      if (route.kind === kind) {
        if (kind === "contact" || kind === "contactPay" || kind === "chat") {
          const currentId = (route as { id?: unknown }).id as
            | ContactId
            | undefined;

          if (contactId && currentId && currentId !== contactId) {
            if (kind === "contact")
              navigateTo({ route: "contact", id: contactId });
            if (kind === "contactPay") {
              navigateTo({ route: "contactPay", id: contactId });
            }
            if (kind === "chat") navigateTo({ route: "chat", id: contactId });
          }
        }
        return;
      }

      if (kind === "contacts") navigateTo({ route: "contacts" });
      if (kind === "wallet") navigateTo({ route: "wallet" });
      if (kind === "advanced") navigateTo({ route: "advanced" });
      if (kind === "topup") navigateTo({ route: "topup" });
      if (kind === "topupInvoice") navigateTo({ route: "topupInvoice" });
      if (kind === "contactNew") openNewContactPage();
      if (kind === "contact" && contactId) {
        navigateTo({ route: "contact", id: contactId });
      }
      if (kind === "contactPay" && contactId) {
        navigateTo({ route: "contactPay", id: contactId });
      }
      if (kind === "chat" && contactId)
        navigateTo({ route: "chat", id: contactId });
    };

    const stepsByTask: Record<ContactsGuideKey, ContactsGuideStep[]> = {
      add_contact: [
        {
          id: "add_contact_1",
          selector: '[data-guide="profile-qr-button"]',
          titleKey: "guideAddContactStep1Title",
          bodyKey: "guideAddContactStep1Body",
          ensure: () => ensureRoute("contacts"),
        },
        {
          id: "add_contact_2",
          selector: '[data-guide="contact-add-button"]',
          titleKey: "guideAddContactStep2Title",
          bodyKey: "guideAddContactStep2Body",
          ensure: () => ensureRoute("contacts"),
        },
        {
          id: "add_contact_3",
          selector: '[data-guide="contact-save"]',
          titleKey: "guideAddContactStep3Title",
          bodyKey: "guideAddContactStep3Body",
          ensure: () => ensureRoute("contactNew"),
        },
      ],
      topup: [
        {
          id: "topup_1",
          selector: '[data-guide="open-wallet"]',
          titleKey: "guideTopupStep1Title",
          bodyKey: "guideTopupStep1Body",
          ensure: () => ensureRoute("contacts"),
        },
        {
          id: "topup_2",
          selector: '[data-guide="wallet-topup"]',
          titleKey: "guideTopupStep2Title",
          bodyKey: "guideTopupStep2Body",
          ensure: () => ensureRoute("wallet"),
        },
        {
          id: "topup_3",
          selector: '[data-guide="topup-show-invoice"]',
          titleKey: "guideTopupStep3Title",
          bodyKey: "guideTopupStep3Body",
          ensure: () => ensureRoute("topup"),
        },
      ],
      pay: [
        {
          id: "pay_1",
          selector: '[data-guide="contact-card"]',
          titleKey: "guidePayStep1Title",
          bodyKey: "guidePayStep1Body",
          ensure: () => ensureRoute("contacts"),
        },
        {
          id: "pay_2",
          selector: '[data-guide="contact-pay"]',
          titleKey: "guidePayStep2Title",
          bodyKey: "guidePayStep2Body",
          ensure: () => ensureRoute("contact", targetContactId),
        },
        {
          id: "pay_3",
          selector: '[data-guide="pay-step3"]',
          titleKey: "guidePayStep3Title",
          bodyKey: "guidePayStep3Body",
          ensure: () => ensureRoute("contactPay", targetContactId),
        },
      ],
      message: [
        {
          id: "message_1",
          selector: '[data-guide="contact-card"]',
          titleKey: "guideMessageStep1Title",
          bodyKey: "guideMessageStep1Body",
          ensure: () => ensureRoute("contacts"),
        },
        {
          id: "message_2",
          selector: '[data-guide="contact-message"]',
          titleKey: "guideMessageStep2Title",
          bodyKey: "guideMessageStep2Body",
          ensure: () => ensureRoute("contact", targetContactId),
        },
        {
          id: "message_3",
          selector: '[data-guide="chat-input"]',
          titleKey: "guideMessageStep3Title",
          bodyKey: "guideMessageStep3Body",
          ensure: () => ensureRoute("chat", targetContactId),
        },
        {
          id: "message_4",
          selector: '[data-guide="chat-send"]',
          titleKey: "guideMessageStep4Title",
          bodyKey: "guideMessageStep4Body",
          ensure: () => ensureRoute("chat", targetContactId),
        },
      ],
      backup_keys: [
        {
          id: "backup_keys_1",
          selector: '[data-guide="open-menu"]',
          titleKey: "guideBackupKeysStep1Title",
          bodyKey: "guideBackupKeysStep1Body",
          ensure: () => ensureRoute("contacts"),
        },
        {
          id: "backup_keys_2",
          selector: '[data-guide="open-advanced"]',
          titleKey: "guideBackupKeysStep2Title",
          bodyKey: "guideBackupKeysStep2Body",
          ensure: () => {
            ensureRoute("contacts");
            openMenu();
          },
        },
        {
          id: "backup_keys_3",
          selector: '[data-guide="copy-nostr-keys"]',
          titleKey: "guideBackupKeysStep3Title",
          bodyKey: "guideBackupKeysStep3Body",
          ensure: () => ensureRoute("advanced"),
        },
      ],
    };

    return stepsByTask[contactsGuide.task] ?? null;
  }, [
    contacts,
    contactsGuide,
    contactsGuideTargetContactId,
    openMenu,
    openNewContactPage,
    route,
  ]);

  const contactsGuideActiveStep = React.useMemo(() => {
    if (!contactsGuide || !contactsGuideSteps) return null;

    const idx = Math.min(
      Math.max(contactsGuide.step, 0),
      Math.max(contactsGuideSteps.length - 1, 0),
    );

    return {
      idx,
      step: contactsGuideSteps[idx] ?? null,
      total: contactsGuideSteps.length,
    };
  }, [contactsGuide, contactsGuideSteps]);

  React.useEffect(() => {
    const active = contactsGuideActiveStep?.step ?? null;
    if (!contactsGuide || !active) return;

    try {
      active.ensure?.();
    } catch {
      // ignore
    }
  }, [contactsGuide, contactsGuideActiveStep]);

  const contactsGuidePrevRouteRef = React.useRef<{
    id: string | null;
    kind: Route["kind"];
  } | null>(null);

  React.useEffect(() => {
    if (!contactsGuide || !contactsGuideActiveStep?.step) {
      contactsGuidePrevRouteRef.current = {
        kind: route.kind,
        id:
          route.kind === "contact" ||
          route.kind === "contactPay" ||
          route.kind === "chat"
            ? String((route as { id?: unknown }).id ?? "") || null
            : null,
      };
      return;
    }

    const prev = contactsGuidePrevRouteRef.current;
    const current = {
      kind: route.kind,
      id:
        route.kind === "contact" ||
        route.kind === "contactPay" ||
        route.kind === "chat"
          ? String((route as { id?: unknown }).id ?? "") || null
          : null,
    };

    contactsGuidePrevRouteRef.current = current;

    const id = contactsGuideActiveStep.step.id;

    const goToStep = (step: number) => {
      setContactsGuide((prevGuide) => {
        if (!prevGuide) return prevGuide;
        if (prevGuide.task !== contactsGuide.task) return prevGuide;
        if (prevGuide.step === step) return prevGuide;
        return { ...prevGuide, step };
      });
    };

    const transition = (from: Route["kind"], to: Route["kind"]) =>
      Boolean(prev && prev.kind === from && current.kind === to);

    if (
      (contactsGuide.task === "pay" || contactsGuide.task === "message") &&
      transition("contacts", "contact") &&
      current.id
    ) {
      setContactsGuideTargetContactId(current.id as ContactId);
    }

    if (id === "add_contact_1" && transition("contacts", "contactNew")) {
      goToStep(1);
    }

    if (
      id === "add_contact_2" &&
      prev &&
      prev.kind === "contactNew" &&
      current.kind !== "contactNew"
    ) {
      goToStep(2);
    }

    if (id === "topup_1" && transition("contacts", "wallet")) goToStep(1);
    if (id === "topup_2" && transition("wallet", "topup")) goToStep(2);
    if (id === "topup_3" && transition("topup", "topupInvoice")) {
      stopContactsGuide();
    }

    if (id === "pay_1" && transition("contacts", "contact")) goToStep(1);
    if (id === "pay_2" && transition("contact", "contactPay")) goToStep(2);

    if (id === "message_1" && transition("contacts", "contact")) {
      goToStep(1);
    }
    if (id === "message_2" && transition("contact", "chat")) goToStep(2);

    if (contactsGuide.task === "topup" && cashuBalance > 0) stopContactsGuide();
    if (contactsGuide.task === "pay" && contactsOnboardingHasPaid) {
      stopContactsGuide();
    }
    if (contactsGuide.task === "message" && contactsOnboardingHasSentMessage) {
      stopContactsGuide();
    }
  }, [
    cashuBalance,
    contactsGuide,
    contactsGuideActiveStep?.step,
    contactsOnboardingHasPaid,
    contactsOnboardingHasSentMessage,
    route,
    stopContactsGuide,
  ]);

  React.useEffect(() => {
    const active = contactsGuideActiveStep?.step ?? null;
    if (!contactsGuide || !active) {
      setContactsGuideHighlightRect(null);
      return;
    }

    const updateRect = () => {
      const el = document.querySelector(active.selector) as HTMLElement | null;
      if (!el) {
        setContactsGuideHighlightRect(null);
        return;
      }
      try {
        el.scrollIntoView({ block: "center", inline: "center" });
      } catch {
        // ignore
      }

      const r = el.getBoundingClientRect();
      const pad = 8;
      setContactsGuideHighlightRect({
        top: Math.max(r.top - pad, 8),
        left: Math.max(r.left - pad, 8),
        width: Math.min(r.width + pad * 2, window.innerWidth - 16),
        height: Math.min(r.height + pad * 2, window.innerHeight - 16),
      });
    };

    updateRect();

    const onResize = () => updateRect();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize);
    };
  }, [contactsGuide, contactsGuideActiveStep, route.kind]);

  const contactsGuideNav = {
    back: () => {
      if (!contactsGuide) return;
      setContactsGuide((prev) =>
        prev ? { ...prev, step: Math.max(prev.step - 1, 0) } : prev,
      );
    },
    next: () => {
      if (!contactsGuideSteps || !contactsGuide) return;
      setContactsGuide((prev) => {
        if (!prev) return prev;
        const max = Math.max(contactsGuideSteps.length - 1, 0);
        if (prev.step >= max) return null;
        return { ...prev, step: prev.step + 1 };
      });
    },
  };

  return {
    contactsGuide,
    contactsGuideActiveStep,
    contactsGuideHighlightRect,
    contactsGuideNav,
    startContactsGuide,
    stopContactsGuide,
  };
};
