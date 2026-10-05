/**
 * A safe, read-only summary of a player's own authentication methods --
 * the one thing the Security / Login Methods UI needs, and the ONLY thing
 * it needs. Deliberately just four booleans/flags: never a provider
 * subject, never a token, never an internal id, never anything else this
 * player couldn't already infer from using their own account.
 */
export async function getAuthMethods(db, playerId) {
  const [email, credential, google, totp] = await Promise.all([
    db.query("SELECT verified_at FROM email_identity WHERE player_id = $1", [playerId]),
    db.query("SELECT 1 FROM credential WHERE player_id = $1", [playerId]),
    db.query("SELECT 1 FROM oauth_identity WHERE player_id = $1 AND provider = 'google'", [playerId]),
    db.query("SELECT confirmed_at FROM totp_secret WHERE player_id = $1", [playerId]),
  ]);

  return {
    email: { exists: email.rows.length > 0, verified: Boolean(email.rows[0]?.verified_at) },
    password: { configured: credential.rows.length > 0 },
    google: { connected: google.rows.length > 0 },
    totp: { enabled: Boolean(totp.rows[0]?.confirmed_at) },
  };
}
