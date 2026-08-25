# Package strategy

- Extract packages around one system at a time.
- `@linky/linkstr` owns the Nostr layer and is already shipped.
- Cashu and Evolu are future candidates when their boundaries are clear.
- `@linky/identity` owns only master-secret derivation: SLIP-39, BIP-32/85, and owner lanes.
- Later PRs will expand this document as more packages are extracted.
