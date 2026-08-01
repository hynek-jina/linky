package fit.linky.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

public class LinkyNotificationSupportTest {

    // --- conversationTag: exact prefix concatenation, full key, no hashing ---

    @Test
    public void conversationTagConcatenatesPrefixAndKey() {
        assertEquals("linky.chat:abc", LinkyNotificationSupport.conversationTag("abc"));
    }

    @Test
    public void conversationTagKeepsFullKeyWithoutHashing() {
        assertEquals("linky.chat:a1b2c3", LinkyNotificationSupport.conversationTag("a1b2c3"));
    }

    // --- conversationRequestCode: literally String.hashCode(), deterministic ---

    @Test
    public void conversationRequestCodeMatchesStringHashCodeContract() {
        // 'a' is 97 per the java.lang.String.hashCode() contract.
        assertEquals(97, LinkyNotificationSupport.conversationRequestCode("a"));
    }

    @Test
    public void conversationRequestCodeMatchesHashCodeForRealisticPubkeys() {
        String pubkeyA = "8f2e9c4b7d3a1f6e5c0b9a8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f";
        String pubkeyB = "02a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f";
        assertEquals(pubkeyA.hashCode(), LinkyNotificationSupport.conversationRequestCode(pubkeyA));
        assertEquals(pubkeyB.hashCode(), LinkyNotificationSupport.conversationRequestCode(pubkeyB));
    }

    @Test
    public void conversationRequestCodeIsDeterministic() {
        String key = "8f2e9c4b7d3a1f6e5c0b9a8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f";
        int first = LinkyNotificationSupport.conversationRequestCode(key);
        int second = LinkyNotificationSupport.conversationRequestCode(key);
        assertEquals(first, second);
    }

    @Test
    public void conversationRequestCodeDiffersForDifferentKeys() {
        int codeA = LinkyNotificationSupport.conversationRequestCode(
            "8f2e9c4b7d3a1f6e5c0b9a8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f");
        int codeB = LinkyNotificationSupport.conversationRequestCode(
            "02a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f");
        assertNotEquals(codeA, codeB);
    }

    // --- placeholderNotificationId: outerEventId preferred, messageId fallback,
    //     fixed fallback literal; trim first, THEN hash the trimmed value ---

    @Test
    public void placeholderNotificationIdPrefersOuterEventId() {
        assertEquals("evt1".hashCode(),
            LinkyNotificationSupport.placeholderNotificationId("evt1", "msg1"));
    }

    @Test
    public void placeholderNotificationIdTrimsBeforeHashing() {
        // Trim semantics are pinned: a whitespace-padded outerEventId hashes its
        // TRIMMED form, matching plan 03-05's trimmed idSource for the placeholder
        // data URI, so tag+id and URI derive from the same normalized value.
        assertEquals("evt1".hashCode(),
            LinkyNotificationSupport.placeholderNotificationId(" evt1 ", "msg1"));
    }

    @Test
    public void placeholderNotificationIdFallsBackToMessageIdWhenOuterEventIdBlank() {
        assertEquals("msg1".hashCode(),
            LinkyNotificationSupport.placeholderNotificationId("   ", "msg1"));
    }

    @Test
    public void placeholderNotificationIdFallsBackToFixedLiteralWhenBothNull() {
        assertEquals("linky-native-message".hashCode(),
            LinkyNotificationSupport.placeholderNotificationId(null, null));
    }

    @Test
    public void placeholderNotificationIdFallsBackToFixedLiteralWhenMessageIdBlank() {
        assertEquals("linky-native-message".hashCode(),
            LinkyNotificationSupport.placeholderNotificationId(null, "  "));
    }

    // --- clamp: null -> "", trim first, truncate to max ---

    @Test
    public void clampReturnsEmptyStringForNull() {
        assertEquals("", LinkyNotificationSupport.clamp(null, 5));
    }

    @Test
    public void clampTrimsBeforeTruncating() {
        assertEquals("x", LinkyNotificationSupport.clamp("  x  ", 5));
    }

