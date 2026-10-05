import fs from 'fs';
import dns from 'dns';
import pg from 'pg';
import { hash as argonHash, Algorithm } from "@node-rs/argon2";
import crypto from 'node:crypto';

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="([^"]+)"/);
if (!match) {
  throw new Error("DATABASE_URL not found in .env");
}

const client = new pg.Client({
  connectionString: match[1],
  ssl: { rejectUnauthorized: false }
});

const ARGON = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const TARGET_PASSWORD = process.env.ADMIN_PASSWORD || "AdminPasswordPlaceholder";

async function main() {
  await client.connect();

  const passwordHash = await argonHash(TARGET_PASSWORD, ARGON);
  console.log("Generated Argon2id hash:", passwordHash.slice(0, 30) + "...");

  const users = [
    { id: 'tawwerni', handle: 'tawwerni', email: 'tawwerni@gmail.com', name: 'Tawwerni' },
    { id: 'logoxpress_eg', handle: 'logoxpress_eg', email: 'logoxpress.eg@gmail.com', name: 'LogoXpress' }
  ];

  for (const u of users) {
    console.log(`\nSetting up SuperAdmin for ${u.id} (${u.email})...`);

    // 0. Ensure player exists
    await client.query(`
      INSERT INTO player (id, handle)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET handle = $2
    `, [u.id, u.handle]);
    console.log(`- Ensured player record for ${u.id}`);

    // 1. Ensure credential exists and password is set
    await client.query(`
      INSERT INTO credential (player_id, password_hash)
      VALUES ($1, $2)
      ON CONFLICT (player_id) DO UPDATE 
      SET password_hash = $2, changed_at = now()
    `, [u.id, passwordHash]);
    console.log(`- Updated credential for ${u.id}`);

    // 2. Ensure email_identity exists
    try {
      await client.query(`
        INSERT INTO email_identity (id, player_id, email, email_display, verified_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (player_id) DO UPDATE
        SET email = $3, email_display = $4, verified_at = now()
      `, [`eid_${crypto.randomUUID()}`, u.id, u.email.toLowerCase(), u.email]);
      console.log(`- Updated email_identity for ${u.id}`);
    } catch (e) {
      console.log(`- email_identity note: ${e.message}`);
    }

    // 3. Ensure admin_user exists
    await client.query(`
      INSERT INTO admin_user (id, email, display_name, mfa_enrolled, disabled_at)
      VALUES ($1, $2, $3, TRUE, NULL)
      ON CONFLICT (id) DO UPDATE
      SET email = $2, display_name = $3, mfa_enrolled = TRUE, disabled_at = NULL
    `, [u.id, u.email, u.name]);
    console.log(`- Updated admin_user for ${u.id}`);

    // 4. Ensure admin_role_grant exists for SUPER_ADMIN
    const grantExists = await client.query(`
      SELECT 1 FROM admin_role_grant 
      WHERE admin_id = $1 AND role = 'SUPER_ADMIN' AND revoked_at IS NULL
    `, [u.id]);

    if (grantExists.rows.length === 0) {
      await client.query(`
        INSERT INTO admin_role_grant (admin_id, role, granted_by, reason)
        VALUES ($1, 'SUPER_ADMIN', 'system-automation', 'Owner SuperAdmin promotion')
      `, [u.id]);
      console.log(`- Granted SUPER_ADMIN role to ${u.id}`);
    } else {
      console.log(`- ${u.id} already has active SUPER_ADMIN role grant`);
    }
  }

  // Verification
  console.log('\n--- Verification ---');
  const admins = await client.query(`
    SELECT u.id, u.email, u.display_name, g.role, g.granted_at, c.changed_at as pwd_changed_at
    FROM admin_user u
    JOIN admin_role_grant g ON g.admin_id = u.id AND g.revoked_at IS NULL
    JOIN credential c ON c.player_id = u.id
    WHERE u.id IN ('tawwerni', 'logoxpress_eg')
  `);
  console.table(admins.rows);

  await client.end();
}

main().catch(err => {
  console.error("Admin setup failed:", err);
  process.exit(1);
});
