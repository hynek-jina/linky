import type {
  Wallet as CashuWalletClass,
  MintKeys,
  MintKeyset,
  Token,
} from "@cashu/cashu-ts";
import { getUnknownErrorMessage } from "./unknown";

interface CreateLoadedCashuWalletArgs {
  Mint: typeof import("@cashu/cashu-ts").Mint;
  Wallet: typeof import("@cashu/cashu-ts").Wallet;
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

export const decodeCashuTokenForMint = <TDecoded extends Token>(args: {
  getTokenMetadata: (tokenText: string) => CashuTokenMetadataLike;
  mintUrl: string;
  tokenText: string;
  wallet: { decodeToken: (tokenText: string) => TDecoded };
}): TDecoded => {
  const tokenMetadata = args.getTokenMetadata(args.tokenText);
  const tokenMintUrl = normalizeMintUrlValue(tokenMetadata.mint ?? "");
  if (!tokenMintUrl) {
    throw new Error("Token mint missing");
  }

  if (tokenMintUrl !== normalizeMintUrlValue(args.mintUrl)) {
    throw new Error("Mixed mints not supported");
  }

  return args.wallet.decodeToken(args.tokenText);
};

const createWalletInstance = (
  Mint: typeof import("@cashu/cashu-ts").Mint,
  Wallet: typeof import("@cashu/cashu-ts").Wallet,
  mintUrl: string,
  options: CashuWalletOptions,
): CashuWalletClass => {
  // cashu-ts performs a direct CORS request by default. Keep its native
  // request implementation here: v4 uses JSONInt for Amount values, honours
  // caller abort signals and parses u64 responses safely. The old custom
  // request used JSON.stringify, which turned Amount(1) into the string "1".
  return new Wallet(new Mint(mintUrl), options);
};

const createWalletFromFallbackMintData = async (
  args: CreateLoadedCashuWalletArgs,
): Promise<CashuWalletClass> => {
  const options = buildWalletOptions(args);
  const mint = new args.Mint(args.mintUrl);
  const [mintInfo, keysetsResponse] = await Promise.all([
    mint.getInfo(),
    mint.getKeySets(),
  ]);

  const unit = options.unit ?? "sat";
  const keyset = pickPreferredMintKeyset(keysetsResponse.keysets, unit);
  if (!keyset) {
    throw new Error(`No active ${unit} keyset found for ${args.mintUrl}`);
  }

  const fallbackKeysets = keysetsResponse.keysets.filter((candidate) => {
    return candidate.unit === unit && isHexString(String(candidate.id ?? ""));
  });

  const keysById = new Map<string, MintKeys>();
  await Promise.all(
    fallbackKeysets.map(async (candidate) => {
      try {
        const keysResponse = await mint.getKeys(candidate.id);
        const keys =
          keysResponse.keysets.find((keysCandidate) => {
            return (
              keysCandidate.id === candidate.id &&
              keysCandidate.unit === candidate.unit
            );
          }) ?? null;
        if (keys) {
          keysById.set(candidate.id, keys);
        }
      } catch (error) {
        if (candidate.id !== keyset.id) {
          console.warn(
            "[linky][cashu] fallback keyset keys unavailable, continuing",
            {
              error: getUnknownErrorMessage(error, ""),
              keysetId: candidate.id,
              mintUrl: args.mintUrl,
              unit,
            },
          );
        }
      }
    }),
  );

  const preferredKeys = keysById.get(keyset.id) ?? null;
  if (!preferredKeys) {
    throw new Error(`Mint keys for keyset ${keyset.id} are unavailable`);
  }

  const cache = {
    mintUrl: args.mintUrl,
    keysets: keysetsResponse.keysets.map((candidate) => {
      const keys = keysById.get(candidate.id);
      if (!keys) return candidate;
      return { ...candidate, keys: keys.keys };
    }),
  };
  const wallet = new args.Wallet(mint, options);
  wallet.loadMintFromCache(mintInfo, cache);
  wallet.bindKeyset(keyset.id);
  return wallet;
};

export const createLoadedCashuWallet = async (
  args: CreateLoadedCashuWalletArgs,
): Promise<CashuWalletClass> => {
  const options = buildWalletOptions(args);
  const wallet = createWalletInstance(
    args.Mint,
    args.Wallet,
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
