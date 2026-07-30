import React from "react";
import {
  AdvancedAutoPayLimitPage,
  BankPaymentOfferDetailPage,
  AdvancedPage,
  CashuTokenEmitPage,
  CashuTokenNewPage,
  CashuTokenPage,
  CashuTokensPage,
  ChatPage,
  ContactEditPage,
  ContactNewPage,
  ContactPage,
  ContactPayPage,
  EvoluCurrentDataPage,
  EvoluDataDetailPage,
  EvoluHistoryDataPage,
  EvoluServerNewPage,
  EvoluServerPage,
  EvoluServersPage,
  LnAddressPayPage,
  ManualPayPage,
  MasterKeysPage,
  MintDetailPage,
  MintsPage,
  NostrRelayNewPage,
  NostrRelayPage,
  NostrRelaysPage,
  ProfilePage,
  PushDebugPage,
  SettingsPage,
  SpdPaymentPage,
  TopupInvoicePage,
  TopupNoAmountPage,
  TopupPage,
  TransactionsPage,
} from "../../pages";
import {
  useAppShellCore,
  useMoneyRoutes,
  usePeopleRoutes,
  useSystemRoutes,
} from "../context/AppShellContexts";
import { MainSwipeContent, type MainSwipeRouteProps } from "./MainSwipeContent";

export interface PeopleRoutesProps {
  bankPaymentOfferDetailProps: () => React.ComponentProps<
    typeof BankPaymentOfferDetailPage
  >;
  chatProps: React.ComponentProps<typeof ChatPage>;
  contactEditProps: React.ComponentProps<typeof ContactEditPage>;
  contactNewProps: React.ComponentProps<typeof ContactNewPage>;
  contactPayProps: React.ComponentProps<typeof ContactPayPage>;
  contactProps: React.ComponentProps<typeof ContactPage>;
  profileProps: React.ComponentProps<typeof ProfilePage>;
}

export interface MoneyRoutesProps {
  cashuTokenEmitProps: React.ComponentProps<typeof CashuTokenEmitPage>;
  cashuTokenNewProps: React.ComponentProps<typeof CashuTokenNewPage>;
  cashuTokenProps: () => React.ComponentProps<typeof CashuTokenPage>;
  cashuTokensProps: React.ComponentProps<typeof CashuTokensPage>;
  lnAddressPayProps: React.ComponentProps<typeof LnAddressPayPage>;
  manualPayProps: React.ComponentProps<typeof ManualPayPage>;
  spdPaymentProps: React.ComponentProps<typeof SpdPaymentPage>;
  topupInvoiceProps: React.ComponentProps<typeof TopupInvoicePage>;
  topupProps: React.ComponentProps<typeof TopupPage>;
}

export interface SystemRoutesProps {
  advancedProps: React.ComponentProps<typeof AdvancedPage>;
  advancedAutoPayLimitProps: React.ComponentProps<
    typeof AdvancedAutoPayLimitPage
  >;
  advancedPushDebugProps: React.ComponentProps<typeof PushDebugPage>;
  evoluCurrentDataProps: React.ComponentProps<typeof EvoluCurrentDataPage>;
  evoluDataDetailProps: React.ComponentProps<typeof EvoluDataDetailPage>;
  evoluHistoryDataProps: React.ComponentProps<typeof EvoluHistoryDataPage>;
  evoluServerNewProps: React.ComponentProps<typeof EvoluServerNewPage>;
  evoluServerProps: React.ComponentProps<typeof EvoluServerPage>;
  evoluServersProps: React.ComponentProps<typeof EvoluServersPage>;
  mintDetailProps: React.ComponentProps<typeof MintDetailPage>;
  masterKeysProps: React.ComponentProps<typeof MasterKeysPage>;
  mintsProps: React.ComponentProps<typeof MintsPage>;
  nostrRelayNewProps: React.ComponentProps<typeof NostrRelayNewPage>;
  nostrRelayProps: React.ComponentProps<typeof NostrRelayPage>;
  nostrRelaysProps: React.ComponentProps<typeof NostrRelaysPage>;
}

export interface MainSwipeRoutesProps {
  mainSwipeProps: MainSwipeRouteProps;
}

