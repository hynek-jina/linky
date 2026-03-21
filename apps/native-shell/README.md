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

## Current scope

This workspace sets up the local-bundle native shell and the Android/iOS project entrypoint.
The next implementation steps are:

- native secure storage bridge for identity secrets
- camera/barcode native adapter
- deep-link to hash-route translation

Native Android push is now wired through Capacitor Push Notifications + FCM.
To make it work in builds, provide `android/app/google-services.json` before running `bun run native:android:sync` or `bun run native:apk:debug`.
If that file is missing, the app now skips native push registration instead of crashing on startup, but Android notifications stay disabled.
