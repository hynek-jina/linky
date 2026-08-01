package fit.linky.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * The native notification engine: identity constants, the in-process conversation
 * cache, MessagingStyle posting, the group summary, the scoped cancel helpers and
 * the single notification-channel definition.
 *
 * All state is static because MainActivity (JavaBridge thread) and
 * LinkyFirebaseMessagingService (FCM thread) live in the same process; one static
 * LOCK guards the cache mutation and the notify() as a unit. Context is never held
 * in a static field — it is always a parameter.
 *
 * The cache is the SOLE authority for the MessagingStyle append. The append path
 * never reads the shade back: a read-modify-write over posted notifications has
 * undocumented read-your-writes timing, and removing the dependency is what makes
 * "N posts for one sender yield N stacked lines" deterministic.
 *
 * Shade POSTS are coalesced, cache APPENDS never are. Android's
 * NotificationManagerService sheds *updates* to an already-posted key above
 * ~5 enqueues/sec, and one message enqueues two notifications (conversation
 * child + group summary), so five messages at button speed used to be ~10
 * enqueues in ~17 ms and the platform dropped the last one — the shade then
 * showed N-1 of N messages. post() therefore appends synchronously and marks
 * the conversation dirty; the notify() calls are batched by flush().
 *
 * Process death: cache loss is ACCEPTED. After a restart the shade entry survives
 * but the cache is empty, so the next post for that sender re-posts a 1-line style
 * under the same (tag, id), visually resetting the stack. Do NOT "fix" this by
 * seeding the cache from posted notifications — that reintroduces exactly the
 * shade-read dependence the append path bans. The durable record that survives
 * process death is the phase-4 store, not the shade.
 */
public final class LinkyLocalNotifications {

    /** Identity scheme — locked. The (tag, id) pair is the uniqueness key. */
    static final String GROUP_KEY = "fit.linky.app.MESSAGES";
    static final String TAG_SUMMARY = "linky.summary";
    static final String TAG_PUSH_PLACEHOLDER = "linky.push.pending";
    static final int ID_SUMMARY = 1;
    static final int ID_CONVERSATION = 2;

    private static final int MAX_MESSAGES_PER_CONVERSATION = 8;
    private static final int MAX_CACHED_CONVERSATIONS = 64;
    private static final int MAX_SUMMARY_LINES = 6;

    /**
     * At most one flush (child posts + one summary) per interval. 350 ms keeps a
     * five-message burst at 2 flushes ~= 4 enqueues instead of 10, comfortably
     * under the platform's ~5/sec shedding threshold, while staying below the
     * threshold of perceptible latency for a message that arrives alone.
     */
    private static final long MIN_FLUSH_INTERVAL_MS = 350L;

    /**
     * One idempotent repaint after the burst goes quiet. Re-posting the same
     * (tag, id) replaces in place, so if any flush's enqueue were still shed the
     * shade converges to the cache instead of staying one message behind.
     */
    private static final long SETTLE_DELAY_MS = 2000L;

    private static final String CONVERSATION_URI_PREFIX = "linky-notification://conversation/";
    private static final String NOTIFICATION_ROUTE_CONTACTS = "#contacts";
    private static final String SELF_PERSON_KEY = "linky.self";
    private static final String SELF_PERSON_NAME = "You";

    /** One lock guards the cache mutation plus the notify() as a single unit. */
    private static final Object LOCK = new Object();

    /**
     * Per-conversation shade lines. LinkedHashMap in access order = LRU eviction of
     * whole conversations; evicting a conversation does NOT cancel its shade entry,
     * it only means the next message for that sender starts a 1-line style again.
     */
    private static final LinkedHashMap<String, ArrayList<LinkyNotificationSupport.CachedMessage>>
        CONVERSATION_CACHE = new LinkedHashMap<>(16, 0.75f, true);

    /**
     * Latest payload per conversation — the non-message fields a flush still needs
     * to rebuild the child (title and the content-intent extras). Kept strictly in
     * step with CONVERSATION_CACHE: same put, same eviction, same removal.
     */
    private static final LinkedHashMap<String, LinkyNotificationSupport.PostPayload>
        PAYLOAD_CACHE = new LinkedHashMap<>();

    /** Conversations appended since the last flush, in arrival order. Guarded by LOCK. */
    private static final LinkedHashSet<String> DIRTY = new LinkedHashSet<>();

