import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  await client.query(`UPDATE player SET handle = 'Farouk_Saeed' WHERE id = 'ai-expert'`);
  console.log('Fixed ai-expert');
  await client.end();
}
run();
