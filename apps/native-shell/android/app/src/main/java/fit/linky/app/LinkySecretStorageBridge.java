package fit.linky.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

public final class LinkySecretStorageBridge {
    private static final String PREFS_NAME = "linky.secure.secrets";

    private final Context context;

    public LinkySecretStorageBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public String get(String key) {
        if (key == null || key.trim().isEmpty()) {
            return null;
        }

        try {
            return getPreferences().getString(key, null);
        } catch (Exception error) {
            return null;
        }
    }

    @JavascriptInterface
    public void set(String key, String value) {
        if (key == null || key.trim().isEmpty()) {
            return;
        }

        try {
            getPreferences().edit().putString(key, value).apply();
        } catch (Exception ignored) {
            // ignore write errors in bridge surface
        }
    }

    @JavascriptInterface
    public void remove(String key) {
        if (key == null || key.trim().isEmpty()) {
            return;
        }

        try {
            getPreferences().edit().remove(key).apply();
        } catch (Exception ignored) {
            // ignore remove errors in bridge surface
        }
    }

    private SharedPreferences getPreferences() throws Exception {
        MasterKey masterKey = new MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build();

        return EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );
    }
}