    /** What the last flush posted — the settle repaint's scope. Guarded by LOCK. */
    private static final LinkedHashSet<String> LAST_FLUSHED = new LinkedHashSet<>();

    /** Handler message tokens, so pending work can be cancelled without holding a Context. */
    private static final Object FLUSH_TOKEN = new Object();
    private static final Object SETTLE_TOKEN = new Object();

    private static long lastFlushAtMs = 0L;
    private static boolean flushScheduled = false;
    private static Handler flushHandler = null;

    private LinkyLocalNotifications() {
    }

    /**
     * Appends one message to the conversation cache — synchronously, unconditionally
     * — and marks the conversation dirty. The shade repaint itself is coalesced:
     * flushed immediately on the leading edge, otherwise batched into one flush at
     * the interval boundary. Safe to call from the JavaBridge thread and the FCM
     * thread; both contend for the same LOCK.
     */
    static void post(Context context, LinkyNotificationSupport.PostPayload payload) {
        if (context == null || payload == null) {
            return;
        }

        // Delayed work must never capture an Activity.
        Context appContext = context.getApplicationContext();
        if (appContext == null) {
            appContext = context;
        }

        synchronized (LOCK) {
            createChannelIfNeeded(appContext);

            long receiptNowMs = System.currentTimeMillis();
            long when = LinkyNotificationSupport.resolveWhen(payload.eventCreatedAtSec, receiptNowMs);

            ArrayList<LinkyNotificationSupport.CachedMessage> messages =
                cacheFor(payload.conversationKey);
            LinkyNotificationSupport.appendBounded(
                messages,
                new LinkyNotificationSupport.CachedMessage(
                    payload.senderName,
                    payload.conversationKey,
                    payload.text,
                    when
                ),
                MAX_MESSAGES_PER_CONVERSATION
            );
            PAYLOAD_CACHE.put(payload.conversationKey, payload);

            DIRTY.add(payload.conversationKey);
            scheduleFlushLocked(appContext);
        }
    }

    /**
     * Leading edge or trailing flush, decided by the pure helper. A burst schedules
     * exactly ONE trailing flush: while one is pending the extra posts only widen
     * the dirty set, so the pending flush carries the final cache state.
     *
     * Caller must hold LOCK.
     */
    private static void scheduleFlushLocked(final Context appContext) {
        long delayMs = LinkyNotificationSupport.flushDelayMs(
            lastFlushAtMs,
            System.currentTimeMillis(),
            MIN_FLUSH_INTERVAL_MS
        );

        if (delayMs <= 0L) {
            flushLocked(appContext, true);
            return;
        }

        if (flushScheduled) {
            return;
        }
        flushScheduled = true;
        handlerLocked().postAtTime(
            new Runnable() {
                @Override
                public void run() {
                    synchronized (LOCK) {
                        flushLocked(appContext, true);
                    }
                }
            },
            FLUSH_TOKEN,
            SystemClock.uptimeMillis() + delayMs
        );
    }

    /**
     * Posts every dirty conversation's child, then the group summary exactly ONCE
     * however many conversations were dirty. Children before the summary, so a lone
     * summary never flashes.
     *
     * A dirty key whose cache entry a concurrent cancel already removed is skipped,
     * never resurrected. Caller must hold LOCK.
     */
    private static void flushLocked(Context appContext, boolean scheduleSettle) {
        handlerLocked().removeCallbacksAndMessages(FLUSH_TOKEN);
        flushScheduled = false;

        if (appContext == null || DIRTY.isEmpty()) {
            return;
        }

        ArrayList<String> keys = new ArrayList<>(DIRTY);
        DIRTY.clear();

        String loudChannelId = appContext.getString(R.string.push_notification_channel_id);
        String quietChannelId = appContext.getString(R.string.push_notification_quiet_channel_id);
        NotificationManagerCompat manager = NotificationManagerCompat.from(appContext);

        long summaryWhen = 0L;
        boolean postedChild = false;
        for (String conversationKey : keys) {
            ArrayList<LinkyNotificationSupport.CachedMessage> messages =
                CONVERSATION_CACHE.get(conversationKey);
            LinkyNotificationSupport.PostPayload payload = PAYLOAD_CACHE.get(conversationKey);
            if (messages == null || messages.isEmpty() || payload == null) {
                continue;
            }

            long when = messages.get(messages.size() - 1).whenMs;
            if (when > summaryWhen) {
                summaryWhen = when;
            }
            // Per conversation, from the cached payload — so a mixed loud/quiet burst
            // renders each conversation on its own channel in one flush.
            String childChannelId = payload.quiet ? quietChannelId : loudChannelId;
            manager.notify(
                LinkyNotificationSupport.conversationTag(conversationKey),
                ID_CONVERSATION,
                buildConversationNotification(appContext, childChannelId, payload, messages, when)
            );
            postedChild = true;
        }

        if (!postedChild) {
            return;
        }

        // Assumption A2: the summary ALWAYS uses the loud channel. Different channels do not
        // group, and GROUP_ALERT_CHILDREN already stops the summary alerting on its own. A
        // mixed loud/quiet conversation set is the one edge case — VERIFY ON THE EMULATOR
        // (plan 04-10), do not assume.
        manager.notify(
            TAG_SUMMARY,
            ID_SUMMARY,
            buildSummaryNotification(appContext, loudChannelId, summaryWhen)
        );

        lastFlushAtMs = System.currentTimeMillis();

        if (scheduleSettle) {
            // Accumulate across the whole burst, never just the newest flush: a
            // conversation flushed on the leading edge must still be repainted by
            // the settle, or an enqueue shed there would never converge.
            LAST_FLUSHED.addAll(keys);
            scheduleSettleLocked(appContext);
        } else {
            // This IS the settle flush — it consumes the accumulated scope.
            LAST_FLUSHED.clear();
        }
    }

