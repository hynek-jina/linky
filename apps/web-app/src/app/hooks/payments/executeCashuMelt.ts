import { getUnknownErrorMessage } from "../../../utils/unknown";

type MeltInvoiceWithTokensAtMint =
  typeof import("../../../cashuMelt").meltInvoiceWithTokensAtMint;
type CashuMeltResult = Awaited<ReturnType<MeltInvoiceWithTokensAtMint>>;

interface InsertCashuTokenResult {
  ok: boolean;
  error: string | null;
}

interface ExecuteCashuMeltParams {
  deleteSpentTokens: (tokenTexts: readonly string[], mintUrl: string) => void;
  insertAcceptedToken: (
    token: string,
    ignoredAliases: readonly string[],
  ) => InsertCashuTokenResult;
  invoice: string;
  melt?: MeltInvoiceWithTokensAtMint;
  mint: string;
  tokens: string[];
  unit: string;
}

export interface ExecuteCashuMeltResult {
  localPersistenceErrors: string[];
  result: CashuMeltResult;
}

export const executeCashuMelt = async ({
  deleteSpentTokens,
  insertAcceptedToken,
  invoice,
  melt,
  mint,
  tokens,
  unit,
}: ExecuteCashuMeltParams): Promise<ExecuteCashuMeltResult> => {
  const meltInvoice =
    melt ?? (await import("../../../cashuMelt")).meltInvoiceWithTokensAtMint;
  const result = await meltInvoice({ invoice, mint, tokens, unit });

  if (!result.ok) {
    if (result.remainingToken && result.remainingAmount > 0) {
      const inserted = insertAcceptedToken(result.remainingToken, tokens);
      if (inserted.ok) {
        deleteSpentTokens(tokens, mint);
      }
    }
    return { result, localPersistenceErrors: [] };
  }

  const localPersistenceErrors: string[] = [];
  try {
    if (result.remainingToken && result.remainingAmount > 0) {
      const inserted = insertAcceptedToken(result.remainingToken, tokens);
      if (!inserted.ok) {
        localPersistenceErrors.push(
          `change insert: ${String(inserted.error ?? "unknown")}`,
        );
      }
    }

    deleteSpentTokens(tokens, mint);
  } catch (error) {
    localPersistenceErrors.push(
      `spent delete: ${getUnknownErrorMessage(error, "unknown")}`,
    );
  }

  return { result, localPersistenceErrors };
};
