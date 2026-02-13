import type { AppRouteContentProps } from "../AppRouteContent";

type MoneyRouteProps = Pick<
  AppRouteContentProps,
  | "cashuTokenNewProps"
  | "cashuTokenProps"
  | "credoTokenProps"
  | "lnAddressPayProps"
  | "topupInvoiceProps"
  | "topupProps"
>;

interface BuildMoneyRoutePropsParams {
  canPayWithCashu: AppRouteContentProps["lnAddressPayProps"]["canPayWithCashu"];
  cashuBalance: AppRouteContentProps["cashuTokenNewProps"]["cashuBalance"];
  cashuBulkCheckIsBusy: AppRouteContentProps["cashuTokenNewProps"]["cashuBulkCheckIsBusy"];
  cashuDraft: AppRouteContentProps["cashuTokenNewProps"]["cashuDraft"];
  cashuDraftRef: AppRouteContentProps["cashuTokenNewProps"]["cashuDraftRef"];
  cashuIsBusy: AppRouteContentProps["cashuTokenNewProps"]["cashuIsBusy"];
  cashuTokensAll: ReturnType<
    AppRouteContentProps["cashuTokenProps"]
  >["cashuTokensAll"];
  cashuTokensWithMeta: AppRouteContentProps["cashuTokenNewProps"]["cashuTokens"];
  checkAllCashuTokensAndDeleteInvalid: AppRouteContentProps["cashuTokenNewProps"]["checkAllCashuTokensAndDeleteInvalid"];
  checkAndRefreshCashuToken: ReturnType<
    AppRouteContentProps["cashuTokenProps"]
  >["checkAndRefreshCashuToken"];
  contacts: ReturnType<AppRouteContentProps["credoTokenProps"]>["contacts"];
  copyText: ReturnType<AppRouteContentProps["cashuTokenProps"]>["copyText"];
  credoOweTokens: AppRouteContentProps["cashuTokenNewProps"]["credoOweTokens"];
  credoPromisedTokens: AppRouteContentProps["cashuTokenNewProps"]["credoPromisedTokens"];
  credoTokensAll: ReturnType<
    AppRouteContentProps["credoTokenProps"]
  >["credoTokensAll"];
  currentNpub: AppRouteContentProps["topupProps"]["currentNpub"];
  displayUnit: AppRouteContentProps["cashuTokenNewProps"]["displayUnit"];
  effectiveProfileName: AppRouteContentProps["topupProps"]["effectiveProfileName"];
  effectiveProfilePicture: AppRouteContentProps["topupProps"]["effectiveProfilePicture"];
  getCredoRemainingAmount: AppRouteContentProps["cashuTokenNewProps"]["getCredoRemainingAmount"];
  getMintIconUrl: AppRouteContentProps["cashuTokenNewProps"]["getMintIconUrl"];
  lnAddressPayAmount: AppRouteContentProps["lnAddressPayProps"]["lnAddressPayAmount"];
  nostrPictureByNpub: AppRouteContentProps["cashuTokenNewProps"]["nostrPictureByNpub"];
  npubCashLightningAddress: AppRouteContentProps["topupProps"]["npubCashLightningAddress"];
  payLightningAddressWithCashu: AppRouteContentProps["lnAddressPayProps"]["payLightningAddressWithCashu"];
  pendingCashuDeleteId: ReturnType<
    AppRouteContentProps["cashuTokenProps"]
  >["pendingCashuDeleteId"];
  requestDeleteCashuToken: ReturnType<
    AppRouteContentProps["cashuTokenProps"]
  >["requestDeleteCashuToken"];
  route: AppRouteContentProps["route"];
  saveCashuFromText: AppRouteContentProps["cashuTokenNewProps"]["saveCashuFromText"];
  setCashuDraft: AppRouteContentProps["cashuTokenNewProps"]["setCashuDraft"];
  setLnAddressPayAmount: AppRouteContentProps["lnAddressPayProps"]["setLnAddressPayAmount"];
  setMintIconUrlByMint: AppRouteContentProps["cashuTokenNewProps"]["setMintIconUrlByMint"];
  setTopupAmount: AppRouteContentProps["topupProps"]["setTopupAmount"];
  t: AppRouteContentProps["cashuTokenNewProps"]["t"];
  topupAmount: AppRouteContentProps["topupProps"]["topupAmount"];
  topupDebug: AppRouteContentProps["topupInvoiceProps"]["topupDebug"];
  topupInvoice: AppRouteContentProps["topupInvoiceProps"]["topupInvoice"];
  topupInvoiceError: AppRouteContentProps["topupInvoiceProps"]["topupInvoiceError"];
  topupInvoiceIsBusy: AppRouteContentProps["topupInvoiceProps"]["topupInvoiceIsBusy"];
  topupInvoiceQr: AppRouteContentProps["topupInvoiceProps"]["topupInvoiceQr"];
  totalCredoOutstandingIn: AppRouteContentProps["cashuTokenNewProps"]["totalCredoOutstandingIn"];
  totalCredoOutstandingOut: AppRouteContentProps["cashuTokenNewProps"]["totalCredoOutstandingOut"];
}