    @Test
    public void clampKeepsStringAtExactlyMaxLength() {
        String exact = "x".repeat(512);
        assertEquals(exact, LinkyNotificationSupport.clamp(exact, 512));
    }

    @Test
    public void clampTruncatesStringOverMaxLength() {
        String over = "x".repeat(513);
        assertEquals(512, LinkyNotificationSupport.clamp(over, 512).length());
    }

    // --- appendBounded: evict index 0 when over max, preserve order ---

    @Test
    public void appendBoundedEvictsOldestAndPreservesOrder() {
        List<LinkyNotificationSupport.CachedMessage> list = new ArrayList<>();
        for (int i = 1; i <= 9; i++) {
            LinkyNotificationSupport.appendBounded(
                list,
                new LinkyNotificationSupport.CachedMessage("Alice", "key", "m" + i, 1000L + i),
                8
            );
        }
        assertEquals(8, list.size());
        assertEquals("m2", list.get(0).text);
        assertEquals("m9", list.get(7).text);
    }

    // --- resolveWhen: ALWAYS receipt time, never the Nostr created_at ---

    @Test
    public void resolveWhenReturnsReceiptTimeWhenEventTimestampPresent() {
        assertEquals(999_999L, LinkyNotificationSupport.resolveWhen(1000L, 999_999L));
    }

    @Test
    public void resolveWhenReturnsReceiptTimeWhenEventTimestampNull() {
        assertEquals(42L, LinkyNotificationSupport.resolveWhen(null, 42L));
    }

    @Test
    public void resolveWhenIgnoresThreeDayOldEventCreatedAt() {
        // Load-bearing: NIP-59 randomizes created_at into the past, and the platform's
        // PeekOldWhenSuppressor silently kills heads-up for `when` older than 24h.
        // A 3-day-old eventCreatedAtSec must therefore NEVER become `when` —
        // `when` is always receipt time (ROADMAP-locked decision).
        long receiptNowMs = 1_785_000_000_000L;
        long nowSec = receiptNowMs / 1000L;
        long threeDaysOldSec = nowSec - 3L * 86_400L;
        assertEquals(receiptNowMs,
            LinkyNotificationSupport.resolveWhen(threeDaysOldSec, receiptNowMs));
    }

    // --- flushDelayMs: the pure coalescing decision. Shade POSTS may be delayed;
    //     cache APPENDS never are. Android's NotificationManagerService sheds
    //     updates to an already-posted key above ~5 enqueues/sec, and each message
    //     enqueues two notifications (child + summary), so a same-conversation
    //     burst must be batched into at most one flush per MIN_FLUSH_INTERVAL_MS ---

    @Test
    public void flushDelayMsIsZeroWhenNeverFlushed() {
        // Leading edge: the very first message must post immediately, or an
        // isolated message gains a visible heads-up latency it never had.
        assertEquals(0L, LinkyNotificationSupport.flushDelayMs(0L, 1_000L, 350L));
    }

    @Test
    public void flushDelayMsIsZeroWhenLastFlushIsNegative() {
        assertEquals(0L, LinkyNotificationSupport.flushDelayMs(-1L, 1_000L, 350L));
    }

    @Test
    public void flushDelayMsIsZeroExactlyAtTheIntervalBoundary() {
        // >= is deliberate: at exactly the boundary the interval HAS elapsed.
        assertEquals(0L, LinkyNotificationSupport.flushDelayMs(1_000L, 1_350L, 350L));
    }

    @Test
    public void flushDelayMsIsZeroAfterTheIntervalBoundary() {
        assertEquals(0L, LinkyNotificationSupport.flushDelayMs(1_000L, 9_999L, 350L));
    }

    @Test
    public void flushDelayMsReturnsOneMsJustBeforeTheBoundary() {
        assertEquals(1L, LinkyNotificationSupport.flushDelayMs(1_000L, 1_349L, 350L));
    }

    @Test
    public void flushDelayMsReturnsTheRemainderMidInterval() {
        assertEquals(250L, LinkyNotificationSupport.flushDelayMs(1_000L, 1_100L, 350L));
    }

