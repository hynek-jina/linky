import type { Route } from "../../../types/route";
import type { MoneyRoutesProps } from "../AppRouteContent";

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
  copyText: ReturnType<MoneyRoutesProps["cashuTokenProps"]>["copyText"];
  currentNpub: MoneyRoutesProps["topupProps"]["currentNpub"];
  displayUnit: MoneyRoutesProps["cashuTokenNewProps"]["displayUnit"];
  effectiveProfileName: MoneyRoutesProps["topupProps"]["effectiveProfileName"];
  effectiveProfilePicture: MoneyRoutesProps["topupProps"]["effectiveProfilePicture"];
  getMintIconUrl: MoneyRoutesProps["cashuTokenNewProps"]["getMintIconUrl"];
  lnAddressPayAmount: MoneyRoutesProps["lnAddressPayProps"]["lnAddressPayAmount"];
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
  topupInvoice: MoneyRoutesProps["topupInvoiceProps"]["topupInvoice"];
  topupInvoiceError: MoneyRoutesProps["topupInvoiceProps"]["topupInvoiceError"];
  topupInvoiceIsBusy: MoneyRoutesProps["topupInvoiceProps"]["topupInvoiceIsBusy"];
  topupMintUrl: MoneyRoutesProps["topupInvoiceProps"]["topupMintUrl"];
  topupInvoiceQr: MoneyRoutesProps["topupInvoiceProps"]["topupInvoiceQr"];
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
  copyText,
  currentNpub,
  displayUnit,
  effectiveProfileName,
  effectiveProfilePicture,
  getMintIconUrl,
  lnAddressPayAmount,
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
  topupInvoice,
  topupInvoiceError,
  topupInvoiceIsBusy,
  topupMintUrl,
  topupInvoiceQr,
}: BuildMoneyRoutePropsParams): MoneyRouteProps => {
  return {
    cashuTokenNewProps: {
      cashuBalance,
      cashuBulkCheckIsBusy,
      displayUnit,
      cashuTokens: cashuTokensWithMeta,
      cashuDraft,
      setCashuDraft,
      cashuDraftRef,
      cashuIsBusy,
      checkAllCashuTokensAndDeleteInvalid,
      setMintIconUrlByMint,
      saveCashuFromText,
      getMintIconUrl,
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
      topupInvoiceQr,
      topupInvoice,
      topupInvoiceError,
      topupInvoiceIsBusy,
      topupMintUrl,
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
