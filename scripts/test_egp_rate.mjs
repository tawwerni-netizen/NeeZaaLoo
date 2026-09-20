import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://neondb_owner:npg_v43zqGfVSXnM@ep-rapid-cell-b1108r3p-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require'
});

async function main() {
  await client.connect();

  console.log('--- asset table EGP ---');
  const asset = await client.query("SELECT * FROM asset WHERE code = 'EGP'");
  console.table(asset.rows);

  console.log('--- Trying record_valuation_snapshot EGP ---');
  try {
    // 1 USD = 50 EGP => usd_rate_x1e8 = 1e8 / 50 = 2000000
    const r = await client.query(
      "SELECT * FROM record_valuation_snapshot('EGP', 2000000, 'MANUAL', now(), 10000, 'admin_system', 'Initial seed')"
    );
    console.log("Success:", r.rows);
  } catch (e) {
    console.error("record_valuation_snapshot error:", e.message);
  }

  await client.end();
}

main().catch(console.error);
