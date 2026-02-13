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
import type { Route } from "../../types/route";
import { MainSwipeContent } from "./MainSwipeContent";

export interface AppRouteContentProps {
  advancedProps: React.ComponentProps<typeof AdvancedPage>;
  cashuTokenNewProps: React.ComponentProps<typeof CashuTokenNewPage>;
  cashuTokenProps: () => React.ComponentProps<typeof CashuTokenPage>;
  chatProps: React.ComponentProps<typeof ChatPage>;
  contactEditProps: React.ComponentProps<typeof ContactEditPage>;
  contactNewProps: React.ComponentProps<typeof ContactNewPage>;
  contactPayProps: React.ComponentProps<typeof ContactPayPage>;
  contactProps: React.ComponentProps<typeof ContactPage>;
  credoTokenProps: () => React.ComponentProps<typeof CredoTokenPage>;
  evoluCurrentDataProps: React.ComponentProps<typeof EvoluCurrentDataPage>;
  evoluDataDetailProps: React.ComponentProps<typeof EvoluDataDetailPage>;
  evoluHistoryDataProps: React.ComponentProps<typeof EvoluHistoryDataPage>;
  evoluServerNewProps: React.ComponentProps<typeof EvoluServerNewPage>;
  evoluServerProps: React.ComponentProps<typeof EvoluServerPage>;
  evoluServersProps: React.ComponentProps<typeof EvoluServersPage>;
  isMainSwipeRoute: boolean;
  lnAddressPayProps: React.ComponentProps<typeof LnAddressPayPage>;
  mainSwipeProps: React.ComponentProps<typeof MainSwipeContent>;
  mintDetailProps: React.ComponentProps<typeof MintDetailPage>;
  mintsProps: React.ComponentProps<typeof MintsPage>;
  nostrRelayNewProps: React.ComponentProps<typeof NostrRelayNewPage>;
  nostrRelayProps: React.ComponentProps<typeof NostrRelayPage>;
  nostrRelaysProps: React.ComponentProps<typeof NostrRelaysPage>;
  profileProps: React.ComponentProps<typeof ProfilePage>;
  route: Route;
  topupInvoiceProps: React.ComponentProps<typeof TopupInvoicePage>;
  topupProps: React.ComponentProps<typeof TopupPage>;
}

export const AppRouteContent = ({
  advancedProps,
  cashuTokenNewProps,
  cashuTokenProps,
  chatProps,
  contactEditProps,
  contactNewProps,
  contactPayProps,
  contactProps,
  credoTokenProps,
  evoluCurrentDataProps,
  evoluDataDetailProps,
  evoluHistoryDataProps,
  evoluServerNewProps,
  evoluServerProps,
  evoluServersProps,
  isMainSwipeRoute,
  lnAddressPayProps,
  mainSwipeProps,
  mintDetailProps,
  mintsProps,
  nostrRelayNewProps,
  nostrRelayProps,
  nostrRelaysProps,
  profileProps,
  route,
  topupInvoiceProps,
  topupProps,
}: AppRouteContentProps): React.ReactElement => {
  return (
    <>
      {route.kind === "advanced" && <AdvancedPage {...advancedProps} />}

      {route.kind === "mints" && <MintsPage {...mintsProps} />}

      {route.kind === "mint" && <MintDetailPage {...mintDetailProps} />}

      {route.kind === "evoluServers" && (
        <EvoluServersPage {...evoluServersProps} />
      )}

      {route.kind === "evoluCurrentData" && (
        <EvoluCurrentDataPage {...evoluCurrentDataProps} />
      )}

      {route.kind === "evoluHistoryData" && (
        <EvoluHistoryDataPage {...evoluHistoryDataProps} />
      )}

      {route.kind === "evoluServer" && (
        <EvoluServerPage {...evoluServerProps} />
      )}

      {route.kind === "evoluServerNew" && (
        <EvoluServerNewPage {...evoluServerNewProps} />
      )}

      {route.kind === "evoluData" && (
        <EvoluDataDetailPage {...evoluDataDetailProps} />
      )}

      {route.kind === "nostrRelays" && (
        <NostrRelaysPage {...nostrRelaysProps} />
      )}

      {route.kind === "nostrRelayNew" && (
        <NostrRelayNewPage {...nostrRelayNewProps} />
      )}

      {route.kind === "nostrRelay" && <NostrRelayPage {...nostrRelayProps} />}

      {isMainSwipeRoute && <MainSwipeContent {...mainSwipeProps} />}

      {route.kind === "topup" && <TopupPage {...topupProps} />}

      {route.kind === "topupInvoice" && (
        <TopupInvoicePage {...topupInvoiceProps} />
      )}

      {route.kind === "cashuTokenNew" && (
        <CashuTokenNewPage {...cashuTokenNewProps} />
      )}

      {route.kind === "cashuToken" && <CashuTokenPage {...cashuTokenProps()} />}

      {route.kind === "credoToken" && <CredoTokenPage {...credoTokenProps()} />}

      {route.kind === "contact" && <ContactPage {...contactProps} />}

      {route.kind === "contactPay" && <ContactPayPage {...contactPayProps} />}

      {route.kind === "lnAddressPay" && (
        <LnAddressPayPage {...lnAddressPayProps} />
      )}

      {route.kind === "chat" && <ChatPage {...chatProps} />}

      {route.kind === "contactEdit" && (
        <ContactEditPage {...contactEditProps} />
      )}

      {route.kind === "contactNew" && <ContactNewPage {...contactNewProps} />}

      {route.kind === "profile" && <ProfilePage {...profileProps} />}
    </>
  );
};