    /**
     * One idempotent repaint of everything the burst flushed, SETTLE_DELAY_MS after it
     * goes quiet. Re-scheduling replaces the pending settle, so a long burst yields
     * exactly one settle at its end — and the settle flush never schedules a further
     * settle, so this cannot become a self-sustaining loop.
     *
     * Caller must hold LOCK.
     */
    private static void scheduleSettleLocked(final Context appContext) {
        Handler handler = handlerLocked();
        handler.removeCallbacksAndMessages(SETTLE_TOKEN);
        handler.postAtTime(
            new Runnable() {
                @Override
                public void run() {
                    synchronized (LOCK) {
                        for (String conversationKey : LAST_FLUSHED) {
                            if (CONVERSATION_CACHE.containsKey(conversationKey)) {
                                DIRTY.add(conversationKey);
                            }
                        }
                        flushLocked(appContext, false);
                    }
                }
            },
            SETTLE_TOKEN,
            SystemClock.uptimeMillis() + SETTLE_DELAY_MS
        );
    }

    /** Caller must hold LOCK. Holds no Context — the Runnables carry the app context. */
    private static Handler handlerLocked() {
        if (flushHandler == null) {
            flushHandler = new Handler(Looper.getMainLooper());
        }
        return flushHandler;
    }

    /**
     * Drops the conversation from the cache (so it restarts at one line), cancels its
     * shade entry, and reaps the summary when no group child is left. The shade — not
     * the cache — is the authority here, because only it knows about user dismissals.
     */
    static void cancelConversation(Context context, String conversationKey) {
        if (context == null || conversationKey == null) {
            return;
        }

        synchronized (LOCK) {
            CONVERSATION_CACHE.remove(conversationKey);
            PAYLOAD_CACHE.remove(conversationKey);
            // A pending flush or settle must not re-post what the user just cleared.
            DIRTY.remove(conversationKey);
            LAST_FLUSHED.remove(conversationKey);

            String conversationTag = LinkyNotificationSupport.conversationTag(conversationKey);
            NotificationManagerCompat manager = NotificationManagerCompat.from(context);
            manager.cancel(conversationTag, ID_CONVERSATION);

            boolean hasRemainingChild = false;
            for (StatusBarNotification active : manager.getActiveNotifications()) {
                Notification notification = active.getNotification();
                if (notification == null || !GROUP_KEY.equals(NotificationCompat.getGroup(notification))) {
                    continue;
                }
                if (NotificationCompat.isGroupSummary(notification)) {
                    continue;
                }
                // The cancel above is an async binder call, so the entry just removed
                // can still be listed here — never count it as a survivor.
                if (conversationTag.equals(active.getTag()) && active.getId() == ID_CONVERSATION) {
                    continue;
                }
                hasRemainingChild = true;
                break;
            }

            if (!hasRemainingChild) {
                manager.cancel(TAG_SUMMARY, ID_SUMMARY);
            }
        }
    }

