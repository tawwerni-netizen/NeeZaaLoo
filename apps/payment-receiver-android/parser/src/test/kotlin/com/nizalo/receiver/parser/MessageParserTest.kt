package com.nizalo.receiver.parser

import com.nizalo.receiver.parser.Fixtures.IPN_1
import com.nizalo.receiver.parser.Fixtures.VF_1
import com.nizalo.receiver.parser.Fixtures.VF_2
import com.nizalo.receiver.parser.Fixtures.vf
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

class MessageParserTest {

    @Nested
    inner class VodafoneCash {
        @Test
        fun `valid receipt - 'من رقم' format`() {
            val r = MessageParser.parse(VF_1, senderAddress = "VF-Cash")
            assertEquals(Provider.VODAFONE_CASH, r.provider)
            assertEquals(50_000L, r.amountPiastres)
            assertEquals("01515339319", r.senderPhone)
            assertEquals("أمنيه محمد شقره", r.senderName)
            assertEquals("022857190374", r.reference)
            assertEquals(Confidence.VALID, r.confidence)
            assertTrue(r.canAutoSend)
        }

        @Test
        fun `valid receipt - 'من' plus Latin name format`() {
            val r = MessageParser.parse(VF_2)
            assertEquals(40_000L, r.amountPiastres)
            assertEquals("01067558133", r.senderPhone)
            assertEquals("Hifzy Hifzy Abd El Kareem Ahmed", r.senderName)
            assertEquals("022304890518", r.reference)
            assertEquals(Confidence.VALID, r.confidence)
        }

        @Test
        fun `the balance line is never read as the amount`() {
            assertEquals(50_000L, MessageParser.parse(VF_1).amountPiastres)
        }

        @Test
        fun `malformed - receipt wording but no amount`() {
            val r = MessageParser.parse("تم استلام مبلغ جنيه من رقم 01515339319 المسجل بإسم أحمد")
            assertEquals(Provider.VODAFONE_CASH, r.provider)
            assertNull(r.amountPiastres)
            assertEquals(Confidence.NEEDS_REVIEW, r.confidence)
            assertTrue(ParseIssue.MISSING_AMOUNT in r.issues)
            assertFalse(r.canAutoSend)
        }

        @Test
        fun `wrong amount - zero`() {
            val r = MessageParser.parse(vf("0.00"))
            assertEquals(Confidence.NEEDS_REVIEW, r.confidence)
            assertTrue(ParseIssue.INVALID_AMOUNT in r.issues)
        }

        @Test
        fun `wrong amount - broken thousands grouping`() {
            val r = MessageParser.parse(vf("1,2,3"))
            assertNull(r.amountPiastres)
            assertTrue(ParseIssue.INVALID_AMOUNT in r.issues)
        }

        @Test
        fun `wrong amount - sub-piastre precision is refused, not rounded`() {
            val r = MessageParser.parse(vf("5.001"))
            assertNull(r.amountPiastres)
            assertEquals(Confidence.NEEDS_REVIEW, r.confidence)
        }

        @Test
        fun `wrong amount - implausibly large is held for review`() {
            val r = MessageParser.parse(vf("5,000,000.00"))
            assertEquals(500_000_000L, r.amountPiastres)
            assertTrue(ParseIssue.AMOUNT_OUT_OF_RANGE in r.issues)
            assertEquals(Confidence.NEEDS_REVIEW, r.confidence)
        }

        @Test
        fun `missing reference is still sendable - the server de-duplicates by content`() {
            val r = MessageParser.parse(vf("250.00", ref = null))
            assertNull(r.reference)
            assertTrue(ParseIssue.MISSING_REFERENCE in r.issues)
            assertEquals(Confidence.VALID, r.confidence)
        }

        @Test
        fun `number formats - thousands separators and whole pounds`() {
            assertEquals(123_456_78L, MessageParser.parse(vf("123,456.78")).amountPiastres)
            assertEquals(75_000L, MessageParser.parse(vf("750")).amountPiastres)
            assertEquals(5_050L, MessageParser.parse(vf("50.5")).amountPiastres)
        }

        @Test
        fun `Arabic-Indic digits read the same as Western digits`() {
            val r = MessageParser.parse(Fixtures.toArabicIndic(VF_1))
            assertEquals(50_000L, r.amountPiastres)
            assertEquals("01515339319", r.senderPhone)
            assertEquals("022857190374", r.reference)
            assertEquals(Confidence.VALID, r.confidence)
        }

        @Test
        fun `+20 prefixed sender phone is normalized to 01 form`() {
            val r = MessageParser.parse(vf("100.00", phone = "+201515339319"))
            assertEquals("01515339319", r.senderPhone)
        }

        @Test
        fun `invisible bidi marks and non-breaking spaces do not break parsing`() {
            val noisy = "‏" + VF_1.replace("مبلغ 500.00", "مبلغ 500.00").replace("رقم العملية", "رقم‎ العملية")
            val r = MessageParser.parse(noisy)
            assertEquals(50_000L, r.amountPiastres)
            assertEquals("022857190374", r.reference)
        }
    }

