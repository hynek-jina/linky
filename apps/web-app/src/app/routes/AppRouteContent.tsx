import React from "react";
import {
  AdvancedPage,
  CashuTokenNewPage,
  CashuTokenPage,
  ChatPage,
  ContactEditPage,
  ContactNewPage,
  ContactPage,
  ContactPayPage,
  CredoTokenPage,
  EvoluCurrentDataPage,
  EvoluDataDetailPage,
  EvoluHistoryDataPage,
  EvoluServerNewPage,
  EvoluServerPage,
  EvoluServersPage,
  LnAddressPayPage,
  MintDetailPage,
  MintsPage,
  NostrRelayNewPage,
  NostrRelayPage,
  NostrRelaysPage,
  ProfilePage,
  TopupInvoicePage,
  TopupPage,
} from "../../pages";
import {
  useAppShellCore,
  useAppShellRouteContext,
  useMoneyRoutes,
  usePeopleRoutes,
  useSystemRoutes,
} from "../context/AppShellContexts";
import { MainSwipeContent, type MainSwipeRouteProps } from "./MainSwipeContent";

export interface PeopleRoutesProps {
  chatProps: React.ComponentProps<typeof ChatPage>;
  contactEditProps: React.ComponentProps<typeof ContactEditPage>;
  contactNewProps: React.ComponentProps<typeof ContactNewPage>;
  contactPayProps: React.ComponentProps<typeof ContactPayPage>;
  contactProps: React.ComponentProps<typeof ContactPage>;
  profileProps: React.ComponentProps<typeof ProfilePage>;
}

export interface MoneyRoutesProps {
  cashuTokenNewProps: React.ComponentProps<typeof CashuTokenNewPage>;
  cashuTokenProps: () => React.ComponentProps<typeof CashuTokenPage>;
  credoTokenProps: () => React.ComponentProps<typeof CredoTokenPage>;
  lnAddressPayProps: React.ComponentProps<typeof LnAddressPayPage>;
  topupInvoiceProps: React.ComponentProps<typeof TopupInvoicePage>;
  topupProps: React.ComponentProps<typeof TopupPage>;
}

export interface SystemRoutesProps {
  advancedProps: React.ComponentProps<typeof AdvancedPage>;
  evoluCurrentDataProps: React.ComponentProps<typeof EvoluCurrentDataPage>;
  evoluDataDetailProps: React.ComponentProps<typeof EvoluDataDetailPage>;
  evoluHistoryDataProps: React.ComponentProps<typeof EvoluHistoryDataPage>;
  evoluServerNewProps: React.ComponentProps<typeof EvoluServerNewPage>;
  evoluServerProps: React.ComponentProps<typeof EvoluServerPage>;
  evoluServersProps: React.ComponentProps<typeof EvoluServersPage>;
  mintDetailProps: React.ComponentProps<typeof MintDetailPage>;
  mintsProps: React.ComponentProps<typeof MintsPage>;
  nostrRelayNewProps: React.ComponentProps<typeof NostrRelayNewPage>;
  nostrRelayProps: React.ComponentProps<typeof NostrRelayPage>;
  nostrRelaysProps: React.ComponentProps<typeof NostrRelaysPage>;
}

export interface MainSwipeRoutesProps {
  mainSwipeProps: MainSwipeRouteProps;
}

export const AppRouteContent = (): React.ReactElement => {
  const { route } = useAppShellCore();
  const { isMainSwipeRoute } = useAppShellRouteContext();
  const peopleRoutes = usePeopleRoutes();
  const moneyRoutes = useMoneyRoutes();
  const systemRoutes = useSystemRoutes();

  return (
    <>
      {route.kind === "advanced" && (
        <AdvancedPage {...systemRoutes.advancedProps} />
      )}

      {route.kind === "mints" && <MintsPage {...systemRoutes.mintsProps} />}

      {route.kind === "mint" && (
        <MintDetailPage {...systemRoutes.mintDetailProps} />
      )}

      {route.kind === "evoluServers" && (
        <EvoluServersPage {...systemRoutes.evoluServersProps} />
      )}

      {route.kind === "evoluCurrentData" && (
        <EvoluCurrentDataPage {...systemRoutes.evoluCurrentDataProps} />
      )}

      {route.kind === "evoluHistoryData" && (
        <EvoluHistoryDataPage {...systemRoutes.evoluHistoryDataProps} />
      )}

      {route.kind === "evoluServer" && (
        <EvoluServerPage {...systemRoutes.evoluServerProps} />
      )}

      {route.kind === "evoluServerNew" && (
        <EvoluServerNewPage {...systemRoutes.evoluServerNewProps} />
      )}

      {route.kind === "evoluData" && (
        <EvoluDataDetailPage {...systemRoutes.evoluDataDetailProps} />
      )}

      {route.kind === "nostrRelays" && (
        <NostrRelaysPage {...systemRoutes.nostrRelaysProps} />
      )}

      {route.kind === "nostrRelayNew" && (
        <NostrRelayNewPage {...systemRoutes.nostrRelayNewProps} />
      )}

      {route.kind === "nostrRelay" && (
        <NostrRelayPage {...systemRoutes.nostrRelayProps} />
      )}

      {isMainSwipeRoute && <MainSwipeContent />}

      {route.kind === "topup" && <TopupPage {...moneyRoutes.topupProps} />}

      {route.kind === "topupInvoice" && (
        <TopupInvoicePage {...moneyRoutes.topupInvoiceProps} />
      )}

      {route.kind === "cashuTokenNew" && (
        <CashuTokenNewPage {...moneyRoutes.cashuTokenNewProps} />
      )}

      {route.kind === "cashuToken" && (
        <CashuTokenPage {...moneyRoutes.cashuTokenProps()} />
      )}

      {route.kind === "credoToken" && (
        <CredoTokenPage {...moneyRoutes.credoTokenProps()} />
      )}

      {route.kind === "contact" && (
        <ContactPage {...peopleRoutes.contactProps} />
      )}

      {route.kind === "contactPay" && (
        <ContactPayPage {...peopleRoutes.contactPayProps} />
      )}

      {route.kind === "lnAddressPay" && (
        <LnAddressPayPage {...moneyRoutes.lnAddressPayProps} />
      )}

      {route.kind === "chat" && <ChatPage {...peopleRoutes.chatProps} />}

      {route.kind === "contactEdit" && (
        <ContactEditPage {...peopleRoutes.contactEditProps} />
      )}

      {route.kind === "contactNew" && (
        <ContactNewPage {...peopleRoutes.contactNewProps} />
      )}

      {route.kind === "profile" && (
        <ProfilePage {...peopleRoutes.profileProps} />
      )}
    </>
  );
};