    /**
     * Clears the whole cache and cancels every member of the Linky message group —
     * children and summary — by its own (tag, id). The manager-wide cancel-everything
     * call is deliberately never used: it would also wipe push placeholders and any
     * future notification namespace.
     */
    static void cancelAll(Context context) {
        if (context == null) {
            return;
        }

        synchronized (LOCK) {
            CONVERSATION_CACHE.clear();
            PAYLOAD_CACHE.clear();
            DIRTY.clear();
            LAST_FLUSHED.clear();

            // Drop pending work outright: nothing is left that a flush could repaint.
            Handler handler = handlerLocked();
            handler.removeCallbacksAndMessages(FLUSH_TOKEN);
            handler.removeCallbacksAndMessages(SETTLE_TOKEN);
            flushScheduled = false;

            NotificationManagerCompat manager = NotificationManagerCompat.from(context);
            for (StatusBarNotification active : manager.getActiveNotifications()) {
                Notification notification = active.getNotification();
                if (notification == null || !GROUP_KEY.equals(NotificationCompat.getGroup(notification))) {
                    continue;
                }
                manager.cancel(active.getTag(), active.getId());
            }
        }
    }

    /**
     * Cancels the generic FCM placeholder for one wrap. No cache involvement and no
     * summary reaping — placeholders live outside the message group by construction.
     */
    static void cancelPushPlaceholder(Context context, String outerEventId) {
        if (context == null) {
            return;
        }

        NotificationManagerCompat.from(context).cancel(
            TAG_PUSH_PLACEHOLDER,
            LinkyNotificationSupport.placeholderNotificationId(outerEventId, null)
        );
    }

    /**
     * The single definition of the Linky message channels. Callers: MainActivity.onCreate,
     * post() (defensively) and, from plan 05, the FCM service. Creating a channel that
     * already exists is a no-op, so repeated calls are free.
     *
     * There are TWO channels, not one channel with a mutable importance: the loud
     * linky_messages at high importance (heads-up + sound) and the quiet
     * linky_messages_quiet_v1 at default importance, which the platform's
     * PeekNotImportantSuppressor keeps out of the heads-up while still landing it durably
     * in the shade. Android will not raise or lower the importance of an EXISTING channel
     * and reports no error when you try, so quiet has to be a new versioned id rather than
     * a mutation of linky_messages — and mutating linky_messages would in any case discard
     * every current user's per-channel settings.
     *
     * Per-notification silencing on the builder is deliberately NOT used for this
     * (Phase 3 rule P4): its peek suppressor sits behind a platform flag and it silently
     * rewrites groupAlertBehavior. The importance lives on the channel, nowhere else.
     */
    static void createChannelIfNeeded(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        if (context == null) {
            return;
        }

        NotificationManager notificationManager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) {
            return;
        }

