/**
 * Backend error codes -> translation keys. Per docs/brand/BRAND_GUIDELINES.md
 * §7: direct, confident, never hyped -- an error explains what went wrong
 * and how to fix it, no apology, no vagueness. The backend returns a stable
 * CODE, never translated text (see packages/authz's own action-code
 * convention) -- this is the one place that code is turned into copy, and
 * it goes through the active locale's translator like everything else.
 */
const KEYS: Record<string, string> = {
  WEAK_PASSWORD: "auth.errors.weak_password",
  HANDLE_TAKEN: "auth.errors.handle_taken",
  BAD_CREDENTIALS: "auth.errors.bad_credentials",
  LOCKED_OUT: "auth.errors.locked_out",
  TOTP_REQUIRED: "auth.errors.totp_required",
  TOTP_INVALID: "auth.errors.totp_invalid",
  NETWORK_ERROR: "auth.errors.network_error",
  // Slice 5/6 -- Google identity and account-linking outcomes. The backend
  // returns these same stable codes from /v1/me/identities/google/*,
  // /v1/auth/google/*, and /v1/me/password; this is the one place any of
  // them turn into copy, exactly like every other auth error code above.
  LINK_REQUIRED: "auth.errors.link_required",
  SUBJECT_ALREADY_LINKED: "auth.errors.subject_already_linked",
  ALREADY_LINKED: "auth.errors.already_linked",
  LAST_AUTH_METHOD: "auth.errors.last_auth_method",
  NOT_LINKED: "auth.errors.not_linked",
  CREDENTIAL_ALREADY_SET: "auth.errors.credential_already_set",
  GOOGLE_LOGIN_UNAVAILABLE: "auth.errors.google_login_unavailable",
  PROVIDER_ERROR: "auth.errors.provider_error",
  BAD_STATE: "auth.errors.bad_state",
  GOOGLE_DENIED: "auth.errors.google_denied",
  // Slice 7 -- Profile/nickname/bio/avatar validation codes, returned from
  // /v1/me/profile and /v1/me/profile/avatar.
  INVALID_SHAPE: "auth.errors.invalid_shape",
  RESERVED: "auth.errors.reserved",
  PROHIBITED: "auth.errors.prohibited",
  TAKEN: "auth.errors.taken",
  COOLDOWN: "auth.errors.cooldown",
  TOO_LONG: "auth.errors.too_long",
  TOO_LARGE: "auth.errors.too_large",
  INVALID_IMAGE: "auth.errors.invalid_image",
  NOT_OWNED: "auth.errors.not_owned",
  CANNOT_REPORT_SELF: "auth.errors.cannot_report_self",
  // Slice 8 -- Customer Support / Ticket System. Returned from
  // /v1/me/tickets and /v1/me/tickets/:id/messages.
  INVALID_CATEGORY: "support.errors.invalid_category",
  INVALID_SUBJECT: "support.errors.invalid_subject",
  INVALID_CONTENT: "support.errors.invalid_content",
  REFERENCE_REQUIRED: "support.errors.reference_required",
  REFERENCE_NOT_FOUND: "support.errors.reference_not_found",
  DUPLICATE_OPEN_TICKET: "support.errors.duplicate_open_ticket",
  TICKET_CLOSED: "support.errors.ticket_closed",
};

export function authErrorKey(reason: string): string {
  return KEYS[reason] ?? "auth.errors.generic";
}
