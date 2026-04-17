import type { Route } from "../../../types/route";
import type { MoneyRoutesProps } from "../AppRouteContent";

type MoneyRouteProps = MoneyRoutesProps;

interface BuildMoneyRoutePropsParams {
  canWriteNfc: boolean;
  canPayWithCashu: MoneyRoutesProps["lnAddressPayProps"]["canPayWithCashu"];
  cashuBalance: MoneyRoutesProps["cashuTokensProps"]["cashuBalance"];
  cashuBulkCheckIsBusy: MoneyRoutesProps["cashuTokensProps"]["cashuBulkCheckIsBusy"];
  cashuDraft: MoneyRoutesProps["cashuTokenNewProps"]["cashuDraft"];
  cashuDraftRef: MoneyRoutesProps["cashuTokenNewProps"]["cashuDraftRef"];
  cashuEmitAmount: MoneyRoutesProps["cashuTokenEmitProps"]["cashuEmitAmount"];
  cashuIsBusy: MoneyRoutesProps["cashuTokensProps"]["cashuIsBusy"];
  cashuIssuedTokens: MoneyRoutesProps["cashuTokensProps"]["cashuIssuedTokens"];
  cashuMeltToMainMintButtonLabel: MoneyRoutesProps["cashuTokensProps"]["cashuMeltToMainMintButtonLabel"];
  cashuTokensAll: ReturnType<
    MoneyRoutesProps["cashuTokenProps"]
  >["cashuTokensAll"];
  cashuOwnTokens: MoneyRoutesProps["cashuTokensProps"]["cashuOwnTokens"];
  checkAllCashuTokensAndDeleteInvalid: MoneyRoutesProps["cashuTokensProps"]["checkAllCashuTokensAndDeleteInvalid"];
  checkAndRefreshCashuToken: ReturnType<
    MoneyRoutesProps["cashuTokenProps"]
  >["checkAndRefreshCashuToken"];
  copyText: ReturnType<MoneyRoutesProps["cashuTokenProps"]>["copyText"];
  currentNpub: MoneyRoutesProps["topupProps"]["currentNpub"];
  displayUnit: MoneyRoutesProps["lnAddressPayProps"]["displayUnit"];
  effectiveProfileName: MoneyRoutesProps["topupProps"]["effectiveProfileName"];
  effectiveProfilePicture: MoneyRoutesProps["topupProps"]["effectiveProfilePicture"];
  emitCashuToken: MoneyRoutesProps["cashuTokenEmitProps"]["emitCashuToken"];
  getMintIconUrl: MoneyRoutesProps["cashuTokensProps"]["getMintIconUrl"];
  knownLnAddressPayContact: MoneyRoutesProps["lnAddressPayProps"]["knownContact"];
  knownLnAddressPayContactPictureUrl: MoneyRoutesProps["lnAddressPayProps"]["knownContactPictureUrl"];
  lnAddressPayAmount: MoneyRoutesProps["lnAddressPayProps"]["lnAddressPayAmount"];
  meltLargestForeignMintToMainMint: MoneyRoutesProps["cashuTokensProps"]["meltLargestForeignMintToMainMint"];
  payLightningAddressWithCashu: MoneyRoutesProps["lnAddressPayProps"]["payLightningAddressWithCashu"];
  pendingCashuDeleteId: ReturnType<
    MoneyRoutesProps["cashuTokenProps"]
  >["pendingCashuDeleteId"];
  reserveCashuToken: ReturnType<
    MoneyRoutesProps["cashuTokenProps"]
  >["reserveCashuToken"];
  requestDeleteCashuToken: ReturnType<
    MoneyRoutesProps["cashuTokenProps"]
  >["requestDeleteCashuToken"];
  returnCashuTokenToWallet: ReturnType<
    MoneyRoutesProps["cashuTokenProps"]
  >["returnCashuTokenToWallet"];
  startSendCashuTokenToContact: ReturnType<
    MoneyRoutesProps["cashuTokenProps"]
  >["startSendCashuTokenToContact"];
  route: Route;
  saveCashuFromText: MoneyRoutesProps["cashuTokenNewProps"]["saveCashuFromText"];
  setCashuEmitAmount: MoneyRoutesProps["cashuTokenEmitProps"]["setCashuEmitAmount"];
  setCashuDraft: MoneyRoutesProps["cashuTokenNewProps"]["setCashuDraft"];
  setLnAddressPayAmount: MoneyRoutesProps["lnAddressPayProps"]["setLnAddressPayAmount"];
  setMintIconUrlByMint: MoneyRoutesProps["cashuTokensProps"]["setMintIconUrlByMint"];
  shareCashuTokenText: MoneyRoutesProps["cashuTokenProps"] extends () => infer Props
    ? Props extends { shareTokenText: infer Fn }
      ? Fn
      : never
    : never;
  setTopupAmount: MoneyRoutesProps["topupProps"]["setTopupAmount"];
  t: MoneyRoutesProps["cashuTokensProps"]["t"];
  topupAmount: MoneyRoutesProps["topupProps"]["topupAmount"];
  topupInvoice: MoneyRoutesProps["topupInvoiceProps"]["topupInvoice"];
  topupInvoiceError: MoneyRoutesProps["topupInvoiceProps"]["topupInvoiceError"];
  topupInvoiceIsBusy: MoneyRoutesProps["topupInvoiceProps"]["topupInvoiceIsBusy"];
  topupMintUrl: MoneyRoutesProps["topupInvoiceProps"]["topupMintUrl"];
  topupInvoiceQr: MoneyRoutesProps["topupInvoiceProps"]["topupInvoiceQr"];
  writeCashuTokenToNfc: MoneyRoutesProps["cashuTokenProps"] extends () => infer Props
    ? Props extends { writeToNfc: infer Fn }
      ? Fn
      : never
    : never;
}

