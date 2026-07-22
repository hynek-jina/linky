import { isLightningAddress } from "../../lnurlPay";

interface ContactQueryPrefill {
  lnAddress: string;
  name: string;
}

export const getContactQueryPrefill = (query: string): ContactQueryPrefill => {
  const normalized = query.trim();
  if (!isLightningAddress(normalized)) {
    return { lnAddress: "", name: normalized };
  }

  return {
    lnAddress: normalized.replace(/^lightning:/i, "").trim(),
    name: "",
  };
};
