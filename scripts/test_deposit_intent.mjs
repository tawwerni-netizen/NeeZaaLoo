import { loadEnv } from "./load-env.mjs";
loadEnv();

import pg from 'pg';
import { createLocalPaymentsService } from '../packages/payments/src/local-payments.mjs';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  await client.connect();

  const player = await client.query("SELECT id, handle FROM player LIMIT 1");
  const pId = player.rows[0].id;
  console.log("Using real player:", player.rows[0]);

  const local = createLocalPaymentsService(client);
  const intentRes = await local.createDepositIntent({
    playerId: pId,
    network: "VODAFONE_CASH",
    receivingNumberId: "vf_1",
    senderName: "حفظى حفظى",
    senderPhone: "01069999557",
    amountEgpMinor: "50000",
  });
  console.log("Deposit Intent Result:", intentRes);

  await client.end();
}

main().catch(console.error);
