import type {
  CashuWallet as CashuWalletClass,
  MintKeyset,
} from "@cashu/cashu-ts";
import { getUnknownErrorMessage } from "./unknown";

interface CreateLoadedCashuWalletArgs {
  CashuMint: typeof import("@cashu/cashu-ts").CashuMint;
  CashuWallet: typeof import("@cashu/cashu-ts").CashuWallet;
  bip39seed?: Uint8Array;
  mintUrl: string;
  unit?: string | null;
}

interface CashuWalletOptions {
  bip39seed?: Uint8Array;
  unit?: string;
}

interface CashuTokenMetadataLike {
  mint?: string;
}

interface DecodedCashuTokenLike {
  mint?: string;
}

type CashuMintConstructorArgs = ConstructorParameters<
  typeof import("@cashu/cashu-ts").CashuMint
>;
type CashuMintRequest = NonNullable<CashuMintConstructorArgs[1]>;

const isHexString = (value: string): boolean => {
  return /^[0-9a-f]+$/i.test(value);
};

const normalizeMintUrlValue = (value: string): string => {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
};

const buildWalletOptions = (
  args: Pick<CreateLoadedCashuWalletArgs, "bip39seed" | "unit">,
): CashuWalletOptions => {
  const options: CashuWalletOptions = {};
  const unit = String(args.unit ?? "").trim();
  if (unit) options.unit = unit;
  if (args.bip39seed instanceof Uint8Array) {
    options.bip39seed = args.bip39seed;
  }
  return options;
};

const createDirectCashuMintRequest = (): CashuMintRequest => {
  const directRequest: CashuMintRequest = async (options) => {
    const method = String(
      options.method ?? (options.requestBody ? "POST" : "GET"),
    ).toUpperCase();
    const body = options.requestBody
      ? JSON.stringify(options.requestBody)
      : undefined;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 12_000);

    try {
      const response = await fetch(options.endpoint, {
        method,
        cache: "no-store",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        mode: "cors",
        ...(body ? { body } : {}),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `Mint HTTP ${response.status}`);
      }

      return text ? JSON.parse(text) : null;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  return directRequest;
};

export const isCashuKeysetVerificationError = (error: unknown): boolean => {
  const message = getUnknownErrorMessage(error, "").toLowerCase();
  return (
    message.includes("couldn't verify keyset id") ||
    message.includes("short keyset id v2") ||
    message.includes("got no keysets to map it to") ||
    message.includes("couldn't map short keyset id")
  );
};

export const pickPreferredMintKeyset = (
  keysets: readonly MintKeyset[],
  unit: string,
): MintKeyset | null => {
  const matches = keysets
    .filter((keyset) => {
      return (
        keyset.active &&
        keyset.unit === unit &&
        isHexString(String(keyset.id ?? ""))
      );
    })
    .sort((left, right) => {
      return (left.input_fee_ppk ?? 0) - (right.input_fee_ppk ?? 0);
    });

  return matches[0] ?? null;
};

export const decodeCashuTokenForMint = <
  TDecoded extends DecodedCashuTokenLike,
>(args: {
  getDecodedToken: (tokenText: string, keysets?: MintKeyset[]) => TDecoded;
  getTokenMetadata: (tokenText: string) => CashuTokenMetadataLike;
  keysets: MintKeyset[];
  mintUrl: string;
  tokenText: string;
}): TDecoded => {
  const tokenMetadata = args.getTokenMetadata(args.tokenText);
  const tokenMintUrl = normalizeMintUrlValue(tokenMetadata.mint ?? "");
  if (!tokenMintUrl) {
    throw new Error("Token mint missing");
  }

  if (tokenMintUrl !== normalizeMintUrlValue(args.mintUrl)) {
    throw new Error("Mixed mints not supported");
  }

  return args.getDecodedToken(args.tokenText, args.keysets);
};

const createWalletInstance = (
  CashuMint: typeof import("@cashu/cashu-ts").CashuMint,
  CashuWallet: typeof import("@cashu/cashu-ts").CashuWallet,
  mintUrl: string,
  options: CashuWalletOptions,
): CashuWalletClass => {
  return new CashuWallet(
    new CashuMint(mintUrl, createDirectCashuMintRequest()),
    options,
  );
};

const createWalletFromFallbackMintData = async (
  args: CreateLoadedCashuWalletArgs,
): Promise<CashuWalletClass> => {
  const options = buildWalletOptions(args);
  const mint = new args.CashuMint(args.mintUrl, createDirectCashuMintRequest());
  const [mintInfo, keysetsResponse] = await Promise.all([
    mint.getInfo(),
    mint.getKeySets(),
  ]);

  const unit = options.unit ?? "sat";
  const keyset = pickPreferredMintKeyset(keysetsResponse.keysets, unit);
  if (!keyset) {
    throw new Error(`No active ${unit} keyset found for ${args.mintUrl}`);
  }

  const keysResponse = await mint.getKeys(keyset.id);
  const keys =
    keysResponse.keysets.find((candidate) => {
      return candidate.id === keyset.id && candidate.unit === keyset.unit;
    }) ?? null;
  if (!keys) {
    throw new Error(`Mint keys for keyset ${keyset.id} are unavailable`);
  }

  const wallet = new args.CashuWallet(mint, {
    ...options,
    mintInfo,
    keysets: keysetsResponse.keysets,
    keys,
  });
  wallet.keysetId = keyset.id;
  return wallet;
};

export const createLoadedCashuWallet = async (
  args: CreateLoadedCashuWalletArgs,
): Promise<CashuWalletClass> => {
  const options = buildWalletOptions(args);
  const wallet = createWalletInstance(
    args.CashuMint,
    args.CashuWallet,
    args.mintUrl,
    options,
  );

  try {
    await wallet.loadMint();
    return wallet;
  } catch (error) {
    if (!isCashuKeysetVerificationError(error)) throw error;

    console.warn("[linky][cashu] keyset verification failed, using fallback", {
      error: getUnknownErrorMessage(error, ""),
      mintUrl: args.mintUrl,
      unit: options.unit ?? "sat",
    });

    return await createWalletFromFallbackMintData(args);
  }
};
