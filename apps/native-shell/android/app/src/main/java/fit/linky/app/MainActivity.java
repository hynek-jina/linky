package fit.linky.app;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.view.View;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanIntentResult;
import com.journeyapps.barcodescanner.ScanOptions;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
	private static final String EVENT_NOTIFICATION_PERMISSION = "linky-native-notification-permission";
	private static final String EVENT_SCAN_RESULT = "linky-native-scan-result";
	private static final String PREFS_NAME = "linky.native.bridge";
	private static final String PREF_NOTIFICATION_PERMISSION_REQUESTED = "notification_permission_requested";
	private static final String FIREBASE_GOOGLE_APP_ID_RESOURCE = "google_app_id";
	private int latestBottomInsetPx = 0;
	private int latestKeyboardInsetPx = 0;
	private int latestTopInsetPx = 0;

	private ActivityResultLauncher<String> notificationPermissionLauncher;
	private ActivityResultLauncher<ScanOptions> qrScanLauncher;
	private SharedPreferences bridgePreferences;

	@Override
	public void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);

		bridgePreferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

		notificationPermissionLauncher = registerForActivityResult(
			new ActivityResultContracts.RequestPermission(),
			isGranted -> dispatchWindowEvent(
				EVENT_NOTIFICATION_PERMISSION,
				createPermissionDetail(isGranted ? "granted" : getNotificationPermissionState())
			)
		);

		qrScanLauncher = registerForActivityResult(new ScanContract(), this::handleScanResult);

		WebView webView = getBridgeWebView();
		if (webView == null) {
			return;
		}

		webView.addJavascriptInterface(new LinkySecretStorageBridge(this), "LinkyNativeSecretStorage");
		webView.addJavascriptInterface(new LinkyNativeScannerBridge(), "LinkyNativeScanner");
		webView.addJavascriptInterface(new LinkyNativeNotificationsBridge(), "LinkyNativeNotifications");
		webView.addJavascriptInterface(new LinkyNativeWindowInsetsBridge(), "LinkyNativeWindowInsets");

		ViewCompat.setOnApplyWindowInsetsListener(webView, (View view, WindowInsetsCompat insets) -> {
			Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
			Insets imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime());
			boolean isImeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
			latestTopInsetPx = Math.max(0, systemBars.top);
			latestBottomInsetPx = Math.max(0, systemBars.bottom);
			latestKeyboardInsetPx = isImeVisible
				? Math.max(0, imeInsets.bottom - latestBottomInsetPx)
				: 0;
			dispatchSafeAreaInsets();
			return insets;
		});

		webView.post(() -> {
			ViewCompat.requestApplyInsets(webView);
			dispatchSafeAreaInsets();
		});
	}

	@Override
	public void onResume() {
		super.onResume();
		WebView webView = getBridgeWebView();
		if (webView != null) {
			webView.post(() -> {
				ViewCompat.requestApplyInsets(webView);
				dispatchSafeAreaInsets();
			});
		}
	}

	private void handleScanResult(ScanIntentResult result) {
		JSONObject detail = new JSONObject();

		try {
			String value = result.getContents();
			if (value != null && !value.trim().isEmpty()) {
				detail.put("status", "success");
				detail.put("value", value.trim());
			} else {
				detail.put("status", "cancelled");
			}
		} catch (Exception error) {
			try {
				detail.put("status", "error");
				detail.put("message", error.getMessage() == null ? "Scanner failed" : error.getMessage());
			} catch (Exception ignored) {
				// ignore secondary JSON errors
			}
		}

		dispatchWindowEvent(EVENT_SCAN_RESULT, detail);
	}

	private Bridge getCapacitorBridge() {
		return getBridge();
	}

	private WebView getBridgeWebView() {
		Bridge bridge = getCapacitorBridge();
		return bridge == null ? null : bridge.getWebView();
	}

	private void dispatchWindowEvent(String eventName, JSONObject detail) {
		WebView webView = getBridgeWebView();
		if (webView == null) {
			return;
		}

		String payload = detail == null ? "{}" : detail.toString();
		String script = "window.dispatchEvent(new CustomEvent(" + JSONObject.quote(eventName) + ", { detail: " + payload + " }));";

		runOnUiThread(() -> webView.evaluateJavascript(script, null));
	}

	private JSONObject createPermissionDetail(String permission) {
		JSONObject detail = new JSONObject();

		try {
			detail.put("permission", permission);
		} catch (Exception ignored) {
			// ignore JSON bridge payload failures
		}

		return detail;
	}

	private void dispatchSafeAreaInsets() {
		JSONObject detail = new JSONObject();

		try {
			detail.put("topInsetPx", latestTopInsetPx);
			detail.put("bottomInsetPx", latestBottomInsetPx);
			detail.put("keyboardInsetPx", latestKeyboardInsetPx);
		} catch (Exception ignored) {
			// ignore JSON bridge payload failures
		}

		dispatchWindowEvent("linky-native-window-insets", detail);
	}

	private String getNotificationPermissionState() {
		if (!isNativePushSupported()) {
			return "unsupported";
		}

		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
			return "granted";
		}

		if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
			== PackageManager.PERMISSION_GRANTED) {
			return "granted";
		}

		boolean wasRequested = bridgePreferences.getBoolean(PREF_NOTIFICATION_PERMISSION_REQUESTED, false);
		return wasRequested ? "denied" : "prompt";
	}

	private boolean isNativePushSupported() {
		return getResources().getIdentifier(
			FIREBASE_GOOGLE_APP_ID_RESOURCE,
			"string",
			getPackageName()
		) != 0;
	}

	private final class LinkyNativeScannerBridge {
		@JavascriptInterface
		public void startScan() {
			runOnUiThread(() -> {
				ScanOptions options = new ScanOptions();
				options.setDesiredBarcodeFormats(ScanOptions.QR_CODE);
				options.setBeepEnabled(false);
				options.setOrientationLocked(false);
				options.setPrompt("Scan QR code");
				qrScanLauncher.launch(options);
			});
		}
	}

	private final class LinkyNativeNotificationsBridge {
		@JavascriptInterface
		public boolean areSupported() {
			return isNativePushSupported();
		}

		@JavascriptInterface
		public String getPermissionState() {
			return getNotificationPermissionState();
		}

		@JavascriptInterface
		public void requestPermission() {
			if (!isNativePushSupported()) {
				dispatchWindowEvent(
					EVENT_NOTIFICATION_PERMISSION,
					createPermissionDetail("unsupported")
				);
				return;
			}

			if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
				dispatchWindowEvent(
					EVENT_NOTIFICATION_PERMISSION,
					createPermissionDetail("granted")
				);
				return;
			}

			bridgePreferences.edit().putBoolean(PREF_NOTIFICATION_PERMISSION_REQUESTED, true).apply();

			runOnUiThread(() -> notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS));
		}
	}

	private final class LinkyNativeWindowInsetsBridge {
		@JavascriptInterface
		public int getBottomInsetPx() {
			return latestBottomInsetPx;
		}

		@JavascriptInterface
		public int getTopInsetPx() {
			return latestTopInsetPx;
		}

		@JavascriptInterface
		public int getKeyboardInsetPx() {
			return latestKeyboardInsetPx;
		}
	}
}
