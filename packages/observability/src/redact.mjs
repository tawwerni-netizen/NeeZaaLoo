/**
 * Redaction: the one thing every event, on every path, goes through before
 * it can be written anywhere.
 *
 * This is deny-by-key-name, not allow-by-key-name, deliberately: a new field
 * added to some event's payload six months from now, by someone who has
 * never read this file, must be safe by default. An allowlist would let a
 * forgotten field through in plaintext; a denylist only ever fails closed --
 * worst case it over-redacts a field that did not need it, which is an
 * annoyance, not an incident.
 */
const DENY_KEY_PATTERN = new RegExp(
  [
    "password", "passwd",
    "secret", "ipn_secret", "api_key", "apikey",
    "private_?key", "priv_?key", "mnemonic", "seed_phrase",
    "refresh_?token", "access_?token", "auth_?token", "bearer",
    "authorization", "cookie", "session_?id",
    "card_?number", "cvv", "cvc",
    "ssn", "passport", "national_?id",
    "kyc_document", "id_document", "selfie",
    "signature",
  ].join("|"),
  "i"
);

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 8;

function redactValue(value, depth) {
  if (depth > MAX_DEPTH) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: value.message, code: value.code };
  }
  if (value && typeof value === "object") return redactObject(value, depth + 1);
  if (typeof value === "bigint") return value.toString();
  return value;
}

function redactObject(obj, depth) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = DENY_KEY_PATTERN.test(key) ? REDACTED : redactValue(value, depth);
  }
  return out;
}

/** Deep-redact a plain object of event fields. Never mutates the input. */
export function redact(fields) {
  if (fields === null || typeof fields !== "object") return fields;
  return redactObject(fields, 0);
}

export { DENY_KEY_PATTERN };
