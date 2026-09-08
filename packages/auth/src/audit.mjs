/**
 * The one way anything in this package writes to security_event
 * (db/migrations/0005_authentication.sql) -- an append-only, trigger-enforced
 * audit log. Extracted from service.mjs so every new identity module added
 * across the authentication slices (email, login-code, password-reset,
 * google) writes to it the same way, instead of five modules each
 * reimplementing the same five-line INSERT.
 */
export function writeSecurityEvent(tx, playerId, type, detail = {}, ctx = {}) {
  return tx.query(
    `INSERT INTO security_event (player_id, type, detail, ip, device_id)
     VALUES ($1,$2,$3::jsonb,$4,$5)`,
    [playerId, type, JSON.stringify(detail), ctx.ip ?? null, ctx.deviceId ?? null]
  );
}