    @Test
    public void flushDelayMsReturnsTheFullIntervalForAZeroGap() {
        assertEquals(350L, LinkyNotificationSupport.flushDelayMs(1_000L, 1_000L, 350L));
    }

    @Test
    public void flushDelayMsIsStrictlyPositiveEverywhereInsideTheInterval() {
        for (long now = 1_000L; now < 1_350L; now++) {
            long delay = LinkyNotificationSupport.flushDelayMs(1_000L, now, 350L);
            assertTrue("delay must be > 0 at now=" + now, delay > 0L);
            assertTrue("delay must never exceed the interval at now=" + now, delay <= 350L);
        }
    }

    @Test
    public void flushDelayMsIsZeroWhenTheClockRegresses() {
        // A backwards wall clock must never stall the shade and must never
        // produce a negative delay (Handler.postDelayed would fire immediately
        // anyway, but the caller also compares the value against 0).
        assertEquals(0L, LinkyNotificationSupport.flushDelayMs(5_000L, 1_000L, 350L));
    }

    @Test
    public void flushDelayMsIsZeroWhenTheIntervalIsZero() {
        // minIntervalMs == 0 disables coalescing entirely: every post flushes.
        assertEquals(0L, LinkyNotificationSupport.flushDelayMs(1_000L, 1_000L, 0L));
        assertEquals(0L, LinkyNotificationSupport.flushDelayMs(1_000L, 1_001L, 0L));
        assertEquals(0L, LinkyNotificationSupport.flushDelayMs(0L, 0L, 0L));
    }

    // --- parsePostPayload: hostile-input JSON parse + clamp, null on failure ---

    @Test
    public void parsePostPayloadRoundTripsFullValidPayload() {
        LinkyNotificationSupport.PostPayload payload = LinkyNotificationSupport.parsePostPayload(
            "{\"conversationKey\":\"k1\",\"senderName\":\"Alice\","
                + "\"conversationTitle\":\"T\",\"text\":\"hi\",\"outerEventId\":\"o1\","
                + "\"recipientPubkey\":\"r1\",\"relayHints\":\"wss://x\","
                + "\"eventCreatedAtSec\":123}"
        );
        assertNotNull(payload);
        assertEquals("k1", payload.conversationKey);
        assertEquals("Alice", payload.senderName);
        assertEquals("T", payload.conversationTitle);
        assertEquals("hi", payload.text);
        assertEquals("o1", payload.outerEventId);
        assertEquals("r1", payload.recipientPubkey);
        assertEquals("wss://x", payload.relayHints);
        assertEquals(Long.valueOf(123), payload.eventCreatedAtSec);
    }

    @Test
    public void parsePostPayloadDefaultsOptionalFieldsOnMinimalPayload() {
        LinkyNotificationSupport.PostPayload payload = LinkyNotificationSupport.parsePostPayload(
            "{\"conversationKey\":\"k1\",\"text\":\"hi\"}"
        );
        assertNotNull(payload);
        assertEquals(LinkyNotificationSupport.clamp("k1", 12), payload.senderName);
        assertEquals("k1", payload.senderName);
        assertNull(payload.conversationTitle);
        assertNull(payload.outerEventId);
        assertNull(payload.recipientPubkey);
        assertNull(payload.relayHints);
        assertNull(payload.eventCreatedAtSec);
    }

    @Test
    public void parsePostPayloadReturnsNullWhenConversationKeyMissing() {
        assertNull(LinkyNotificationSupport.parsePostPayload("{\"text\":\"hi\"}"));
    }

    @Test
    public void parsePostPayloadReturnsNullWhenConversationKeyBlank() {
        assertNull(LinkyNotificationSupport.parsePostPayload(
            "{\"conversationKey\":\"   \",\"text\":\"hi\"}"));
    }

    @Test
    public void parsePostPayloadReturnsNullForMalformedJsonWithoutThrowing() {
        assertNull(LinkyNotificationSupport.parsePostPayload("not json"));
    }

    @Test
    public void parsePostPayloadReturnsNullForEmptyStringWithoutThrowing() {
        assertNull(LinkyNotificationSupport.parsePostPayload(""));
    }

