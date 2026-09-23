package com.nizalo.receiver.parser

/**
 * Real captured receipts, identical to packages/payments/test/sms-parsers.test.mjs.
 * Do not "tidy" these: the spacing and line breaks are what real phones receive.
 */
object Fixtures {
    const val VF_1 = """تم استلام مبلغ 500.00 جنيه من رقم 01515339319 المسجل بإسم أمنيه محمد شقره على رقم محفظتك  01069999557.
رصيدك الحالي: 3909.52 جنيه
تاريخ العملية: 21:50 26-08-19
رقم العملية: 022857190374
تابع كل مصروفاتك من تاريخ المعاملات على أبلكيشن أنا فودافون http://vf.eg/vfcash"""

    const val VF_2 = """تم استلام مبلغ 400.00 جنيه من 01067558133؛
المسجل بإسم Hifzy Hifzy Abd El Kareem Ahmed
على رقم محفظتك 01069999557 بتاريخ 20:32 26-08-02.
رصيدك الحالي: 4144.75 جنيه
رقم العملية: 022304890518
 تقدر تتابع كل مصروفاتك من تاريخ المعاملات على أبلكيشن أنا فودافون http://vf.eg/vfcash"""

    const val IPN_1 = "لقد استقبلت تحويل لحظي على  0540 بمبلغ 5,000.00 جم عبر IPN من محمد فريد احمد محمود يوم  28-02-2026 الساعة  16:50 رقم المعاملة 9def186b للمساعدة www.mashreq.com/mashreqipn"

    /** InstaPay via Mashreq; the bank cut the Latin sender name at 20 characters. */
    const val IPN_2 = "لقد استقبلت تحويل لحظي على  0540 بمبلغ 7,000.00 جم عبر IPN من EMAD RAGAB HASSAN TA يوم  02-09-2026 الساعة  00:19 رقم المعاملة c12a257e للمساعدة www.mashreq.com/mashreqipn"

    const val VF_3 = """تم استلام مبلغ 200.00 جنيه من 01503360771؛
المسجل بإسم امنيه محمد امين عبدالمقصود شقره
على رقم محفظتك 01067558133 بتاريخ 02:50 26-09-11.
رصيدك الحالي: 236.90 جنيه
رقم العملية: 023590234989
 تقدر تتابع كل مصروفاتك من تاريخ المعاملات على أبلكيشن أنا فودافون http://vf.eg/vfcash"""

    /** Server-side receiptFingerprint("VODAFONE_CASH", VF_1), computed with Node. */
    const val VF_1_SERVER_FINGERPRINT = "4134dd8658c3021bc5b9342bbab72d204e6c744a45fea033667cceb680be76c7"

    fun vf(amount: String, phone: String = "01515339319", name: String = "أمنيه محمد شقره", ref: String? = "022857190374", balance: String = "3909.52"): String =
        buildString {
            append("تم استلام مبلغ $amount جنيه من رقم $phone المسجل بإسم $name على رقم محفظتك  01069999557.\n")
            append("رصيدك الحالي: $balance جنيه\n")
            append("تاريخ العملية: 21:50 26-08-19\n")
            if (ref != null) append("رقم العملية: $ref\n")
            append("تابع كل مصروفاتك من تاريخ المعاملات على أبلكيشن أنا فودافون http://vf.eg/vfcash")
        }

    fun toArabicIndic(s: String): String = s.map { if (it in '0'..'9') '٠' + (it - '0') else it }.joinToString("")
}
