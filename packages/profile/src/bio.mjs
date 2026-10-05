/**
 * The public Bio field. Two independent defenses, deliberately both
 * present rather than relying on either alone:
 *
 *   1. Storage-time sanitization -- every `<...>` tag-like sequence is
 *      stripped before the bio ever reaches the database, so even a
 *      future export, admin view, or other renderer that forgets to
 *      escape still cannot execute markup that was never stored.
 *   2. Render-time safety -- the actual rule that matters: nothing in
 *      this codebase may ever pass a bio through `dangerouslySetInnerHTML`
 *      or an equivalent. A bio is text, always rendered as text.
 *
 * This file only owns validation and sanitization; it has no database
 * dependency of its own (see profile.mjs for where a bio is actually
 * written, alongside nickname/avatar in one profile-update call).
 */
export const BioError = Object.freeze({
  TOO_LONG: "TOO_LONG",
  PROHIBITED: "PROHIBITED",
});

export const BIO_MAX_LENGTH = 280;

// Deliberately minimal -- see nickname.mjs's own comment on why this is
// infrastructure for a real requirement, not a claim of comprehensive
// coverage. A bio is free text discussing anything, including this
// product by name, so (unlike nicknames) there is no reserved-word list
// here -- only profanity.
const PROHIBITED_SUBSTRINGS = Object.freeze(["fuck", "shit", "nigger", "faggot", "cunt"]);

/** Strips anything that looks like a tag, then collapses stray whitespace
 * left behind -- the bio that reaches storage contains no markup, ever. */
export function sanitizeBio(raw) {
  const withoutTags = String(raw ?? "").replace(/<[^>]*>/g, "");
  return withoutTags.replace(/[ \t]+/g, " ").trim();
}

export function validateBio(sanitized) {
  if (sanitized.length > BIO_MAX_LENGTH) return BioError.TOO_LONG;
  const lower = sanitized.toLowerCase();
  if (PROHIBITED_SUBSTRINGS.some((word) => lower.includes(word))) return BioError.PROHIBITED;
  return null;
}
