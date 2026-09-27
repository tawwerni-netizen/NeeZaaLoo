import pg from "pg";
import fs from "fs";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql78 = fs.readFileSync('db/migrations/0078_ludo_bots.sql', 'utf8');
try {
  await pool.query(sql78);
  console.log("Migration 0078 applied successfully.");
} catch (e) {
  console.error("Migration failed:", e);
}
pool.end();
