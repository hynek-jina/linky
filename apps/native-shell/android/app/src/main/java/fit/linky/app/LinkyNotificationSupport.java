package fit.linky.app;

import java.util.List;

import org.json.JSONObject;

/**
 * Android-free static helpers for the native notification pipeline.
 *
 * This class must never import android.* — that is the whole point of the file:
 * every helper here runs under plain JUnit on the JVM with no emulator.
 * org.json usage is contained to {@link #parsePostPayload} only.
 *
 * Consumed by LinkyLocalNotifications (plan 03) and LinkyFirebaseMessagingService
 * (plan 05); the names and signatures below are the fixed contract those plans
 * compile against.
 */
public final class LinkyNotificationSupport {

    /**
     * Single definition of the per-conversation tag namespace. Plan 03's
     * LinkyLocalNotifications calls {@link #conversationTag(String)} instead of
     * re-declaring the prefix, so the namespace cannot drift.
     */
    static final String TAG_PREFIX_CHAT = "linky.chat:";

    private static final String PLACEHOLDER_FALLBACK_ID_SOURCE = "linky-native-message";

    private static final int MAX_CONVERSATION_KEY_LENGTH = 256;
    private static final int MAX_SENDER_NAME_LENGTH = 128;
    private static final int MAX_CONVERSATION_TITLE_LENGTH = 128;
    private static final int MAX_TEXT_LENGTH = 512;
    private static final int MAX_PASS_THROUGH_LENGTH = 512;
    private static final int SENDER_NAME_KEY_PREFIX_LENGTH = 12;

    private LinkyNotificationSupport() {
    }

    /** One cached shade line; sole input to plan 03's MessagingStyle builder. */
    static final class CachedMessage {
        final String senderName;
        final String senderKey;
        final String text;
        final long whenMs;

        CachedMessage(String senderName, String senderKey, String text, long whenMs) {
            this.senderName = senderName;
            this.senderKey = senderKey;
            this.text = text;
            this.whenMs = whenMs;
        }
    }

    /** Parsed and clamped bridge payload; null fields mean "absent". */
    static final class PostPayload {
        final String conversationKey;
        final String senderName;
        final String conversationTitle;
        final String text;
        final String outerEventId;
        final String recipientPubkey;
        final String relayHints;
        final Long eventCreatedAtSec;

        /**
         * Selects the Android channel: `linky_messages` (IMPORTANCE_HIGH) when
         * false, `linky_messages_quiet_v1` (IMPORTANCE_DEFAULT — lands in the
         * shade with no heads-up and no sound) when true.
         *
         * Absent means false, which keeps an old JS against a new APK behaving
         * exactly as before. The opt* accessor below also returns the default
         * for a NON-boolean value, so a hostile payload degrades to the loud
         * channel rather than to a parse failure — the safe direction, since it
         * can never silence a real alert. Appended LAST so every existing caller
         * and test vector keeps its argument order.
         */
        final boolean quiet;

        PostPayload(
            String conversationKey,
            String senderName,
            String conversationTitle,
            String text,
            String outerEventId,
            String recipientPubkey,
            String relayHints,
            Long eventCreatedAtSec,
            boolean quiet
        ) {
            this.conversationKey = conversationKey;
            this.senderName = senderName;
            this.conversationTitle = conversationTitle;
            this.text = text;
            this.outerEventId = outerEventId;
            this.recipientPubkey = recipientPubkey;
            this.relayHints = relayHints;
            this.eventCreatedAtSec = eventCreatedAtSec;
            this.quiet = quiet;
        }
    }

    /** Exact concatenation of the chat prefix and the full key — no hashing. */
    static String conversationTag(String key) {
        return TAG_PREFIX_CHAT + key;
    }

    /**
     * Literally String.hashCode(): deterministic across processes by the
     * java.lang.String contract. Collisions are harmless — the per-conversation
     * data URI already makes the PendingIntents distinct.
     */
    static int conversationRequestCode(String key) {
        return key.hashCode();
    }

    /**
     * Per-event placeholder notification id: outerEventId preferred, messageId
     * as fallback, then a fixed literal. The value is trimmed FIRST and the
     * TRIMMED value is hashed — the same normalized id source plan 03-05 uses
     * for the placeholder data URI, so tag+id and URI always derive from one
     * normalization of the event id.
     */
    static int placeholderNotificationId(String outerEventId, String messageId) {
        String normalizedOuterEventId = outerEventId == null ? "" : outerEventId.trim();
        if (!normalizedOuterEventId.isEmpty()) {
            return normalizedOuterEventId.hashCode();
        }
        String normalizedMessageId = messageId == null ? "" : messageId.trim();
        if (!normalizedMessageId.isEmpty()) {
            return normalizedMessageId.hashCode();
        }
        return PLACEHOLDER_FALLBACK_ID_SOURCE.hashCode();
    }