const assertNever = (route: never): never => {
  throw new Error(`Unhandled app route: ${JSON.stringify(route)}`);
};

export const AppRouteContent = (): React.ReactElement => {
  const { route } = useAppShellCore();
  const peopleRoutes = usePeopleRoutes();
  const moneyRoutes = useMoneyRoutes();
  const systemRoutes = useSystemRoutes();

  switch (route.kind) {
    case "contacts":
    case "wallet":
      return <MainSwipeContent />;
    case "settings":
    case "advanced":
      return <AdvancedPage {...systemRoutes.advancedProps} />;
    case "settingsUnits":
      return <SettingsPage />;
    case "settingsMasterKeys":
      return <MasterKeysPage {...systemRoutes.masterKeysProps} />;
    case "advancedAutoPayLimit":
      return (
        <AdvancedAutoPayLimitPage {...systemRoutes.advancedAutoPayLimitProps} />
      );
    case "advancedPushDebug":
      return <PushDebugPage {...systemRoutes.advancedPushDebugProps} />;
    case "mints":
      return <MintsPage {...systemRoutes.mintsProps} />;
    case "mint":
      return <MintDetailPage {...systemRoutes.mintDetailProps} />;
    case "evoluServers":
      return <EvoluServersPage {...systemRoutes.evoluServersProps} />;
    case "evoluCurrentData":
      return <EvoluCurrentDataPage {...systemRoutes.evoluCurrentDataProps} />;
    case "evoluHistoryData":
      return <EvoluHistoryDataPage {...systemRoutes.evoluHistoryDataProps} />;
    case "evoluServer":
      return <EvoluServerPage {...systemRoutes.evoluServerProps} />;
    case "evoluServerNew":
      return <EvoluServerNewPage {...systemRoutes.evoluServerNewProps} />;
    case "evoluData":
      return <EvoluDataDetailPage {...systemRoutes.evoluDataDetailProps} />;
    case "nostrRelays":
      return <NostrRelaysPage {...systemRoutes.nostrRelaysProps} />;
    case "nostrRelayNew":
      return <NostrRelayNewPage {...systemRoutes.nostrRelayNewProps} />;
    case "nostrRelay":
      return <NostrRelayPage {...systemRoutes.nostrRelayProps} />;
    case "topup":
      return <TopupPage {...moneyRoutes.topupProps} />;
    case "transactions":
      return <TransactionsPage />;
    case "topupNoAmount":
      return <TopupNoAmountPage />;
    case "topupInvoice":
      return <TopupInvoicePage {...moneyRoutes.topupInvoiceProps} />;
    case "cashuTokens":
      return <CashuTokensPage {...moneyRoutes.cashuTokensProps} />;
    case "cashuTokenNew":
      return <CashuTokenNewPage {...moneyRoutes.cashuTokenNewProps} />;
    case "cashuTokenEmit":
      return <CashuTokenEmitPage {...moneyRoutes.cashuTokenEmitProps} />;
    case "cashuToken":
      return <CashuTokenPage {...moneyRoutes.cashuTokenProps()} />;
    case "contact":
      return <ContactPage {...peopleRoutes.contactProps} />;
    case "contactPay":
      return <ContactPayPage {...peopleRoutes.contactPayProps} />;
    case "lnAddressPay":
      return <LnAddressPayPage {...moneyRoutes.lnAddressPayProps} />;
    case "manualPay":
      return <ManualPayPage {...moneyRoutes.manualPayProps} />;
    case "bankPayment":
      return <SpdPaymentPage {...moneyRoutes.spdPaymentProps} />;
    case "bankPaymentOffer":
      return (
        <BankPaymentOfferDetailPage
          {...peopleRoutes.bankPaymentOfferDetailProps()}
        />
      );
    case "chat":
      return <ChatPage {...peopleRoutes.chatProps} />;
    case "contactEdit":
      return <ContactEditPage {...peopleRoutes.contactEditProps} />;
    case "contactNew":
      return <ContactNewPage {...peopleRoutes.contactNewProps} />;
    case "profile":
    case "profileEdit":
      return <ProfilePage {...peopleRoutes.profileProps} />;
    default:
      return assertNever(route satisfies never);
  }
};
