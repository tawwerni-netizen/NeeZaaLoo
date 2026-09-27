import pg from 'pg';
import { createSettlementService } from './packages/settlement/src/settle.mjs';

const pool = new pg.Pool({ connectionString: 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify' });
const db = {
  query: (text, params) => pool.query(text, params),
  transaction: async (cb) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await cb(client);
      await client.query('COMMIT');
      return res;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
};

const settlement = createSettlementService(db);

async function run() {
  const due = await db.query(
    `SELECT id FROM duel
      WHERE status = 'COMPLETED' AND fairplay_hold = FALSE
      ORDER BY completed_at
      LIMIT 1000`
  );
  console.log(`Found ${due.rows.length} due duels`);
  let fails = 0;
  let settled = 0;
  let voided = 0;
  for (const row of due.rows) {
    try {
      const res = await settlement.settle(row.id);
      if (res.ok) {
        settled++;
      } else if (res.status === 'VOIDED') {
        voided++;
      } else {
        console.log('Result for', row.id, res);
        fails++;
      }
    } catch (e) {
      console.error('Error for', row.id, e);
      fails++;
    }
  }
  console.log(`Finished: ${settled} settled, ${voided} voided, ${fails} failed.`);
  pool.end();
}

run();