    /**
     * How long a shade flush must wait so the package stays under Android's
     * per-package enqueue-rate limit. Pure arithmetic, no clock and no state:
     * the caller supplies both timestamps so this stays JVM-testable.
     *
     * Returns 0 (flush now, leading edge) when nothing has been flushed yet,
     * when the interval has already elapsed, or when the wall clock moved
     * backwards; otherwise the strictly positive remainder of the interval.
     *
     * This governs POSTS only. The conversation cache append in
     * LinkyLocalNotifications.post is synchronous and unconditional — a delayed
     * flush may never delay or skip an append, or the shade would lose a
     * message instead of merely repainting it late.
     */
    static long flushDelayMs(long lastFlushAtMs, long nowMs, long minIntervalMs) {
        if (lastFlushAtMs <= 0L || minIntervalMs <= 0L) {
            return 0L;
        }
        long elapsedMs = nowMs - lastFlushAtMs;
        if (elapsedMs < 0L) {
            // Clock regression: never return a negative delay and never stall
            // the shade because the wall clock moved backwards.
            return 0L;
        }
        if (elapsedMs >= minIntervalMs) {
            return 0L;
        }
        return minIntervalMs - elapsedMs;
    }

    /**
     * Parses the untrusted bridge JSON into a clamped PostPayload.
     * Returns null on any parse or validation failure; never throws — an
     * uncaught throw on the JavaBridge thread kills the process.
     */
    static PostPayload parsePostPayload(String json) {
        if (json == null) {
            return null;
        }
        try {
            JSONObject payload = new JSONObject(json);

            String conversationKey =
                clamp(payload.optString("conversationKey", ""), MAX_CONVERSATION_KEY_LENGTH);
            if (conversationKey.isEmpty()) {
                return null;
            }

            String senderName = clamp(payload.optString("senderName", ""), MAX_SENDER_NAME_LENGTH);
            if (senderName.isEmpty()) {
                senderName = clamp(conversationKey, SENDER_NAME_KEY_PREFIX_LENGTH);
            }

            String conversationTitle =
                optionalClamped(payload, "conversationTitle", MAX_CONVERSATION_TITLE_LENGTH);
            String text = clamp(payload.optString("text", ""), MAX_TEXT_LENGTH);
            String outerEventId = optionalClamped(payload, "outerEventId", MAX_PASS_THROUGH_LENGTH);
            String recipientPubkey =
                optionalClamped(payload, "recipientPubkey", MAX_PASS_THROUGH_LENGTH);
            String relayHints = optionalClamped(payload, "relayHints", MAX_PASS_THROUGH_LENGTH);

            Long eventCreatedAtSec = payload.has("eventCreatedAtSec")
                ? Long.valueOf(payload.getLong("eventCreatedAtSec"))
                : null;

            // Returns the default for an absent key AND for a non-boolean value
            // — exactly the required "absent or garbage means loud channel"
            // behaviour, with no extra validation branch.
            boolean quiet = payload.optBoolean("quiet", false);

            return new PostPayload(
                conversationKey,
                senderName,
                conversationTitle,
                text,
                outerEventId,
                recipientPubkey,
                relayHints,
                eventCreatedAtSec,
                quiet
            );
        } catch (Exception error) {
            return null;
        }
    }

    /** null -> ""; trim first, then truncate to max. */
    static String clamp(String value, int max) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        if (trimmed.length() <= max) {
            return trimmed;
        }
        return trimmed.substring(0, max);
    }

    /** Appends, then evicts index 0 while the list exceeds max — order preserved. */
    static void appendBounded(List<CachedMessage> list, CachedMessage message, int max) {
        list.add(message);
        while (list.size() > max) {
            list.remove(0);
        }
    }

    /**
     * ALWAYS returns receiptNowMs. The eventCreatedAtSec parameter is accepted
     * and deliberately ignored: NIP-59 randomizes created_at into the past, and
     * the platform's PeekOldWhenSuppressor silently kills heads-up alerts for a
     * `when` older than 24h. Keeping the parameter documents that the decision
     * was made — the test suite pins it.
     */
    static long resolveWhen(Long eventCreatedAtSec, long receiptNowMs) {
        return receiptNowMs;
    }

    private static String optionalClamped(JSONObject payload, String field, int max) {
        String value = clamp(payload.optString(field, ""), max);
        return value.isEmpty() ? null : value;
    }
}
