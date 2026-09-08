/**
 * Environment validation and secret loading, shared by every process
 * entrypoint (worker, API, gateway). Fails fast and loudly on startup
 * rather than partway through serving a request -- a missing secret should
 * never surface as a confusing runtime error three requests in.
 *
 * Nothing here ever logs a decoded secret's bytes, only which environment
 * variable it came from -- the same discipline `packages/observability`'s
 * redaction applies to log fields applies here to startup diagnostics.
 */
import { randomBytes } from "node:crypto";
export class MissingEnvError extends Error {
  constructor(names) {
    super(`missing required environment variables: ${names.join(", ")}`);
    this.name = "MissingEnvError";
    this.missing = names;
  }
}

/** Throws MissingEnvError listing every absent variable at once, not just the first. */
export function requireEnv(names, env = process.env) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) throw new MissingEnvError(missing);
}

/**
 * Decode a base64-encoded secret from the environment into a Buffer.
 * Returns null (never throws) if the variable is absent -- callers decide
 * whether that is fatal (production) or fine to fall back from (local dev).
 */
export function decodeKey(envVar, { expectedBytes = null, env = process.env } = {}) {
  const b64 = env[envVar];
  if (!b64) return null;
  let buf;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw new Error(`${envVar} is not valid base64`);
  }
  if (expectedBytes && buf.length !== expectedBytes) {
    throw new Error(`${envVar} must decode to exactly ${expectedBytes} bytes (got ${buf.length})`);
  }
  return buf;
}

/**
 * A key that MUST be real in staging/production, but may fall back to an
 * ephemeral random value for local development -- with a loud warning,
 * since restarting the process then invalidates every existing session or
 * token signed with the previous ephemeral key. `isLocal` defaults to
 * treating anything other than an explicit "production"/"staging"
 * NODE_ENV as local, so a forgotten env var fails CLOSED (random ephemeral
 * key, sessions silently invalidated) only in the one environment where
 * that is a minor annoyance, never where it would be a real incident.
 */
export function loadOrGenerateKey(envVar, { bytes, logger, env = process.env } = {}) {
  const fromEnv = decodeKey(envVar, { expectedBytes: bytes, env });
  if (fromEnv) return fromEnv;

  const isProdLike = env.NODE_ENV === "production" || env.NODE_ENV === "staging";
  if (isProdLike) {
    throw new MissingEnvError([envVar]);
  }

  const key = randomKey(bytes);
  logger?.emit("worker.tick_failed", {
    worker: "bootstrap",
    error: `${envVar} not set -- using an EPHEMERAL random key for local development. ` +
      `Every existing session/token is invalid after this process restarts.`,
  });
  return key;
}

function randomKey(bytes) {
  return randomBytes(bytes);
}
