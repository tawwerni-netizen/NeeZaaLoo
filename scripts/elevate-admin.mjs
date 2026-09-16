import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString });

async function run() {
  const client = await pool.connect();
  try {
    // 1. Create role_support_lead
    await client.query(`
      INSERT INTO role (id, name, description, is_system, created_by)
      VALUES ('role_support_lead', 'Support Lead', 'Full customer support management', FALSE, 'system-automation')
      ON CONFLICT (id) DO NOTHING
    `);

    // 2. Assign ticket permissions
    const ticketPerms = ['TICKET_VIEW', 'TICKET_REPLY', 'TICKET_ASSIGN', 'TICKET_ESCALATE', 'TICKET_CLOSE'];
    for (const code of ticketPerms) {
      await client.query(`
        INSERT INTO role_permission (role_id, permission_code)
        VALUES ('role_support_lead', $1)
        ON CONFLICT DO NOTHING
      `, [code]);
    }

    // 3. Create role_chat_mod
    await client.query(`
      INSERT INTO role (id, name, description, is_system, created_by)
      VALUES ('role_chat_mod', 'Chat Moderator', 'Chat and moderation management', FALSE, 'system-automation')
      ON CONFLICT (id) DO NOTHING
    `);

    // 4. Assign chat permissions
    const chatPerms = ['CHAT_VIEW', 'CHAT_DELETE', 'CHAT_MUTE', 'CHAT_REPORT_REVIEW', 'CHAT_MODERATE'];
    for (const code of chatPerms) {
      await client.query(`
        INSERT INTO role_permission (role_id, permission_code)
        VALUES ('role_chat_mod', $1)
        ON CONFLICT DO NOTHING
      `, [code]);
    }

    // 5. Grant roles to Manar1996 and x0code0x
    for (const adminId of ['Manar1996', 'x0code0x']) {
      for (const roleId of ['role_support_lead', 'role_chat_mod']) {
        await client.query(`
          INSERT INTO admin_custom_role_grant (admin_id, role_id, granted_by)
          VALUES ($1, $2, 'system-automation')
          ON CONFLICT DO NOTHING
        `, [adminId, roleId]);
      }
    }

    console.log('Successfully seeded custom roles and grants in production database!');
  } finally {
    client.release();
    await pool.end();
  }
}

run();

