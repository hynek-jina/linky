import type { Mnemonic } from "@evolu/common";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

export const INITIAL_MNEMONIC_STORAGE_KEY = "linky.initialMnemonic";

export const generate12WordMnemonic = (): Mnemonic => {
  return generateMnemonic(wordlist, 128) as Mnemonic;
};
