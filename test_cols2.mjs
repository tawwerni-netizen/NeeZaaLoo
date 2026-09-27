import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='matchmaking_ticket'");
console.log(res.rows);
pool.end();
