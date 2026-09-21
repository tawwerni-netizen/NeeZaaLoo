import { hash as argonHash, verify as argonVerify, Algorithm } from "@node-rs/argon2";

const SQL_ENDPOINT = "https://ep-cold-frog-b2dicy1p.c-6.eu-central-1.aws.neon.tech/sql";
const NEON_CONN_STRING = "postgresql://neondb_owner:npg_ABH8MueOg6Qd@ep-cold-frog-b2dicy1p.c-6.eu-central-1.aws.neon.tech/neondb";

const ARGON = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const TARGET_PASSWORD = "Nizalo@Admin#2026!x0Code";

async function queryHttp(sql) {
  const res = await fetch(SQL_ENDPOINT, {
    method: "POST",
    headers: {
      "neon-connection-string": NEON_CONN_STRING,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const data = await res.json();
  if (!res.ok || data.message || data.error) {
    throw new Error(data.message || data.error || JSON.stringify(data));
  }
  return data.rows || [];
}

async function execHttp(queries) {
  const res = await fetch(SQL_ENDPOINT, {
    method: "POST",
    headers: {
      "neon-connection-string": NEON_CONN_STRING,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      queries: queries.map((q) => ({ query: q })),
    }),
  });
  const data = await res.json();
  if (!res.ok || data.message || data.error) {
    throw new Error(data.message || data.error || JSON.stringify(data));
  }
  return data;
}

async function main() {
  console.log("=== Setting up Super Admins & Passwords ===");
  
  const passwordHash = await argonHash(TARGET_PASSWORD, ARGON);
  console.log("Generated Argon2id hash:", passwordHash.slice(0, 30) + "...");

  const users = [
    {
      id: "tawwerni",
      handle: "tawwerni",
      email: "tawwerni@gmail.com",
      emailDisplay: "Tawwerni@gmail.com",
      displayName: "Tawwerni",
    },
    {
      id: "logoxpress_eg",
      handle: "logoxpress_eg",
      email: "logoxpress.eg@gmail.com",
      emailDisplay: "LogoXpress.eg@gmail.com",
      displayName: "LogoXpress",
    }
  ];

  const queries = [];

  for (const u of users) {
    // 1. Ensure player exists and is enabled
    queries.push(`
      INSERT INTO player (id, handle, locale, disabled_at)
      VALUES ('${u.id}', '${u.handle}', 'ar', NULL)
      ON CONFLICT (id) DO UPDATE
      SET handle = '${u.handle}', disabled_at = NULL;
    `);

    // 2. Set credential with fresh Argon2id hash
    queries.push(`
      INSERT INTO credential (player_id, password_hash, changed_at)
      VALUES ('${u.id}', '${passwordHash}', now())
      ON CONFLICT (player_id) DO UPDATE
      SET password_hash = '${passwordHash}', changed_at = now();
    `);

    // 3. Ensure email identity exists and is verified
    queries.push(`
      INSERT INTO email_identity (id, player_id, email, email_display, verified_at)
      VALUES ('eid_${u.id}', '${u.id}', '${u.email.toLowerCase()}', '${u.emailDisplay}', now())
      ON CONFLICT (player_id) DO UPDATE
      SET email = '${u.email.toLowerCase()}', email_display = '${u.emailDisplay}', verified_at = now();
    `);

    // 4. Ensure admin_user exists, enabled, mfa_enrolled
    queries.push(`
      INSERT INTO admin_user (id, email, display_name, mfa_enrolled, disabled_at)
      VALUES ('${u.id}', '${u.email.toLowerCase()}', '${u.displayName}', TRUE, NULL)
      ON CONFLICT (id) DO UPDATE
      SET email = '${u.email.toLowerCase()}', display_name = '${u.displayName}', mfa_enrolled = TRUE, disabled_at = NULL;
    `);

    // 5. Ensure SUPER_ADMIN role grant
    queries.push(`
      INSERT INTO admin_role_grant (admin_id, role, granted_by, reason, revoked_at)
      VALUES ('${u.id}', 'SUPER_ADMIN', 'system-bootstrap', 'Primary SuperAdmin', NULL)
      ON CONFLICT DO NOTHING;
    `);

    // In case there's an existing revoked grant, un-revoke it
    queries.push(`
      UPDATE admin_role_grant
      SET revoked_at = NULL
      WHERE admin_id = '${u.id}' AND role = 'SUPER_ADMIN';
    `);

    // 6. Clear any failed login attempts to prevent lockout
    queries.push(`
      DELETE FROM login_attempt
      WHERE LOWER(identifier) IN ('${u.id}', '${u.handle.toLowerCase()}', '${u.email.toLowerCase()}', '${u.emailDisplay.toLowerCase()}');
    `);
  }

  await execHttp(queries);
  console.log("✓ Applied all database updates for Super Admins");

  // Verify credentials and roles
  console.log("\n=== Verifying in Database ===");
  for (const u of users) {
    const playerRow = await queryHttp(`SELECT id, handle, disabled_at FROM player WHERE id = '${u.id}';`);
    const credRow = await queryHttp(`SELECT password_hash FROM credential WHERE player_id = '${u.id}';`);
    const emailRow = await queryHttp(`SELECT email, email_display, verified_at FROM email_identity WHERE player_id = '${u.id}';`);
    const adminRow = await queryHttp(`SELECT id, email, display_name, mfa_enrolled, disabled_at FROM admin_user WHERE id = '${u.id}';`);
    const grantRow = await queryHttp(`SELECT role, revoked_at FROM admin_role_grant WHERE admin_id = '${u.id}' AND revoked_at IS NULL;`);
    const rolesRes = await queryHttp(`SELECT admin_roles('${u.id}') AS roles;`);

    console.log(`\nUser: ${u.id} (${u.emailDisplay})`);
    console.log(`  Handle: ${playerRow[0]?.handle}`);
    console.log(`  Email: ${emailRow[0]?.email} (Verified: ${!!emailRow[0]?.verified_at})`);
    console.log(`  Admin User: ${adminRow[0]?.display_name} (Active: ${!adminRow[0]?.disabled_at})`);
    console.log(`  Effective Roles: ${JSON.stringify(rolesRes[0]?.roles)}`);

    const matches = await argonVerify(credRow[0]?.password_hash, TARGET_PASSWORD);
    console.log(`  Password Match Test: ${matches ? "PASSED (✓)" : "FAILED (✗)"}`);
  }
}

main().catch(console.error);
