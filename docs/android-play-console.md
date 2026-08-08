# Android Play Console CI

Tento repo má nově workflow pro automatický upload Android AAB do Google Play Console internal tracku po pushi do `main`.

Workflow je v [.github/workflows/android-play-internal.yml](../.github/workflows/android-play-internal.yml).

## Co to dělá

1. checkoutne repozitář
2. nainstaluje pnpm, Node a Java 17
3. obnoví `google-services.json` z GitHub secretu
4. obnoví upload keystore z GitHub secretu
5. pustí `pnpm run check-code`
6. pustí `pnpm run native:aab:release`
7. nahraje AAB jako workflow artifact
8. publikuje AAB do Google Play Console na `internal` track

CI záměrně přepisuje Android `versionCode` na hodnotu `100000000 + github.run_number`, aby upload nepadal na konfliktu stejného `versionCode` při více pushích se stejnou verzí v `package.json`.

## 1. Připrav Google Play Console

V Google Play Console:

1. založ aplikaci `fit.linky.app`, pokud ještě neexistuje
2. otevři `Testing` -> `Internal testing`
3. jednou ručně projdi povinné formuláře v app setupu, aby konzole povolila první upload

Bez dokončeného základního nastavení umí Play API vracet chyby i když je AAB validní.

## 2. Vytvoř service account pro Play API

V Google Cloud projektu propojeném s Play Console:

1. otevři `APIs & Services` -> `Credentials`
2. vytvoř nový `Service account`
3. vygeneruj JSON key
4. v Play Console otevři `Users and permissions`
5. přidej service account a dej mu minimálně oprávnění pro release management té aplikace

Obsah JSON klíče ulož do GitHub secretu `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` jako čistý JSON text.

## 3. Připrav upload key secrets

Upload key vygeneruj podle [docs/android-upload-key.md](./android-upload-key.md).

Pak z něj vytvoř base64 hodnotu:

```bash
base64 -i "$HOME/.keys/linky/linky-upload-key.jks" | pbcopy
```

Do GitHub repository secrets přidej:

1. `ANDROID_UPLOAD_KEYSTORE_BASE64`
2. `ANDROID_UPLOAD_STORE_PASSWORD`
3. `ANDROID_UPLOAD_KEY_ALIAS`
4. `ANDROID_UPLOAD_KEY_PASSWORD`

## 4. Přidej Firebase config secret

Protože Android build používá FCM push konfiguraci, přidej do GitHub secrets i base64 obsah `google-services.json`:

```bash
base64 -i apps/native-shell/android/app/google-services.json | pbcopy
```

Secret se jmenuje `ANDROID_GOOGLE_SERVICES_JSON_BASE64`.

## 5. Ověř první run

Po nastavení secrets:

1. pushni commit do `main`
2. otevři GitHub Actions workflow `Android Play Internal`
3. počkej na build a upload
4. v Play Console zkontroluj `Internal testing`

## Poznámky

- Tahle první verze publikuje na `internal`, ne do production.
- Je to záměrně bezpečnější výchozí stav pro každý push do `main`.
- AAB zůstává i jako GitHub Actions artifact.
- Pokud budeš chtít později promotion do `beta` nebo `production`, je lepší udělat druhý workflow nad tagem nebo ručním schválením.
