import { Bip39Seed } from "@linky/linkshu";
import { generateMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { getCashuDeterministicSeedFromStorage } from "../../utils/cashuDeterministic";
import { writeStoredCashuMnemonic } from "../identitySecrets";

/**
 * Resolves the wallet seed exactly as the legacy cashu code did
 * (`getCashuDeterministicSeedFromStorage`: the stored cashu BIP-85 mnemonic,
 * else the initial app mnemonic). When neither yields a valid mnemonic — an
 * nsec-only login — a fresh 24-word mnemonic is generated and persisted
 * through the existing cashu-mnemonic write path, which wipes stale
 * seed-bound state before replacing a different mnemonic.
 */
export const resolveLinkshuSeed = async (): Promise<Bip39Seed> => {
  const existing = getCashuDeterministicSeedFromStorage();
  if (existing) return Bip39Seed.make(existing.bip39seed);

  const generated = generateMnemonic(wordlist, 256);
  await writeStoredCashuMnemonic(generated);
  // Storage can be unavailable or another tab can win a concurrent write;
  // whatever the legacy read path sees now is the wallet's seed.
  const persisted = getCashuDeterministicSeedFromStorage();
  return Bip39Seed.make(persisted?.bip39seed ?? mnemonicToSeedSync(generated));
};
