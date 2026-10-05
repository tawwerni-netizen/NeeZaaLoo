/**
 * Pure content validation -- no database access, so this runs before ever
 * touching a connection, exactly like packages/support/src/categories.mjs's
 * own validation-before-I/O discipline.
 *
 * What this deliberately does NOT do: strip or rewrite anything. A message
 * either passes as typed, or is rejected with a reason the client can show
 * verbatim -- silently mangling what someone wrote is its own kind of bug.
 * Raw HTML is not stripped here either: the real defense against it is
 * "never render chat content as HTML" (the frontend renders it as plain
 * text, see ChatWindow.tsx), which no amount of server-side escaping could
 * substitute for anyway once content reaches a DIFFERENT rendering context
 * (a push notification, a moderation tool) later.
 */
const MAX_CONTENT_LENGTH = 1000; // mirrors chat_message_length in 0023_chat.sql

export const ChatContentError = Object.freeze({
  EMPTY: "EMPTY",
  TOO_LONG: "TOO_LONG",
  CONTROL_CHARS: "CONTROL_CHARS",
});

/**
 * True for a C0 control byte other than newline (code 10), or a C1 control
 * byte -- never legitimate in a chat message, and a classic vector for
 * terminal/log injection if this content is ever echoed into a plain-text
 * sink (an admin console, a log line) that does not itself escape control
 * bytes. Checked by character CODE rather than a literal regex range: a
 * literal range in source risks a raw control byte silently surviving a
 * copy/paste into this very file, which would be exactly the bug this
 * check exists to catch in someone else's message.
 */
function isDisallowedControlChar(code) {
  const isC0 = code <= 0x1f;
  const isC1 = code >= 0x7f && code <= 0x9f;
  const isNewline = code === 0x0a;
  return (isC0 || isC1) && !isNewline;
}

function containsControlChars(content) {
  for (let i = 0; i < content.length; i++) {
    if (isDisallowedControlChar(content.charCodeAt(i))) return true;
  }
  return false;
}

/** Trim and Unicode-normalize (NFC) -- never mutates meaning, only
 * canonicalizes equivalent representations so two visually-identical
 * messages compare equal for the duplicate-cooldown check in messages.mjs. */
export function normalizeContent(raw) {
  return typeof raw === "string" ? raw.trim().normalize("NFC") : "";
}

/** @returns {string|null} an error code, or null if the content is valid. */
export function validateContent(content) {
  if (!content) return ChatContentError.EMPTY;
  if (content.length > MAX_CONTENT_LENGTH) return ChatContentError.TOO_LONG;
  if (containsControlChars(content)) return ChatContentError.CONTROL_CHARS;
  return null;
}
