/**
 * TRON's Base58Check address encoding -- the standard, publicly documented
 * construction (see tron-address.mjs's own header). These tests establish
 * that the codec is self-consistent and that corruption is actually
 * detected, since everything downstream (matching a raw log's hex contract
 * address against our configured base58 one) depends on it being correct.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  base58Encode, base58Decode, base58CheckEncode, base58CheckDecode,
  tronBase58ToHex, tronHexToBase58, topicToBase58Address, TRON_MAINNET_PREFIX,
} from "../src/tron-address.mjs";

describe("raw base58", () => {
  test("round-trips arbitrary bytes", () => {
    const bytes = Buffer.from("hello tron", "utf8");
    assert.deepEqual(base58Decode(base58Encode(bytes)), bytes);
  });

  test("preserves leading zero bytes as leading '1' characters", () => {
    const bytes = Buffer.from([0, 0, 1, 2, 3]);
    const encoded = base58Encode(bytes);
    assert.equal(encoded.slice(0, 2), "11");
    assert.deepEqual(base58Decode(encoded), bytes);
  });

  test("rejects a character outside the alphabet (0, O, I, l are excluded)", () => {
    assert.throws(() => base58Decode("0OIl"), RangeError);
  });
});

describe("base58check", () => {
  test("round-trips a 21-byte payload", () => {
    const payload = Buffer.from("41" + "aa".repeat(20), "hex");
    const encoded = base58CheckEncode(payload);
    assert.deepEqual(base58CheckDecode(encoded), payload);
  });

  test("a corrupted checksum is rejected, not silently accepted as a different address", () => {
    const payload = Buffer.from("41" + "bb".repeat(20), "hex");
    const encoded = base58CheckEncode(payload);
    const corrupted = encoded.slice(0, -1) + (encoded.at(-1) === "1" ? "2" : "1");
    assert.throws(() => base58CheckDecode(corrupted), /checksum mismatch/);
  });

  test("a too-short payload is rejected", () => {
    assert.throws(() => base58CheckDecode("1"), RangeError);
  });
});

describe("TRON address <-> hex", () => {
  test("hex -> base58 -> hex is stable", () => {
    const hex = TRON_MAINNET_PREFIX.toString(16).padStart(2, "0") + "0102030405060708090a0b0c0d0e0f1011121314";
    const b58 = tronHexToBase58(hex);
    assert.equal(b58[0], "T", "a mainnet TRON address always starts with T (prefix byte 0x41)");
    assert.equal(tronBase58ToHex(b58), hex);
  });

  test("base58 -> hex -> base58 is stable", () => {
    const payload = Buffer.concat([Buffer.from([TRON_MAINNET_PREFIX]), Buffer.from("cc".repeat(20), "hex")]);
    const b58 = base58CheckEncode(payload);
    assert.equal(tronHexToBase58(tronBase58ToHex(b58)), b58);
  });

  test("rejects a hex payload of the wrong length", () => {
    assert.throws(() => tronHexToBase58("41aabb"), RangeError);
  });

  test("rejects a base58 address decoding to the wrong payload length", () => {
    // A valid base58check string, but too short to be a TRON address.
    const shortPayload = Buffer.from([0x41, 0x01, 0x02]);
    const encoded = base58CheckEncode(shortPayload);
    assert.throws(() => tronBase58ToHex(encoded), RangeError);
  });
});

describe("topicToBase58Address -- unpacking an ABI-encoded address topic", () => {
  test("decodes a standard 32-byte zero-padded address topic", () => {
    const rawAddress = "0102030405060708090a0b0c0d0e0f1011121314";
    const topic = "0".repeat(24) + rawAddress; // 12 zero bytes + 20 address bytes, 64 hex chars total
    const decoded = topicToBase58Address(topic);
    assert.equal(tronBase58ToHex(decoded), TRON_MAINNET_PREFIX.toString(16).padStart(2, "0") + rawAddress);
  });

  test("accepts a 0x-prefixed topic identically", () => {
    const rawAddress = "aabbccddeeff00112233445566778899aabbccdd";
    const topic = "0".repeat(24) + rawAddress;
    assert.equal(topicToBase58Address(`0x${topic}`), topicToBase58Address(topic));
  });

  test("rejects a topic that is not 32 bytes", () => {
    assert.throws(() => topicToBase58Address("aabb"), RangeError);
  });
});