    @Nested
    inner class InstaPay {
        @Test
        fun `valid receipt with comma thousands`() {
            val r = MessageParser.parse(IPN_1, senderAddress = "Mashreq")
            assertEquals(Provider.INSTAPAY, r.provider)
            assertEquals(500_000L, r.amountPiastres)
            assertEquals("محمد فريد احمد محمود", r.senderName)
            assertNull(r.senderPhone, "IPN receipts never carry a phone")
            assertEquals("9def186b", r.reference)
            assertEquals(Confidence.VALID, r.confidence)
        }

        @Test
        fun `malformed - no amount`() {
            val r = MessageParser.parse("لقد استقبلت تحويل لحظي على 0540 عبر IPN من محمد يوم 28-02-2026 رقم المعاملة 9def186b")
            assertEquals(Provider.INSTAPAY, r.provider)
            assertTrue(ParseIssue.MISSING_AMOUNT in r.issues)
            assertEquals(Confidence.NEEDS_REVIEW, r.confidence)
        }

        @Test
        fun `EGP currency suffix variation`() {
            val r = MessageParser.parse("لقد استقبلت تحويل لحظي بمبلغ 1,250.50 EGP عبر IPN من Sara Ali يوم 01-03-2026 رقم المعاملة ab12cd34")
            assertEquals(125_050L, r.amountPiastres)
            assertEquals("Sara Ali", r.senderName)
        }
    }

    @Nested
    inner class NotReceipts {
        @ParameterizedTest
        @ValueSource(strings = [
            "تم تحويل مبلغ 200.00 جنيه إلى رقم 01011112222 رقم العملية: 123456",
            "رصيدك الحالي في فودافون كاش هو 3909.52 جنيه",
            "كود التحقق الخاص بك هو 482913 لا تشاركه مع أحد",
            "عرض خاص! اشحن 100 جنيه واحصل على 50 جنيه هدية",
            "Your Vodafone Cash balance is EGP 120.00",
            "Hello, see you at 5",
            "",
            "   ",
        ])
        fun `anything that is not an incoming receipt is INVALID`(text: String) {
            val r = MessageParser.parse(text)
            assertEquals(Confidence.INVALID, r.confidence)
            assertNull(r.provider)
            assertTrue(ParseIssue.NOT_A_RECEIPT in r.issues)
        }
    }

    @Nested
    inner class EnglishVariations {
        @Test
        fun `an English Vodafone Cash receipt is recognized but held for review`() {
            val r = MessageParser.parse(
                "You have received EGP 350.00 from 01012345678 in your Vodafone Cash wallet. Transaction ID: 0123456789",
                senderAddress = "VF-Cash",
            )
            assertEquals(Provider.VODAFONE_CASH, r.provider)
            assertEquals(35_000L, r.amountPiastres)
            assertEquals("01012345678", r.senderPhone)
            assertEquals("0123456789", r.reference)
            assertTrue(ParseIssue.UNVERIFIED_FORMAT in r.issues)
            assertEquals(Confidence.NEEDS_REVIEW, r.confidence)
        }

        @Test
        fun `an English InstaPay receipt is recognized but held for review`() {
            val r = MessageParser.parse("InstaPay: You received EGP 1,000.00 from Omar Hassan on 01/03/2026. Ref: 7f3a9c21")
            assertEquals(Provider.INSTAPAY, r.provider)
            assertEquals(100_000L, r.amountPiastres)
            assertEquals(Confidence.NEEDS_REVIEW, r.confidence)
        }
    }

    @Nested
    inner class SenderTrust {
        @ParameterizedTest
        @ValueSource(strings = ["+201012345678", "01012345678", "0020 101 234 5678", "201012345678"])
        fun `a receipt from a personal mobile number is never auto-sent`(sender: String) {
            val r = MessageParser.parse(VF_1, senderAddress = sender)
            assertTrue(ParseIssue.UNTRUSTED_SENDER in r.issues)
            assertEquals(Confidence.NEEDS_REVIEW, r.confidence)
            assertFalse(r.canAutoSend)
        }

        @ParameterizedTest
        @ValueSource(strings = ["VF-Cash", "Vodafone", "CIB", "NBE", "9999", "19623"])
        fun `alphanumeric sender IDs and short codes are trusted`(sender: String) {
            val r = MessageParser.parse(VF_1, senderAddress = sender)
            assertFalse(ParseIssue.UNTRUSTED_SENDER in r.issues)
            assertEquals(Confidence.VALID, r.confidence)
        }
    }
}
