# @linky/native-shell

Capacitor-based native shell for shipping the existing web app as:

- Android debug APK / release APK / AAB
- future Play Store build
- future iOS App Store build

The shell consumes the bundled output from `apps/web-app/dist` and keeps the product UI in the web app package.

Java 17 is required for the Android Gradle plugin. On macOS, the workspace scripts try to resolve an installed JDK 17 automatically before running Capacitor or Gradle.

Capacitor 7 currently generates Android compile options targeting Java 21 in this shell. `scripts/patch-android-java.sh` normalizes those generated files back to Java 17 after `android:add` and `android:sync`.

## First-time setup

```bash
bun install
bun run native:android:add
bun run native:ios:add
```

## Android debug APK

```bash
bun run native:apk:debug
```

This will:

1. build `@linky/web-app`
2. sync the Capacitor Android project
3. run `assembleDebug`

The generated APK loads the bundled `apps/web-app/dist` files from inside the app by default.
It does **not** use the Vite dev server unless you explicitly opt into live reload with `LINKY_CAP_SERVER_URL` (or `CAP_SERVER_URL`).

The generated APK is expected at:

```bash
apps/native-shell/android/app/build/outputs/apk/debug/app-debug.apk
```

## Common commands

```bash
bun run native:android:sync
bun run native:android:open
bun run native:ios:sync
bun run native:ios:open
```

## Optional live reload

For local native debugging against a running Vite server, set one of these environment variables before `cap sync` / `cap open`:

```bash
export LINKY_CAP_SERVER_URL=http://127.0.0.1:5174
# or
export CAP_SERVER_URL=http://127.0.0.1:5174
```

If neither variable is set, the native shells use the bundled web assets.

## Current scope

This workspace sets up the local-bundle native shell and the Android/iOS project entrypoint.
The next implementation steps are:

- iOS parity for the native shell bridges
- richer deep-link actions beyond contact `npub`

Native Android push is now wired through Capacitor Push Notifications + FCM.
To make it work in builds, provide `android/app/google-services.json` before running `bun run native:android:sync` or `bun run native:apk:debug`.
If that file is missing, the app now skips native push registration instead of crashing on startup, but Android notifications stay disabled.
Android delivery now uses data-only FCM plus a custom `LinkyFirebaseMessagingService`, so closed-app Android notifications still render through the native shell instead of relying on the default Firebase notification renderer.

Android native shell now also registers `nostr://` and `cashu://` and forwards incoming URLs to the web app through the native bridge. The current web-app handler resolves `nostr://npub...` contact links into the saved contact detail, creating the contact first when needed, and imports `cashu://cashu...` tokens into the wallet.

Android NFC NDEF tags are also supported for the same payloads: URI records with `nostr://...` or `cashu://...`, plus `text/plain` NDEF records whose text content starts with those schemes.

The Android shell also exposes NFC writing to the web app. Token detail can write `cashu://cashu...` as an NDEF URI record, and profile can write `nostr://npub...` the same way.