export const buildMoneyRouteProps = ({
  canPayWithCashu,
  cashuBalance,
  cashuBulkCheckIsBusy,
  cashuDraft,
  cashuDraftRef,
  cashuIsBusy,
  cashuTokensAll,
  cashuTokensWithMeta,
  checkAllCashuTokensAndDeleteInvalid,
  checkAndRefreshCashuToken,
  contacts,
  copyText,
  credoOweTokens,
  credoPromisedTokens,
  credoTokensAll,
  currentNpub,
  displayUnit,
  effectiveProfileName,
  effectiveProfilePicture,
  getCredoRemainingAmount,
  getMintIconUrl,
  lnAddressPayAmount,
  nostrPictureByNpub,
  npubCashLightningAddress,
  payLightningAddressWithCashu,
  pendingCashuDeleteId,
  requestDeleteCashuToken,
  route,
  saveCashuFromText,
  setCashuDraft,
  setLnAddressPayAmount,
  setMintIconUrlByMint,
  setTopupAmount,
  t,
  topupAmount,
  topupDebug,
  topupInvoice,
  topupInvoiceError,
  topupInvoiceIsBusy,
  topupInvoiceQr,
  totalCredoOutstandingIn,
  totalCredoOutstandingOut,
}: BuildMoneyRoutePropsParams): MoneyRouteProps => {
  return {
    cashuTokenNewProps: {
      cashuBalance,
      cashuBulkCheckIsBusy,
      totalCredoOutstandingIn,
      totalCredoOutstandingOut,
      displayUnit,
      cashuTokens: cashuTokensWithMeta,
      cashuDraft,
      setCashuDraft,
      cashuDraftRef,
      cashuIsBusy,
      checkAllCashuTokensAndDeleteInvalid,
      credoOweTokens,
      credoPromisedTokens,
      nostrPictureByNpub,
      setMintIconUrlByMint,
      saveCashuFromText,
      getMintIconUrl,
      getCredoRemainingAmount,
      t,
    },
    cashuTokenProps: () => {
      if (route.kind !== "cashuToken") {
        throw new Error("invalid route for cashu token");
      }
      return {
        cashuTokensAll,
        routeId: route.id,
        cashuIsBusy,
        pendingCashuDeleteId,
        checkAndRefreshCashuToken,
        copyText,
        requestDeleteCashuToken,
        t,
      };
    },
    credoTokenProps: () => {
      if (route.kind !== "credoToken") {
        throw new Error("invalid route for credo token");
      }
      return {
        credoTokensAll,
        routeId: route.id,
        contacts,
        displayUnit,
        getCredoRemainingAmount,
        t,
      };
    },
    lnAddressPayProps: {
      lnAddress: route.kind === "lnAddressPay" ? route.lnAddress : "",
      cashuBalance,
      canPayWithCashu,
      cashuIsBusy,
      lnAddressPayAmount,
      setLnAddressPayAmount,
      displayUnit,
      payLightningAddressWithCashu,
      t,
    },
    topupInvoiceProps: {
      topupAmount,
      topupDebug,
      topupInvoiceQr,
      topupInvoice,
      topupInvoiceError,
      topupInvoiceIsBusy,
      displayUnit,
      copyText,
      t,
    },
    topupProps: {
      effectiveProfilePicture,
      effectiveProfileName,
      currentNpub,
      npubCashLightningAddress,
      topupAmount,
      setTopupAmount,
      topupInvoiceIsBusy,
      displayUnit,
      t,
    },
  };
};
