/**
 * Real PostgreSQL -- the local EGP rails (Vodafone Cash / InstaPay) added by
 * 0062_local_egp_payment_rails.sql, exercised through
 * createLocalPaymentsService() exactly as the Android payment-receiver app
 * and the admin dashboard do.
 *
 * Focused on the one behavioural change this session made: matching an
 * observed transfer to a declared deposit intent by sender NAME as well as
 * by phone. InstaPay receipts never carry a sender phone (only Vodafone
 * Cash does), so phone-only matching silently left every clean InstaPay
 * deposit unmatched for manual review. This is the money-critical half of
 * that fix -- the SMS parsing itself already has its own coverage in
 * sms-parsers.test.mjs.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { provisionRealPgDatabase } from "../../ledger/test-support/real-pg-db.mjs";
import { createLocalPaymentsService } from "../src/local-payments.mjs";

const { reachable, reachabilityError, TEST_DATABASE_URL, drop } = await provisionRealPgDatabase();

function id(prefix) {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

describe(
  "Local EGP payment rails (Vodafone Cash / InstaPay), against real Postgres",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` },
  () => {
    let client, db, local, playerId;
    const VF_NUMBER = "vf_test_1";
    const IPN_NUMBER = "instapay_test_1";

    before(async () => {
      client = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await client.connect();
      db = createPgAdapter(client);
      await migrate(db);
      local = createLocalPaymentsService(db);

      await db.query(`INSERT INTO local_payment_number (id, network, phone_number) VALUES ($1,'VODAFONE_CASH','01000000001')`, [VF_NUMBER]);
      await db.query(`INSERT INTO local_payment_number (id, network, phone_number) VALUES ($1,'INSTAPAY','01000000002')`, [IPN_NUMBER]);

      const rate = await local.setEgpRate({ egpPerUsd: 50, adminId: "admin-test", reason: "test setup" });
      assert.equal(rate.ok, true);
    });

    after(async () => { await client.end(); await drop(); });

    beforeEach(async () => {
      playerId = id("p");
      await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);
      await db.query("SELECT ledger_open_user_wallet($1)", [playerId]);
    });

    test("Vodafone Cash: matched by phone, as before -- regression guard", async () => {
      const intent = await local.createDepositIntent({
        playerId, network: "VODAFONE_CASH", receivingNumberId: VF_NUMBER,
        senderName: "أحمد محمد", senderPhone: "01515339319", amountEgpMinor: "50000",
      });
      assert.equal(intent.ok, true);

      const report = await local.reportDeviceTransfer({
        deviceId: "manual_admin", network: "VODAFONE_CASH", receivingNumberId: VF_NUMBER,
        rawSenderName: "أحمد محمد", rawSenderPhone: "01515339319", amountEgpMinor: "50000",
        rawMessage: "test vf message", observedAt: new Date().toISOString(),
      });
      assert.equal(report.ok, true);
      assert.equal(report.status, "MATCHED");

      const row = await db.query(`SELECT status, credited_amount_usdt_minor::text u FROM local_deposit_intent WHERE id=$1`, [intent.intent.id]);
      assert.equal(row.rows[0].status, "CREDITED");
      assert.equal(row.rows[0].u, "10000000", "500 EGP at 50 EGP/USD = 10 USDT = 10_000_000 minor units");
    });

    test("InstaPay: matched by NAME when no phone is present -- the actual fix", async () => {
      const intent = await local.createDepositIntent({
        playerId, network: "INSTAPAY", receivingNumberId: IPN_NUMBER,
        senderName: "محمد فريد احمد محمود",
        // The player still has to declare *some* phone (declared_sender_phone
        // is NOT NULL by schema), but IPN transfers never carry one, so it
        // can never be what actually matches.
        senderPhone: "01234567890",
        amountEgpMinor: "500000",
      });
      assert.equal(intent.ok, true);

      const report = await local.reportDeviceTransfer({
        deviceId: "manual_admin", network: "INSTAPAY", receivingNumberId: IPN_NUMBER,
        rawSenderName: "محمد فريد احمد محمود",
        rawSenderPhone: null, // exactly what InstaPay parsing produces
        amountEgpMinor: "500000",
        rawMessage: "لقد استقبلت تحويل لحظي على 0540 بمبلغ 5,000.00 جم عبر IPN من محمد فريد احمد محمود يوم 28-02-2026 الساعة 16:50 رقم المعاملة 9def186b",
        observedAt: new Date().toISOString(),
      });
      assert.equal(report.ok, true);
      assert.equal(report.status, "MATCHED", "a clean name+amount match must not be left UNMATCHED for manual review");

      const row = await db.query(`SELECT status FROM local_deposit_intent WHERE id=$1`, [intent.intent.id]);
      assert.equal(row.rows[0].status, "CREDITED");
    });

    test("a name that does not match anything stays UNMATCHED -- no false positive", async () => {
      const intent = await local.createDepositIntent({
        playerId, network: "INSTAPAY", receivingNumberId: IPN_NUMBER,
        senderName: "شخص آخر تمامًا", senderPhone: "01234567890", amountEgpMinor: "600000",
      });
      assert.equal(intent.ok, true);

      const report = await local.reportDeviceTransfer({
        deviceId: "manual_admin", network: "INSTAPAY", receivingNumberId: IPN_NUMBER,
        rawSenderName: "اسم مختلف كليا", rawSenderPhone: null, amountEgpMinor: "600000",
        rawMessage: "unrelated message text", observedAt: new Date().toISOString(),
      });
      assert.equal(report.ok, true);
      assert.equal(report.status, "UNMATCHED");

      const row = await db.query(`SELECT status FROM local_deposit_intent WHERE id=$1`, [intent.intent.id]);
      assert.equal(row.rows[0].status, "PENDING", "an unresolved name mismatch is left for a human, never guessed");
    });
  }
);
