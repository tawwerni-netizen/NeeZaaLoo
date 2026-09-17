import { ApiError } from "./api";

/**
 * What actually went wrong, in words an operator can act on.
 *
 * Admin pages used to catch every failure into one fixed string -- "Failed
 * to approve withdrawal" -- which hides the difference between "you need to
 * confirm your password", "that withdrawal already moved on", and "you do
 * not hold this capability". All three need a different response from the
 * person reading them, so all three say something different here.
 */
const CODE_MESSAGES: Record<string, string> = {
  STEP_UP_REQUIRED: "هذا الإجراء يحتاج تأكيد كلمة المرور. أعد المحاولة وأكّد هويتك.",
  BAD_CREDENTIALS: "كلمة المرور غير صحيحة. يرجى إعادة المحاولة.",
  INVALID_CREDENTIALS: "بيانات التحقق غير صحيحة. يرجى إعادة المحاولة.",
  CANNOT_PROMOTE_SELF: "لا يمكن تعديل رتبة هذا الحساب من نفس المستخدم.",
  SECOND_ADMIN_REQUIRED: "هذا الإجراء يتطلب موافقة مدير ثانٍ قبل التنفيذ.",
  MISSING_CAPABILITY: "حسابك لا يملك الصلاحية اللازمة لهذا الإجراء.",
  MFA_REQUIRED: "يجب تفعيل المصادقة الثنائية على حسابك الإداري أولاً.",
  ACCOUNT_DISABLED: "هذا الحساب موقوف.",
  ADMIN_ONLY: "هذا الإجراء متاح للمشرفين فقط.",
  NOT_OWNER: "لا يمكن تنفيذ هذا الإجراء على مورد لا يخصك.",
  WRONG_STATE: "تغيّرت حالة هذا السجل — حدّث الصفحة وأعد المحاولة.",
  ALREADY_DECIDED: "تم البتّ في هذه الحالة بالفعل.",
  NOT_FOUND: "لم يُعثر على السجل المطلوب.",
  CONTROL_DISABLED: "هذه العملية موقوفة حالياً من إعدادات المنصة.",
  RATE_LIMITED: "محاولات كثيرة في وقت قصير. انتظر قليلاً ثم أعد المحاولة.",
  PAYMENTS_UNAVAILABLE: "خدمة المدفوعات غير متاحة حالياً.",
  UNAUTHENTICATED: "انتهت الجلسة. سجّل الدخول من جديد.",
  USE_FAIRPLAY_TRIBUNAL: "هذه قضية لعب نزيه — قرّرها من محكمة اللعب النزيه ليُسجَّل القرار بمراجعه وسببه.",
};

export function adminErrorMessage(err: unknown, fallback = "تعذّر تنفيذ الإجراء."): string {
  if (err instanceof ApiError) {
    const known = err.code ? CODE_MESSAGES[err.code] : undefined;
    if (known) return known;
    if (err.code) return `${fallback} (${err.code})`;
    return `${fallback} (HTTP ${err.status})`;
  }
  if (err instanceof Error && err.message) return `${fallback} — ${err.message}`;
  return fallback;
}
