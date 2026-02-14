import type { MoneyRoutesProps } from "../AppRouteContent";
import type { Route } from "../../../types/route";

type MoneyRouteProps = MoneyRoutesProps;

interface BuildMoneyRoutePropsParams {
  canPayWithCashu: MoneyRoutesProps["lnAddressPayProps"]["canPayWithCashu"];
  cashuBalance: MoneyRoutesProps["cashuTokenNewProps"]["cashuBalance"];
  cashuBulkCheckIsBusy: MoneyRoutesProps["cashuTokenNewProps"]["cashuBulkCheckIsBusy"];
  cashuDraft: MoneyRoutesProps["cashuTokenNewProps"]["cashuDraft"];
  cashuDraftRef: MoneyRoutesProps["cashuTokenNewProps"]["cashuDraftRef"];
  cashuIsBusy: MoneyRoutesProps["cashuTokenNewProps"]["cashuIsBusy"];
  cashuTokensAll: ReturnType<
    MoneyRoutesProps["cashuTokenProps"]
  >["cashuTokensAll"];
  cashuTokensWithMeta: MoneyRoutesProps["cashuTokenNewProps"]["cashuTokens"];
  checkAllCashuTokensAndDeleteInvalid: MoneyRoutesProps["cashuTokenNewProps"]["checkAllCashuTokensAndDeleteInvalid"];
  checkAndRefreshCashuToken: ReturnType<
    MoneyRoutesProps["cashuTokenProps"]
  >["checkAndRefreshCashuToken"];
  contacts: ReturnType<MoneyRoutesProps["credoTokenProps"]>["contacts"];
  copyText: ReturnType<MoneyRoutesProps["cashuTokenProps"]>["copyText"];
  credoOweTokens: MoneyRoutesProps["cashuTokenNewProps"]["credoOweTokens"];
  credoPromisedTokens: MoneyRoutesProps["cashuTokenNewProps"]["credoPromisedTokens"];
  credoTokensAll: ReturnType<
    MoneyRoutesProps["credoTokenProps"]
  >["credoTokensAll"];
  currentNpub: MoneyRoutesProps["topupProps"]["currentNpub"];
  displayUnit: MoneyRoutesProps["cashuTokenNewProps"]["displayUnit"];
  effectiveProfileName: MoneyRoutesProps["topupProps"]["effectiveProfileName"];
  effectiveProfilePicture: MoneyRoutesProps["topupProps"]["effectiveProfilePicture"];
  getCredoRemainingAmount: MoneyRoutesProps["cashuTokenNewProps"]["getCredoRemainingAmount"];
  getMintIconUrl: MoneyRoutesProps["cashuTokenNewProps"]["getMintIconUrl"];
  lnAddressPayAmount: MoneyRoutesProps["lnAddressPayProps"]["lnAddressPayAmount"];
  nostrPictureByNpub: MoneyRoutesProps["cashuTokenNewProps"]["nostrPictureByNpub"];
  npubCashLightningAddress: MoneyRoutesProps["topupProps"]["npubCashLightningAddress"];
  payLightningAddressWithCashu: MoneyRoutesProps["lnAddressPayProps"]["payLightningAddressWithCashu"];
  pendingCashuDeleteId: ReturnType<
    MoneyRoutesProps["cashuTokenProps"]
  >["pendingCashuDeleteId"];
  requestDeleteCashuToken: ReturnType<
    MoneyRoutesProps["cashuTokenProps"]
  >["requestDeleteCashuToken"];
  route: Route;
  saveCashuFromText: MoneyRoutesProps["cashuTokenNewProps"]["saveCashuFromText"];
  setCashuDraft: MoneyRoutesProps["cashuTokenNewProps"]["setCashuDraft"];
  setLnAddressPayAmount: MoneyRoutesProps["lnAddressPayProps"]["setLnAddressPayAmount"];
  setMintIconUrlByMint: MoneyRoutesProps["cashuTokenNewProps"]["setMintIconUrlByMint"];
  setTopupAmount: MoneyRoutesProps["topupProps"]["setTopupAmount"];
  t: MoneyRoutesProps["cashuTokenNewProps"]["t"];
  topupAmount: MoneyRoutesProps["topupProps"]["topupAmount"];
  topupDebug: MoneyRoutesProps["topupInvoiceProps"]["topupDebug"];
  topupInvoice: MoneyRoutesProps["topupInvoiceProps"]["topupInvoice"];
  topupInvoiceError: MoneyRoutesProps["topupInvoiceProps"]["topupInvoiceError"];
  topupInvoiceIsBusy: MoneyRoutesProps["topupInvoiceProps"]["topupInvoiceIsBusy"];
  topupInvoiceQr: MoneyRoutesProps["topupInvoiceProps"]["topupInvoiceQr"];
  totalCredoOutstandingIn: MoneyRoutesProps["cashuTokenNewProps"]["totalCredoOutstandingIn"];
  totalCredoOutstandingOut: MoneyRoutesProps["cashuTokenNewProps"]["totalCredoOutstandingOut"];
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
