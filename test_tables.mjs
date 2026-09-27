import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
console.log(res.rows);
pool.end();
