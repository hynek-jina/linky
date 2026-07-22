# Zapstore Publishing

Linky can publish the same signed release APK that is already built by the
Android APK release workflow.

## One-time setup

1. Pick the Nostr identity that will publish Linky releases.
   `zapstore.yaml` currently uses the public Linky contact key:
   `npub1kkht6jvgr8mt4844saf80j5jjwyy6fdy90sxsuxt4hfv8pel499s96jvz8`.
   If you prefer a dedicated store identity, replace the `pubkey` in
   `zapstore.yaml` before the first publish.
2. Make sure the corresponding private key is available in `nsec1...` format.
3. In the GitHub repository, open **Settings → Environments**, create or open an
   environment named **`zapstore`**, and add an environment secret named
   **`ZAPSTORE_NSEC`**. Its value must be the complete `nsec1...` key for the
   `pubkey` in `zapstore.yaml`.
4. Configure the `zapstore` environment's deployment branches and tags to allow
   only the protected `main` branch and release tags (`v*`). Do not add required
   reviewers if publishing must remain fully automatic.
5. Run the first publish locally with the release signing keystore available:

   ```bash
   go install github.com/zapstore/zsp@v0.4.14
   read -r -s ZAPSTORE_NSEC
   SIGN_WITH="$ZAPSTORE_NSEC" zsp publish --wizard
   unset ZAPSTORE_NSEC
   ```

   Paste the `nsec` when prompted by `read`; this keeps it out of shell history.
   The first run links the APK signing certificate to the Nostr identity. Keep
   the keystore private and do not commit any generated secret material.

## CI flow

`.github/workflows/android-apk-release.yml` builds the signed APK and uploads
`linky.apk` to the GitHub Release as before. A separate clean runner then
downloads that APK, verifies the pinned `zsp` binary checksum, and runs:

```bash
zsp publish zapstore.yaml --quiet --skip-preview --commit "$GITHUB_SHA"
```

The Zapstore job requires the `ZAPSTORE_NSEC` environment secret and fails
without exposing its value if the secret is missing or is not an `nsec`.

## Key handling rules

- A bunker remains preferable when one can be configured with suitable signing
  restrictions. A GitHub environment secret is an acceptable fallback, but an
  `nsec` is still a long-lived unrestricted signing key.
- Prefer a dedicated Zapstore publisher identity. Do not reuse a personal key or
  a key that controls funds or other high-value identities.
- Never put an `nsec`, bunker URL, keystore password, or keystore file in the
  repository, workflow logs, shell history, release notes, or screenshots.
- The `pubkey` in `zapstore.yaml` is public and must match the signer key.
- Use the same Android release signing key that produces the distributed APK.
- The secret is passed only to the final `zsp publish` step on a runner separate
  from the application build and its third-party dependencies.
- Before advertising Zapstore as an update path from Google Play, verify whether
  the Play-distributed app and direct APK share the same Android signing
  certificate.
