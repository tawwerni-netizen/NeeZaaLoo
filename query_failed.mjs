import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const res = await client.query("SELECT * FROM duel WHERE id = 'duel_live_211cabc5'");
console.log(res.rows);
await client.end();
