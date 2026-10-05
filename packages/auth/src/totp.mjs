/**
 * TOTP (RFC 6238) over HOTP (RFC 4226), on node:crypto only.
 *
 * Implemented rather than pulled in because the algorithm is forty lines, the
 * RFC publishes exact test vectors, and a dependency in the authentication path
 * is a supply-chain risk with a very large blast radius. The vectors are in the
 * test file: an implementation that reproduces them is correct, and one that
 * does not is broken in a way that "it seems to work with my phone" will not
 * reveal.
 *
 * SMS is deliberately not offered anywhere in this system. SIM-swap is the
 * documented attack against any account that can authorise a withdrawal.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = str.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new TypeError(`invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP, RFC 4226. `counter` is a BigInt or integer. */
export function hotp(secret, counter, { digits = 6, algorithm = "sha1" } = {}) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, secret).update(buf).digest();

  // Dynamic truncation, RFC 4226 section 5.3.
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, "0");
}

export const timeStep = (timeMs, { step = 30, t0 = 0 } = {}) =>
  Math.floor((Math.floor(timeMs / 1000) - t0) / step);

/** TOTP, RFC 6238. */
export function totp(secret, timeMs, opts = {}) {
  return hotp(secret, timeStep(timeMs, opts), opts);
}

/**
 * Verify a submitted code.
 *
 * `window` allows for clock skew in BOTH directions -- a phone that is a few
 * seconds fast is a support ticket, not an attack. `lastUsedStep` closes the
 * replay hole: a code that has already been accepted is refused even while it
 * is still inside its time window, so an attacker who observes a code over the
 * user's shoulder cannot spend it a second time.
 *
 * @returns {{ok:true, step:number} | {ok:false, reason:string}}
 */
export function verifyTotp(secret, code, timeMs, {
  window = 1, digits = 6, algorithm = "sha1", step = 30, t0 = 0, lastUsedStep = null,
} = {}) {
  if (typeof code !== "string" || !new RegExp(`^\\d{${digits}}$`).test(code)) {
    return { ok: false, reason: "MALFORMED" };
  }
  const current = timeStep(timeMs, { step, t0 });

  for (let drift = -window; drift <= window; drift++) {
    const candidate = current + drift;
    if (candidate < 0) continue;
    const expected = hotp(secret, candidate, { digits, algorithm });
    if (!constantTimeEqual(expected, code)) continue;

    if (lastUsedStep !== null && candidate <= lastUsedStep) {
      return { ok: false, reason: "REPLAYED" };
    }
    return { ok: true, step: candidate };
  }
  return { ok: false, reason: "INVALID" };
}

/** Constant-time string compare; never leaks where two codes diverge. */
export function constantTimeEqual(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) {
    // Compare against itself so the timing does not depend on the length pair.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** A fresh 160-bit secret, the size RFC 4226 recommends for HMAC-SHA1. */
export const generateSecret = () => randomBytes(20);

/** otpauth:// URI for enrolment via QR code. */
export function otpauthUri({ secret, account, issuer = "Nizalo", digits = 6, period = 30 }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: "SHA1",
    digits: String(digits),
    period: String(period),
  });
  return `otpauth://totp/${label}?${params}`;
}