        createChannel(
            notificationManager,
            context.getString(R.string.push_notification_channel_id),
            context.getString(R.string.push_notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        createChannel(
            notificationManager,
            context.getString(R.string.push_notification_quiet_channel_id),
            context.getString(R.string.push_notification_quiet_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT
        );
    }

    /**
     * Creates one channel behind the "already exists => return" check, so an existing
     * channel's user-adjusted settings are never overwritten.
     *
     * The caller has already made the SDK-version, null-context and null-manager checks.
     */
    private static void createChannel(
        NotificationManager notificationManager,
        String channelId,
        String channelName,
        int importance
    ) {
        if (notificationManager.getNotificationChannel(channelId) != null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(channelId, channelName, importance);
        channel.setDescription(channelName);
        notificationManager.createNotificationChannel(channel);
    }

    /** Caller must hold LOCK. */
    private static ArrayList<LinkyNotificationSupport.CachedMessage> cacheFor(String conversationKey) {
        ArrayList<LinkyNotificationSupport.CachedMessage> messages =
            CONVERSATION_CACHE.get(conversationKey);
        if (messages != null) {
            return messages;
        }

        messages = new ArrayList<>();
        CONVERSATION_CACHE.put(conversationKey, messages);

        while (CONVERSATION_CACHE.size() > MAX_CACHED_CONVERSATIONS) {
            Iterator<Map.Entry<String, ArrayList<LinkyNotificationSupport.CachedMessage>>> eldest =
                CONVERSATION_CACHE.entrySet().iterator();
            if (!eldest.hasNext()) {
                break;
            }
            // The payload cache is a strict shadow of the conversation cache; letting
            // it survive an eviction would make it grow without bound.
            String evictedKey = eldest.next().getKey();
            eldest.remove();
            PAYLOAD_CACHE.remove(evictedKey);
            DIRTY.remove(evictedKey);
            LAST_FLUSHED.remove(evictedKey);
        }

        return messages;
    }

    /** Caller must hold LOCK. The style is built from the cached list and nothing else. */
    private static Notification buildConversationNotification(
        Context context,
        String channelId,
        LinkyNotificationSupport.PostPayload payload,
        List<LinkyNotificationSupport.CachedMessage> messages,
        long when
    ) {
        Person self = new Person.Builder()
            .setName(SELF_PERSON_NAME)
            .setKey(SELF_PERSON_KEY)
            .build();

        NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(self);
        for (LinkyNotificationSupport.CachedMessage message : messages) {
            // Per-message Person: a sender renaming mid-conversation keeps earlier
            // bubbles labelled as they arrived. setKey is mandatory — the platform
            // keys participant identity on it, not on the display name.
            Person sender = new Person.Builder()
                .setName(message.senderName)
                .setKey(message.senderKey)
                .build();
            style.addMessage(message.text, message.whenMs, sender);
        }
        style.setGroupConversation(false);
        if (payload.conversationTitle != null) {
            style.setConversationTitle(payload.conversationTitle);
        }

        return new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setStyle(style)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setWhen(when)
            .setShowWhen(true)
            .setGroup(GROUP_KEY)
            .setContentIntent(buildConversationContentIntent(context, payload))
            .build();
    }

    /** Caller must hold LOCK — the summary lines are read from the cache. */
    private static Notification buildSummaryNotification(Context context, String channelId, long when) {
        String summaryText = context.getString(R.string.push_notification_fallback_body);

        // Real content, not a stub: on API 23 the summary is the ONLY entry rendered
        // for a group, so the lines below are the whole notification there.
        ArrayList<String> lines = new ArrayList<>();
        for (Map.Entry<String, ArrayList<LinkyNotificationSupport.CachedMessage>> entry
            : CONVERSATION_CACHE.entrySet()) {
            ArrayList<LinkyNotificationSupport.CachedMessage> messages = entry.getValue();
            if (messages.isEmpty()) {
                continue;
            }
            LinkyNotificationSupport.CachedMessage latest = messages.get(messages.size() - 1);
            lines.add(latest.senderName + ": " + latest.text);
        }

        NotificationCompat.InboxStyle style = new NotificationCompat.InboxStyle()
            .setSummaryText(summaryText);
        for (int index = Math.max(0, lines.size() - MAX_SUMMARY_LINES); index < lines.size(); index++) {
            style.addLine(lines.get(index));
        }

        return new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(context.getString(R.string.app_name))
            .setContentText(summaryText)
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setWhen(when)
            .setGroup(GROUP_KEY)
            .setGroupSummary(true)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setAutoCancel(true)
            .build();
    }

    /**
     * Distinct twice over, per the locked decision: a per-conversation data URI (the
     * only part filterEquals compares) AND a per-conversation request code. Either
     * alone would suffice; both together make a merge impossible.
     *
     * The linky-notification scheme is deliberately unregistered in the manifest and
     * the intent is explicit, so no filter matching happens and no other app can claim it.
     */
    private static PendingIntent buildConversationContentIntent(
        Context context,
        LinkyNotificationSupport.PostPayload payload
    ) {
        Intent launchIntent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .setData(Uri.parse(CONVERSATION_URI_PREFIX + Uri.encode(payload.conversationKey)))
            .putExtra(MainActivity.EXTRA_NOTIFICATION_ROUTE, NOTIFICATION_ROUTE_CONTACTS);

        if (payload.outerEventId != null) {
            launchIntent.putExtra(MainActivity.EXTRA_NOTIFICATION_OUTER_EVENT_ID, payload.outerEventId);
        }
        if (payload.recipientPubkey != null) {
            launchIntent.putExtra(
                MainActivity.EXTRA_NOTIFICATION_RECIPIENT_PUBKEY,
                payload.recipientPubkey
            );
        }
        if (payload.relayHints != null) {
            launchIntent.putExtra(MainActivity.EXTRA_NOTIFICATION_RELAY_HINTS, payload.relayHints);
        }

        return PendingIntent.getActivity(
            context,
            LinkyNotificationSupport.conversationRequestCode(payload.conversationKey),
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
