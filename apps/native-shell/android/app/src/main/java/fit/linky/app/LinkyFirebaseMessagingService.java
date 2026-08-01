package fit.linky.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public final class LinkyFirebaseMessagingService extends MessagingService {
    private static final String EXTRA_NOTIFICATION_ROUTE = "linky_notification_route";
    private static final String NOTIFICATION_ROUTE_CONTACTS = "#contacts";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        if (remoteMessage.getNotification() != null) {
            return;
        }

        if (MainActivity.isAppInForeground()) {
            return;
        }

        showBackgroundNotification(remoteMessage);
    }

    private void showBackgroundNotification(RemoteMessage remoteMessage) {
        LinkyLocalNotifications.createChannelIfNeeded(this);

        Map<String, String> data = remoteMessage.getData();
        String outerEventId = data.get("outerEventId");
        int placeholderId = LinkyNotificationSupport.placeholderNotificationId(
            outerEventId,
            remoteMessage.getMessageId()
        );
        String title = normalizeText(
            data.get("title"),
            getString(R.string.push_notification_fallback_title)
        );
        String body = normalizeText(
            data.get("body"),
            getString(R.string.push_notification_fallback_body)
        );

        Intent launchIntent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        for (Map.Entry<String, String> entry : data.entrySet()) {
            launchIntent.putExtra(entry.getKey(), entry.getValue());
        }
        launchIntent.putExtra(EXTRA_NOTIFICATION_ROUTE, NOTIFICATION_ROUTE_CONTACTS);
        launchIntent.putExtra(
            "google.message_id",
            normalizeText(remoteMessage.getMessageId(), "linky-native-message")
        );

        String idSource = outerEventId != null && !outerEventId.trim().isEmpty()
            ? outerEventId.trim()
            : normalizeText(remoteMessage.getMessageId(), "linky-native-message");
        launchIntent.setData(Uri.parse("linky-notification://push-pending/" + Uri.encode(idSource)));

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            placeholderId,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            this,
            getString(R.string.push_notification_channel_id)
        )
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setContentText(body)
            .setContentTitle(title)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body));

        NotificationManagerCompat.from(this).notify(
            LinkyLocalNotifications.TAG_PUSH_PLACEHOLDER,
            placeholderId,
            builder.build()
        );
    }

    private String normalizeText(String value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? fallback : normalized;
    }
}
