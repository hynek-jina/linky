# Zapstore Publishing

Linky can publish the same signed release APK that is already built by the
Android APK release workflow.

## One-time setup

1. Pick the Nostr identity that will publish Linky releases.
   `zapstore.yaml` currently uses the public Linky contact key:
   `npub1kkht6jvgr8mt4844saf80j5jjwyy6fdy90sxsuxt4hfv8pel499s96jvz8`.
   If you prefer a dedicated store identity, replace the `pubkey` in
   `zapstore.yaml` before the first publish.
2. Create a NIP-46 signer/bunker for that same key.
3. Add the full bunker URL as the GitHub Actions secret
   `ZAPSTORE_SIGN_WITH`.
4. Run the first publish locally with the release signing keystore available:

   ```bash
   go install github.com/zapstore/zsp@v0.4.11
   read -r -s ZAPSTORE_SIGN_WITH
   SIGN_WITH="$ZAPSTORE_SIGN_WITH" zsp publish --wizard
   unset ZAPSTORE_SIGN_WITH
   ```

   Paste the bunker URL when prompted by `read`; this keeps it out of shell
   history. The first run links the APK signing certificate to the Nostr
   identity. Keep the keystore private and do not commit any generated secret
   material.

## CI flow

`.github/workflows/android-apk-release.yml` builds the signed APK and uploads
`linky.apk` to the GitHub Release as before. If `ZAPSTORE_SIGN_WITH` is present,
the same job installs `zsp` and runs:

```bash
zsp publish zapstore.yaml --quiet --skip-preview --commit "$GITHUB_SHA"
```

If the secret is missing, the Zapstore step is skipped so normal APK releases
continue to work.

## Key handling rules

- Prefer `SIGN_WITH=bunker://...` over `SIGN_WITH=nsec1...` in CI.
- Never put an `nsec`, bunker URL, keystore password, or keystore file in the
  repository, workflow logs, shell history, release notes, or screenshots.
- The `pubkey` in `zapstore.yaml` is public and must match the signer key.
- Use the same Android release signing key that produces the distributed APK.
- Before advertising Zapstore as an update path from Google Play, verify whether
  the Play-distributed app and direct APK share the same Android signing
  certificate.
