import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://neondb_owner:npg_v43zqGfVSXnM@ep-rapid-cell-b1108r3p-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require'
});

async function main() {
  await client.connect();

  console.log('--- local_payment_number ---');
  const numbers = await client.query('SELECT * FROM local_payment_number');
  console.table(numbers.rows);

  console.log('--- payment_rail ---');
  const rails = await client.query("SELECT * FROM payment_rail WHERE network IN ('VODAFONE_CASH', 'INSTAPAY')");
  console.table(rails.rows);

  console.log('--- egp / fx / rate tables ---');
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' AND (table_name LIKE '%rate%' OR table_name LIKE '%fx%' OR table_name LIKE '%egp%')
  `);
  console.table(tables.rows);

  for (const t of tables.rows) {
    const rows = await client.query(`SELECT * FROM ${t.table_name} LIMIT 5`);
    console.log(`Table ${t.table_name}:`, rows.rows);
  }

  // Let's also check readEgpRate implementation in packages/payments/src/local-payments.mjs
  await client.end();
}

main().catch(console.error);
