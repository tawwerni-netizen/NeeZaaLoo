import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateAvatarBuffer, detectImageType, AvatarError, MAX_AVATAR_BYTES, createMockAvatarStorage } from "../src/avatar-storage.mjs";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const WEBP_HEADER = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]);

describe("detectImageType", () => {
  test("recognizes a real PNG signature", () => {
    assert.deepEqual(detectImageType(Buffer.concat([PNG_HEADER, Buffer.alloc(100)])), { mime: "image/png", ext: "png" });
  });

  test("recognizes a real JPEG signature", () => {
    assert.deepEqual(detectImageType(Buffer.concat([JPEG_HEADER, Buffer.alloc(100)])), { mime: "image/jpeg", ext: "jpg" });
  });

  test("recognizes a real WEBP signature (RIFF....WEBP)", () => {
    assert.deepEqual(detectImageType(Buffer.concat([WEBP_HEADER, Buffer.alloc(50)])), { mime: "image/webp", ext: "webp" });
  });

  test("a text file (even one named photo.png by the client) is not recognized", () => {
    assert.equal(detectImageType(Buffer.from("just some plain text, not an image at all")), null);
  });

  test("an HTML/script payload disguised with image bytes prepended still only matches if the REAL bytes are there -- a bare <script> is not", () => {
    assert.equal(detectImageType(Buffer.from("<script>alert(1)</script>")), null);
  });
});

describe("validateAvatarBuffer", () => {
  test("accepts a valid, reasonably-sized PNG", () => {
    const r = validateAvatarBuffer(Buffer.concat([PNG_HEADER, Buffer.alloc(1000)]));
    assert.equal(r.ok, true);
    assert.equal(r.mime, "image/png");
    assert.equal(r.ext, "png");
  });

  test("rejects a file over the size limit, even if it IS a real image", () => {
    const oversized = Buffer.concat([PNG_HEADER, Buffer.alloc(MAX_AVATAR_BYTES + 1)]);
    const r = validateAvatarBuffer(oversized);
    assert.equal(r.ok, false);
    assert.equal(r.reason, AvatarError.TOO_LARGE);
  });

  test("rejects a file at exactly the size limit boundary correctly (still valid)", () => {
    const atLimit = Buffer.concat([PNG_HEADER, Buffer.alloc(MAX_AVATAR_BYTES - PNG_HEADER.length)]);
    const r = validateAvatarBuffer(atLimit);
    assert.equal(r.ok, true);
  });

  test("rejects a non-image payload regardless of claimed extension -- the client never gets to assert its own file type", () => {
    const fakeImage = Buffer.from("this is not really a png, just claims to be");
    const r = validateAvatarBuffer(fakeImage);
    assert.equal(r.ok, false);
    assert.equal(r.reason, AvatarError.INVALID_IMAGE);
  });

  test("rejects an empty buffer", () => {
    const r = validateAvatarBuffer(Buffer.alloc(0));
    assert.equal(r.ok, false);
    assert.equal(r.reason, AvatarError.INVALID_IMAGE);
  });

  test("rejects a non-Buffer input without throwing", () => {
    assert.doesNotThrow(() => validateAvatarBuffer("not a buffer"));
    assert.equal(validateAvatarBuffer("not a buffer").ok, false);
  });
});

describe("createMockAvatarStorage", () => {
  test("save then getPublicUrl round-trips to a real-looking URL", async () => {
    const storage = createMockAvatarStorage();
    const key = await storage.save("alice", Buffer.from("fake-image-bytes"), "png");
    assert.match(storage.getPublicUrl(key), /^https:\/\/avatars\.test\//);
  });

  test("getPublicUrl of a null key is null -- no avatar set yet", () => {
    const storage = createMockAvatarStorage();
    assert.equal(storage.getPublicUrl(null), null);
  });

  test("replace deletes the old key and stores the new one", async () => {
    const storage = createMockAvatarStorage();
    const first = await storage.save("bob", Buffer.from("v1"), "png");
    const second = await storage.replace("bob", first, Buffer.from("v2"), "jpg");
    assert.notEqual(first, second);
    assert.equal(storage._store.has(first), false);
    assert.equal(storage._store.has(second), true);
  });

  test("replace with no old key just saves -- nothing to delete", async () => {
    const storage = createMockAvatarStorage();
    const key = await storage.replace("carol", null, Buffer.from("v1"), "png");
    assert.equal(storage._store.has(key), true);
  });
});
