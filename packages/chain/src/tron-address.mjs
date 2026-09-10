/**
 * TRON's address encoding: Base58Check over a 21-byte payload (a 1-byte
 * network prefix -- 0x41 on mainnet -- followed by the 20-byte hash160 of
 * the account's public key), exactly the same Base58Check construction
 * Bitcoin uses (double-SHA256 checksum, leading zero bytes preserved as
 * leading '1' characters). This is a standard, publicly documented
 * encoding -- see the TRON protocol docs' "Address Format" section -- not
 * anything invented here.
 *
 * Why this file exists at all: a TRC20 Transfer event's raw log encodes
 * every address (contract, sender, recipient) as a 32-byte, zero-padded
 * EVM-style topic, in HEX. Our own configured USDT contract address is
 * held in the normal human/base58 form ("TR7NHq..."). To independently
 * verify a raw log against our own configuration -- rather than trusting
 * an indexer's already-decoded convenience fields -- something has to
 * convert between the two forms. That is all this file does.
 */
import { createHash } from "node:crypto";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ALPHABET_MAP = new Map([...ALPHABET].map((c, i) => [c, i]));
const BASE = 58n;

export const TRON_MAINNET_PREFIX = 0x41;
/** payload length: 1 prefix byte + 20-byte hash160. */
const PAYLOAD_LENGTH = 21;

function sha256(buf) {
  return createHash("sha256").update(buf).digest();
}

/** The double-SHA256 checksum Base58Check appends: the first 4 bytes of SHA256(SHA256(payload)). */
function checksum(payload) {
  return sha256(sha256(payload)).subarray(0, 4);
}

/** Raw base58 (no checksum) encode of a byte buffer, preserving leading zero bytes as leading '1's. */
export function base58Encode(bytes) {
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros++;

  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);

  let out = "";
  while (n > 0n) {
    const rem = n % BASE;
    n /= BASE;
    out = ALPHABET[Number(rem)] + out;
  }

  return "1".repeat(leadingZeros) + out;
}

/** Raw base58 (no checksum) decode into a byte buffer. Throws on any character outside the alphabet. */
export function base58Decode(str) {
  let leadingZeros = 0;
  while (leadingZeros < str.length && str[leadingZeros] === "1") leadingZeros++;

  let n = 0n;
  for (const ch of str) {
    const v = ALPHABET_MAP.get(ch);
    if (v === undefined) throw new RangeError(`invalid base58 character: ${JSON.stringify(ch)}`);
    n = n * BASE + BigInt(v);
  }

  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }

  return Buffer.concat([Buffer.alloc(leadingZeros, 0), Buffer.from(bytes)]);
}

/** Base58Check-encode a payload: append the 4-byte checksum, then base58-encode the whole thing. */
export function base58CheckEncode(payload) {
  return base58Encode(Buffer.concat([payload, checksum(payload)]));
}

/**
 * Base58Check-decode a string, verifying the checksum. Throws on a bad
 * checksum or malformed input -- an address that fails this check is
 * corrupt, not merely "a different address", and must never be silently
 * accepted.
 */
export function base58CheckDecode(str) {
  const full = base58Decode(str);
  if (full.length < 5) throw new RangeError("base58check payload too short");
  const payload = full.subarray(0, full.length - 4);
  const given = full.subarray(full.length - 4);
  const want = checksum(payload);
  if (!given.equals(want)) {
    throw new RangeError(`base58check checksum mismatch for ${JSON.stringify(str)}`);
  }
  return payload;
}

/**
 * A TRON base58 address ("TR7NHq...") to its hex payload
 * ("41" + 40 hex chars), lowercase, no "0x" prefix -- the same form TRON's
 * own full-node API returns for hex-format addresses (log.address,
 * TransactionInfo.contract_address, raw_data owner/to addresses).
 */
export function tronBase58ToHex(address) {
  const payload = base58CheckDecode(address);
  if (payload.length !== PAYLOAD_LENGTH) {
    throw new RangeError(`expected a ${PAYLOAD_LENGTH}-byte TRON address payload, got ${payload.length}`);
  }
  return payload.toString("hex");
}

/** The inverse of tronBase58ToHex(): a "41..." hex payload back to base58 ("TR7NHq..."). */
export function tronHexToBase58(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const payload = Buffer.from(clean, "hex");
  if (payload.length !== PAYLOAD_LENGTH) {
    throw new RangeError(`expected a ${PAYLOAD_LENGTH}-byte TRON address payload, got ${payload.length}`);
  }
  return base58CheckEncode(payload);
}

/**
 * Unpack a 32-byte (64 hex char) zero-padded EVM/TVM-style log topic that
 * encodes an address (the standard ABI encoding for an `address`-typed
 * indexed event parameter: 12 zero bytes, then the 20-byte address) into
 * its TRON base58 form. Used to independently recover the sender/recipient
 * of a TRC20 Transfer event straight from the raw log, rather than trusting
 * an indexer's already-decoded `from`/`to` fields.
 */
export function topicToBase58Address(topicHex) {
  const clean = topicHex.startsWith("0x") ? topicHex.slice(2) : topicHex;
  if (clean.length !== 64) {
    throw new RangeError(`expected a 32-byte (64 hex char) topic, got ${clean.length} chars`);
  }
  const last20 = clean.slice(24); // drop the 12-byte (24 hex char) zero padding
  return tronHexToBase58(TRON_MAINNET_PREFIX.toString(16).padStart(2, "0") + last20);
}
