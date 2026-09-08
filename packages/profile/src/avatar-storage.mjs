/**
 * Avatar validation and storage, kept as two separate concerns.
 *
 * Validation (validateAvatarBuffer/detectImageType) never trusts a
 * client-supplied MIME type or file extension -- it reads the actual
 * bytes and checks a real magic-number signature, the same way a
 * malicious upload disguised as "photo.png" would be caught regardless of
 * what its filename or Content-Type header claims.
 *
 * Storage (createLocalAvatarStorage / createMockAvatarStorage) is a small
 * interface -- save/replace/delete/getPublicUrl -- so a real deployment
 * can swap in an S3/GCS-backed implementation behind the exact same
 * four-method shape later without any caller (profile.mjs, the API route,
 * or any React component) ever knowing the difference. Nothing above this
 * boundary ever sees a filesystem path or a storage credential.
 */
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

export const AvatarError = Object.freeze({
  TOO_LARGE: "TOO_LARGE",
  INVALID_IMAGE: "INVALID_IMAGE",
});

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

const SIGNATURES = [
  { mime: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
];

/** Reads real magic bytes -- never the caller's claimed MIME type. */
export function detectImageType(buffer) {
  for (const sig of SIGNATURES) {
    if (buffer.length >= sig.bytes.length && sig.bytes.every((b, i) => buffer[i] === b)) {
      return { mime: sig.mime, ext: sig.ext };
    }
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export function validateAvatarBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { ok: false, reason: AvatarError.INVALID_IMAGE };
  if (buffer.length > MAX_AVATAR_BYTES) return { ok: false, reason: AvatarError.TOO_LARGE };
  const detected = detectImageType(buffer);
  if (!detected) return { ok: false, reason: AvatarError.INVALID_IMAGE };
  return { ok: true, ...detected };
}

/** Local-disk storage for development. `baseUrl` is where those files are
 * expected to be served from (a static route, a dev-only CDN stand-in) --
 * this module never serves them itself. */
export function createLocalAvatarStorage({ dir, baseUrl }) {
  async function ensureDir() { await mkdir(dir, { recursive: true }); }

  async function save(playerId, buffer, ext) {
    await ensureDir();
    const key = `${playerId}-${randomBytes(6).toString("hex")}.${ext}`;
    await writeFile(path.join(dir, key), buffer);
    return key;
  }

  async function replace(playerId, oldKey, buffer, ext) {
    const key = await save(playerId, buffer, ext);
    if (oldKey) await del(oldKey);
    return key;
  }

  async function del(key) {
    try { await unlink(path.join(dir, key)); } catch { /* already gone -- not an error to the caller */ }
  }

  function getPublicUrl(key) {
    return key ? `${baseUrl}/${key}` : null;
  }

  return { save, replace, delete: del, getPublicUrl };
}

/** In-memory storage for tests -- no disk I/O, no shared state across tests
 * that each construct their own instance. */
export function createMockAvatarStorage() {
  const store = new Map();
  let counter = 0;

  async function save(playerId, buffer, ext) {
    const key = `mock-${playerId}-${++counter}.${ext}`;
    store.set(key, buffer);
    return key;
  }

  async function replace(playerId, oldKey, buffer, ext) {
    const key = await save(playerId, buffer, ext);
    if (oldKey) store.delete(oldKey);
    return key;
  }

  async function del(key) { store.delete(key); }

  function getPublicUrl(key) {
    return key ? `https://avatars.test/${key}` : null;
  }

  return { save, replace, delete: del, getPublicUrl, _store: store };
}
