import pg from 'pg';
import { hash as argonHash, Algorithm } from "@node-rs/argon2";

const client = new pg.Client({
  connectionString: 'postgresql://neondb_owner:npg_v43zqGfVSXnM@ep-rapid-cell-b1108r3p-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require'
});

const ARGON = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const TARGET_PASSWORD = 'Nizalo@Admin#2026!x0Code';

async function main() {
  await client.connect();

  const passwordHash = await argonHash(TARGET_PASSWORD, ARGON);
  console.log("Generated Argon2id hash:", passwordHash.slice(0, 30) + "...");

  const users = [
    { id: 'tawwerni', email: 'tawwerni@gmail.com', name: 'Tawwerni' },
    { id: 'logoxpress_eg', email: 'logoxpress.eg@gmail.com', name: 'LogoXpress' }
  ];

  for (const u of users) {
    console.log(`\nSetting up SuperAdmin for ${u.id} (${u.email})...`);

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
      const { randomUUID } = await import('node:crypto');
      await client.query(`
        INSERT INTO email_identity (id, player_id, email, email_display, verified_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (player_id) DO UPDATE
        SET email = $3, email_display = $4, verified_at = now()
      `, [`eid_${randomUUID()}`, u.id, u.email.toLowerCase(), u.email]);
      console.log(`- Updated email_identity for ${u.id}`);
    } catch (e) {
      console.log(`- email_identity note: ${e.message}`);
    }

    // 3. Ensure admin_user exists
    await client.query(`
      INSERT INTO admin_user (id, email, display_name, mfa_enrolled, disabled_at)
      VALUES ($1, $2, $3, FALSE, NULL)
      ON CONFLICT (id) DO UPDATE
      SET email = $2, display_name = $3, disabled_at = NULL
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

main().catch(console.error);
