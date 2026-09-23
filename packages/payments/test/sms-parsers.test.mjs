/**
 * The same real captured messages tawwerni.com's sms-parsers.ts was built
 * and tested against (scripts/test-parsers.ts there) -- reused here because
 * this module is a direct port and must parse them identically, modulo
 * resolving straight to EGP minor units instead of whole pounds.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseLocalPaymentSms } from "../src/sms-parsers.mjs";

/** Real captured messages — do not "tidy" these, the spacing is meaningful. */
const VF_1 = `تم استلام مبلغ 500.00 جنيه من رقم 01515339319 المسجل بإسم أمنيه محمد شقره على رقم محفظتك  01069999557.
رصيدك الحالي: 3909.52 جنيه
تاريخ العملية: 21:50 26-08-19
رقم العملية: 022857190374
تابع كل مصروفاتك من تاريخ المعاملات على أبلكيشن أنا فودافون http://vf.eg/vfcash`;

const VF_2 = `تم استلام مبلغ 400.00 جنيه من 01067558133؛
المسجل بإسم Hifzy Hifzy Abd El Kareem Ahmed
على رقم محفظتك 01069999557 بتاريخ 20:32 26-08-02.
رصيدك الحالي: 4144.75 جنيه
رقم العملية: 022304890518
 تقدر تتابع كل مصروفاتك من تاريخ المعاملات على أبلكيشن أنا فودافون http://vf.eg/vfcash`;

const IPN_1 = `لقد استقبلت تحويل لحظي على  0540 بمبلغ 5,000.00 جم عبر IPN من محمد فريد احمد محمود يوم  28-02-2026 الساعة  16:50 رقم المعاملة 9def186b للمساعدة www.mashreq.com/mashreqipn`;

describe("parseLocalPaymentSms — Vodafone Cash", () => {
  test("'من رقم' + 'تاريخ العملية' format", () => {
    const p = parseLocalPaymentSms(VF_1);
    assert.ok(p, "should recognize the message");
    assert.equal(p.network, "VODAFONE_CASH");
    assert.equal(p.amountEgpMinor, 50000n);
    assert.equal(p.senderPhone, "01515339319");
    assert.equal(p.senderName, "أمنيه محمد شقره");
    assert.equal(p.transactionRef, "022857190374");
  });

  test("'من' + 'بتاريخ' format with a Latin sender name", () => {
    const p = parseLocalPaymentSms(VF_2);
    assert.ok(p);
    assert.equal(p.network, "VODAFONE_CASH");
    assert.equal(p.amountEgpMinor, 40000n);
    assert.equal(p.senderPhone, "01067558133");
    assert.equal(p.senderName, "Hifzy Hifzy Abd El Kareem Ahmed");
    assert.equal(p.transactionRef, "022304890518");
  });

  test("the balance line is never read as the amount", () => {
    const p = parseLocalPaymentSms(VF_1);
    assert.equal(p.amountEgpMinor, 50000n, "500.00 EGP, not the 3909.52 balance");
  });
});

describe("parseLocalPaymentSms — InstaPay", () => {
  test("a comma-thousands amount resolves to exact piastres", () => {
    const p = parseLocalPaymentSms(IPN_1);
    assert.ok(p);
    assert.equal(p.network, "INSTAPAY");
    assert.equal(p.amountEgpMinor, 500000n, "5,000.00 EGP = 500000 piastres");
    assert.equal(p.senderName, "محمد فريد احمد محمود");
    assert.equal(p.senderPhone, null, "IPN receipts never carry a sender phone");
    assert.equal(p.transactionRef, "9def186b");
  });
});

describe("parseLocalPaymentSms — rejects everything that isn't an incoming receipt", () => {
  const negatives = [
    ["outgoing transfer", "تم تحويل مبلغ 200.00 جنيه من محفظتك الى 01234567890"],
    ["balance enquiry", "رصيدك الحالي: 3909.52 جنيه"],
    ["promo", "اشحن الآن واربح! تم استلام عرضك الجديد من فودافون"],
    ["otp", "كود التفعيل الخاص بك هو 123456 لا تشاركه مع أحد"],
    ["empty string", ""],
  ];
  for (const [label, sms] of negatives) {
    test(label, () => {
      assert.equal(parseLocalPaymentSms(sms), null);
    });
  }
});

describe("parseLocalPaymentSms — variations the Android parser also accepts", () => {
  const toArabicIndic = (s) => s.replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));

  test("Arabic-Indic digits read the same as Western digits", () => {
    const p = parseLocalPaymentSms(toArabicIndic(VF_1));
    assert.ok(p);
    assert.equal(p.amountEgpMinor, 50000n);
    assert.equal(p.senderPhone, "01515339319");
    assert.equal(p.transactionRef, "022857190374");
  });

  test("an international +20 sender number normalizes to 01 form", () => {
    const p = parseLocalPaymentSms(VF_1.replace("من رقم 01515339319", "من رقم +201515339319"));
    assert.equal(p.senderPhone, "01515339319");
  });

  test("invisible bidi marks do not break the reference", () => {
    const p = parseLocalPaymentSms("\u200F" + VF_1.replace("رقم العملية", "رقم\u200E العملية"));
    assert.equal(p.transactionRef, "022857190374");
  });
});
