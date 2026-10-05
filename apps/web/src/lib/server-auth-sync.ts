import { randomBytes, randomUUID, createHmac, createHash } from "node:crypto";

// Global cached pool to avoid reconnect overhead across route invocations
let globalPool: any = null;

async function getAuthDbPool(): Promise<any> {
  if (globalPool) return globalPool;

  const pgModule = await import("pg");
  const PoolClass = pgModule.default?.Pool || (pgModule as any).Pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("[server-auth-sync] DATABASE_URL is not set in environment");
  }

  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

  globalPool = new PoolClass({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
    statement_timeout: 10000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  globalPool.on("error", (err: any) => {
    console.error("[server-auth-sync pg pool error]", err?.message || err);
  });

  return globalPool;
}

export type DirectSyncParams = {
  email: string;
  subject?: string | null | undefined;
  name?: string | null | undefined;
  ip?: string | null | undefined;
  userAgent?: string | null | undefined;
};

export type DirectSyncResult = {
  ok: boolean;
  playerId: string;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};

export async function syncDirectWithDb(params: DirectSyncParams): Promise<DirectSyncResult> {
  const { email, subject, name, ip, userAgent } = params;
  if (!email || typeof email !== "string") {
    throw new Error("email is required");
  }

  const pool = await getAuthDbPool();
  const normEmail = email.trim().toLowerCase();
  let playerId: string | null = null;

  // 1. Check existing oauth_identity
  if (subject) {
    const oid = await pool.query(
      "SELECT player_id FROM oauth_identity WHERE provider = 'google' AND provider_subject = $1",
      [String(subject)]
    );
    if (oid.rows.length) {
      playerId = oid.rows[0].player_id;
    }
  }

  // 2. Check existing email_identity
  if (!playerId) {
    const em = await pool.query(
      "SELECT player_id FROM email_identity WHERE email = $1",
      [normEmail]
    );
    if (em.rows.length) {
      playerId = em.rows[0].player_id;
      // Link Google OAuth identity
      if (subject) {
        await pool.query(
          `INSERT INTO oauth_identity (id, player_id, provider, provider_subject, email, email_verified, created_at)
           VALUES ($1, $2, 'google', $3, $4, true, now())
           ON CONFLICT (provider, provider_subject) DO NOTHING`,
          [`oid_${randomUUID()}`, playerId, String(subject), normEmail]
        ).catch(() => {});
      }
    }
  }

  // 3. Create new player if neither found
  if (!playerId) {
    const emailPrefix = normEmail.split("@")[0] || "player";
    const rawBase = (name || emailPrefix).replace(/[^a-zA-Z0-9_-]/g, "_") || "player";
    const base = (rawBase.length < 3 ? `${rawBase}_player` : rawBase).slice(0, 18);
    let handle = base;
    const exists = await pool.query("SELECT 1 FROM player WHERE handle = $1", [handle]);
    if (exists.rows.length) {
      handle = `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
    }
    playerId = handle;

    await pool.query(
      "INSERT INTO player (id, handle, locale) VALUES ($1, $2, 'ar')",
      [playerId, handle]
    );

    // Open user wallet in ledger
    await pool.query("SELECT ledger_open_user_wallet($1)", [playerId]).catch((err: any) => {
      console.warn("[server-auth-sync] ledger_open_user_wallet warning:", err?.message || err);
    });

    // Record email identity
    await pool.query(
      `INSERT INTO email_identity (id, player_id, email, email_display, verified_at, created_at)
       VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (email) DO NOTHING`,
      [`eid_${randomUUID()}`, playerId, normEmail, email.trim()]
    );

    // Record oauth identity
    if (subject) {
      await pool.query(
        `INSERT INTO oauth_identity (id, player_id, provider, provider_subject, email, email_verified, created_at)
         VALUES ($1, $2, 'google', $3, $4, true, now())
         ON CONFLICT (provider, provider_subject) DO NOTHING`,
        [`oid_${randomUUID()}`, playerId, String(subject), normEmail]
      ).catch(() => {});
    }
  }

  // 4. Verify player is not disabled
  const playerCheck = await pool.query(
    "SELECT disabled_at, disabled_category FROM player WHERE id = $1",
    [playerId]
  );
  if (playerCheck.rows.length && (playerCheck.rows[0] as any)?.disabled_at) {
    throw new Error("ACCOUNT_DISABLED");
  }

  // 5. Issue session and tokens (compatible with packages/auth)
  const defaultSigningKey = "qD2UhdyGUdG12PiECMGEbJdEgATItv6zdAkwY0CCkvs=";
  const signingKey = Buffer.from(process.env.AUTH_SIGNING_KEY_B64 || defaultSigningKey, "base64");

  const sessionId = randomUUID();
  const familyId = randomUUID();
  const refreshToken = randomBytes(32).toString("base64url");
  const refreshHash = createHash("sha256").update(refreshToken).digest("hex");
  const nowMs = Date.now();
  const ttlSeconds = 900; // 15 mins

  // Insert session into auth_session
  await pool.query(
    `INSERT INTO auth_session (id, family_id, player_id, refresh_hash, expires_at, issued_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, now() + interval '30 days', now(), $5, $6)`,
    [sessionId, familyId, playerId, refreshHash, ip || null, userAgent || null]
  );

  // Mint signed JWT access token (HMAC-SHA256)
  const claims = {
    sub: playerId,
    sid: sessionId,
    scp: [],
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = createHmac("sha256", signingKey).update(body).digest().toString("base64url");
  const accessToken = `${body}.${sig}`;

  return {
    ok: true,
    playerId,
    accessToken,
    refreshToken,
    expiresInSeconds: ttlSeconds,
  };
}
