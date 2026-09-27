import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const res = await pool.query("SELECT * FROM game WHERE id='ludo'");
console.log(res.rows);
pool.end();