    @Test
    public void parsePostPayloadReturnsNullForNullInputWithoutThrowing() {
        assertNull(LinkyNotificationSupport.parsePostPayload(null));
    }

    @Test
    public void parsePostPayloadClampsOverlongFields() {
        String longText = "t".repeat(600);
        String longKey = "k".repeat(300);
        String longName = "n".repeat(200);
        LinkyNotificationSupport.PostPayload payload = LinkyNotificationSupport.parsePostPayload(
            "{\"conversationKey\":\"" + longKey + "\","
                + "\"senderName\":\"" + longName + "\","
                + "\"text\":\"" + longText + "\"}"
        );
        assertNotNull(payload);
        assertEquals(512, payload.text.length());
        assertEquals(256, payload.conversationKey.length());
        assertEquals(128, payload.senderName.length());
    }

    // --- parsePostPayload: the `quiet` channel selector. false selects the loud
    //     linky_messages channel (IMPORTANCE_HIGH), true selects
    //     linky_messages_quiet_v1 (IMPORTANCE_DEFAULT — lands in the shade with no
    //     heads-up). Absent MUST mean false so an old JS against a new APK keeps
    //     behaving exactly as before, and a non-boolean MUST also mean false so a
    //     hostile payload degrades to the LOUD channel — it can never silence a
    //     real alert ---

    @Test
    public void parsePostPayloadReadsQuietTrue() {
        LinkyNotificationSupport.PostPayload payload = LinkyNotificationSupport.parsePostPayload(
            "{\"conversationKey\":\"k1\",\"text\":\"hi\",\"quiet\":true}"
        );
        assertNotNull(payload);
        assertTrue(payload.quiet);
    }

    @Test
    public void parsePostPayloadReadsQuietFalse() {
        LinkyNotificationSupport.PostPayload payload = LinkyNotificationSupport.parsePostPayload(
            "{\"conversationKey\":\"k1\",\"text\":\"hi\",\"quiet\":false}"
        );
        assertNotNull(payload);
        assertFalse(payload.quiet);
    }

    @Test
    public void parsePostPayloadDefaultsQuietToFalseWhenAbsent() {
        // Old JS against a new APK: the key never arrives and the user must still
        // get the alerting channel.
        LinkyNotificationSupport.PostPayload payload = LinkyNotificationSupport.parsePostPayload(
            "{\"conversationKey\":\"k1\",\"text\":\"hi\"}"
        );
        assertNotNull(payload);
        assertFalse(payload.quiet);
    }

    @Test
    public void parsePostPayloadDefaultsQuietToFalseForNonBoolean() {
        // A garbage value must not become a parse failure (the never-throws
        // contract) and must not become `true` — it degrades to the loud channel.
        LinkyNotificationSupport.PostPayload stringValued = LinkyNotificationSupport.parsePostPayload(
            "{\"conversationKey\":\"k1\",\"text\":\"hi\",\"quiet\":\"yes\"}"
        );
        assertNotNull(stringValued);
        assertFalse(stringValued.quiet);

        LinkyNotificationSupport.PostPayload numberValued = LinkyNotificationSupport.parsePostPayload(
            "{\"conversationKey\":\"k1\",\"text\":\"hi\",\"quiet\":7}"
        );
        assertNotNull(numberValued);
        assertFalse(numberValued.quiet);
    }

    @Test
    public void parsePostPayloadKeepsClampsWithQuietPresent() {
        // The new field must not disturb the existing clamp behaviour.
        String longText = "t".repeat(600);
        String longKey = "k".repeat(300);
        LinkyNotificationSupport.PostPayload payload = LinkyNotificationSupport.parsePostPayload(
            "{\"conversationKey\":\"" + longKey + "\","
                + "\"text\":\"" + longText + "\",\"quiet\":true}"
        );
        assertNotNull(payload);
        assertTrue(payload.quiet);
        assertEquals(512, payload.text.length());
        assertEquals(256, payload.conversationKey.length());
    }
}