export const buildMoneyRouteProps = ({
  canWriteNfc,
  canPayWithCashu,
  cashuBalance,
  cashuBulkCheckIsBusy,
  cashuDraft,
  cashuDraftRef,
  cashuEmitAmount,
  cashuIsBusy,
  cashuIssuedTokens,
  cashuMeltToMainMintButtonLabel,
  cashuTokensAll,
  cashuOwnTokens,
  checkAllCashuTokensAndDeleteInvalid,
  checkAndRefreshCashuToken,
  copyText,
  currentNpub,
  displayUnit,
  effectiveProfileName,
  effectiveProfilePicture,
  emitCashuToken,
  getMintIconUrl,
  knownLnAddressPayContact,
  knownLnAddressPayContactPictureUrl,
  lnAddressPayAmount,
  meltLargestForeignMintToMainMint,
  payLightningAddressWithCashu,
  pendingCashuDeleteId,
  reserveCashuToken,
  requestDeleteCashuToken,
  returnCashuTokenToWallet,
  startSendCashuTokenToContact,
  route,
  saveCashuFromText,
  setCashuEmitAmount,
  setCashuDraft,
  setLnAddressPayAmount,
  setMintIconUrlByMint,
  shareCashuTokenText,
  setTopupAmount,
  t,
  topupAmount,
  topupInvoice,
  topupInvoiceError,
  topupInvoiceIsBusy,
  topupMintUrl,
  topupInvoiceQr,
  writeCashuTokenToNfc,
}: BuildMoneyRoutePropsParams): MoneyRouteProps => {
  return {
    cashuTokenEmitProps: {
      cashuBalance,
      cashuEmitAmount,
      cashuIsBusy,
      displayUnit,
      emitCashuToken,
      setCashuEmitAmount,
      t,
    },
    cashuTokenNewProps: {
      cashuDraft,
      setCashuDraft,
      cashuDraftRef,
      cashuIsBusy,
      saveCashuFromText,
      t,
    },
    cashuTokensProps: {
      cashuBalance,
      cashuBulkCheckIsBusy,
      cashuIsBusy,
      cashuIssuedTokens,
      cashuMeltToMainMintButtonLabel,
      cashuOwnTokens,
      checkAllCashuTokensAndDeleteInvalid,
      getMintIconUrl,
      meltLargestForeignMintToMainMint,
      setMintIconUrlByMint,
      t,
    },
    cashuTokenProps: () => {
      if (route.kind !== "cashuToken") {
        throw new Error("invalid route for cashu token");
      }
      return {
        canWriteToNfc: canWriteNfc,
        cashuTokensAll,
        routeId: route.id,
        cashuIsBusy,
        pendingCashuDeleteId,
        checkAndRefreshCashuToken,
        copyText,
        reserveCashuToken,
        requestDeleteCashuToken,
        returnCashuTokenToWallet,
        startSendCashuTokenToContact,
        shareTokenText: shareCashuTokenText,
        t,
        writeToNfc: writeCashuTokenToNfc,
      };
    },
    lnAddressPayProps: {
      lnAddress: route.kind === "lnAddressPay" ? route.lnAddress : "",
      cashuBalance,
      canPayWithCashu,
      cashuIsBusy,
      knownContact: knownLnAddressPayContact,
      knownContactPictureUrl: knownLnAddressPayContactPictureUrl,
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
      copyText,
      t,
    },
    topupProps: {
      effectiveProfilePicture,
      effectiveProfileName,
      currentNpub,
      topupAmount,
      setTopupAmount,
      topupInvoiceIsBusy,
      displayUnit,
      t,
    },
  };
};
