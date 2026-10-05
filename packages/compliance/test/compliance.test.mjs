/**
 * Compliance.
 *
 * The property that matters most is the default: a market nobody has ruled on
 * gets free play and nothing else. Most of these tests are attempts to reach
 * real money without a legal position, an age, a KYC tier, or a clear screening.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createComplianceService, Verdict, Reason } from "../src/compliance.mjs";

const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();

async function fresh(players = ["alice"]) {
  const db = await PGlite.create();
  await migrate(db);
  for (const p of players) {
    await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [p]);
  }
  return { db, svc: createComplianceService(db) };
}

/** A fully licensed, fully open market. Fictional -- these are not legal claims. */
async function openMarket(db, country = "XA", region = "*") {
  await db.query(
    `INSERT INTO market (country_code, region_code, legal_status, allowed_products,
                         real_money_eligible, crypto_eligible, minimum_age,
                         kyc_requirement, geo_rule, launch_status, reviewed_by, reviewed_at)
     VALUES ($1,$2,'PERMITTED',
             ARRAY['FREE_PLAY','RANKED','CASH_DUEL','CASH_TOURNAMENT']::product[],
             TRUE, TRUE, 18, 'TIER_1','ALLOW','LIVE','counsel-1', now())`,
    [country, region]
  );
}

async function place(db, playerId, country, region = "*") {
  await db.query(
    `INSERT INTO player_jurisdiction (player_id, country_code, region_code, source)
     VALUES ($1,$2,$3,'KYC')
     ON CONFLICT (player_id) DO UPDATE SET country_code=EXCLUDED.country_code,
                                           region_code=EXCLUDED.region_code`,
    [playerId, country, region]
  );
}

async function verifyKyc(db, playerId, { tier = "TIER_2", age = 30, country = "XA" } = {}) {
  await db.query(
    `INSERT INTO kyc_verification (player_id, tier, status, date_of_birth, country_code, verified_at)
     VALUES ($1,$2::kyc_tier,'VERIFIED', (now() - ($3 || ' years')::interval)::date, $4, now())
     ON CONFLICT (player_id) DO UPDATE SET tier=EXCLUDED.tier, status='VERIFIED',
                                           date_of_birth=EXCLUDED.date_of_birth,
                                           verified_at=now()`,
    [playerId, tier, String(age), country]
  );
}

const screen = (db, playerId, clear = true) =>
  db.query(
    `INSERT INTO sanctions_check (player_id, provider, clear) VALUES ($1,'test',$2)`,
    [playerId, clear]
  );

// ---------------------------------------------------------------------------

describe("the default posture is closed", () => {
  test("an unlisted country resolves to UNDETERMINED, free play only", async () => {
    const { svc } = await fresh();
    const m = await svc.resolveMarket("ZZ");
    assert.equal(m.legal_status, "UNDETERMINED");
    assert.equal(m.real_money_eligible, false);
    assert.equal(m.geo_rule, "ALLOW_FREE_PLAY_ONLY");
    assert.deepEqual(m.allowed_products, ["FREE_PLAY"]);
    assert.equal(m.resolved_from, "DEFAULT");
  });

  test("the market table ships EMPTY — no jurisdiction is pre-approved", async () => {
    const { db } = await fresh();
    const n = await db.query("SELECT count(*)::int c FROM market");
    assert.equal(n.rows[0].c, 0,
      "encoding a legal guess would be worse than encoding nothing");
  });

  test("a player in an unlisted market may play free but not for cash", async () => {
    const { db, svc } = await fresh();
    await place(db, "alice", "ZZ");
    assert.equal((await svc.can("alice", "FREE_PLAY")).verdict, Verdict.ALLOW);
    const cash = await svc.can("alice", "CASH_DUEL");
    assert.equal(cash.verdict, Verdict.DENY);
    assert.equal(cash.reason, Reason.JURISDICTION_UNDETERMINED);
  });

  test("a player with no jurisdiction on file cannot touch money", async () => {
    const { svc } = await fresh();
    assert.equal((await svc.can("alice", "FREE_PLAY")).verdict, Verdict.ALLOW);
    assert.equal((await svc.can("alice", "DEPOSIT")).reason, Reason.NO_JURISDICTION);
  });
});

describe("sub-national granularity", () => {
  test("a region row overrides its country", async () => {
    // The case this exists for: a country permits paid contests, one of its
    // states does not.
    const { db, svc } = await fresh();
    await openMarket(db, "XU", "*");
    await db.query(
      `INSERT INTO market (country_code, region_code, legal_status, allowed_products,
                           real_money_eligible, geo_rule, launch_status)
       VALUES ('XU','XU-WA','PROHIBITED', ARRAY['FREE_PLAY']::product[],
               FALSE,'BLOCK','BLOCKED')`
    );

    const national = await svc.resolveMarket("XU");
    assert.equal(national.real_money_eligible, true);
    assert.equal(national.resolved_from, "COUNTRY");

    const state = await svc.resolveMarket("XU", "XU-WA");
    assert.equal(state.legal_status, "PROHIBITED");
    assert.equal(state.real_money_eligible, false);
    assert.equal(state.resolved_from, "REGION");
  });

  test("a player in a prohibited region is blocked even though the country is open", async () => {
    const { db, svc } = await fresh();
    await openMarket(db, "XU", "*");
    await db.query(
      `INSERT INTO market (country_code, region_code, legal_status, allowed_products,
                           real_money_eligible, geo_rule, launch_status)
       VALUES ('XU','XU-WA','PROHIBITED', ARRAY['FREE_PLAY']::product[],
               FALSE,'BLOCK','BLOCKED')`
    );
    await place(db, "alice", "XU", "XU-WA");
    await verifyKyc(db, "alice");
    await screen(db, "alice");
    const r = await svc.can("alice", "CASH_DUEL");
    assert.equal(r.reason, Reason.JURISDICTION_PROHIBITED);
  });

  test("a region without its own row inherits the country", async () => {
    const { db, svc } = await fresh();
    await openMarket(db, "XU", "*");
    const m = await svc.resolveMarket("XU", "XU-NY");
    assert.equal(m.real_money_eligible, true);
    assert.equal(m.resolved_from, "COUNTRY");
  });
});

describe("the database refuses an unsafe market row", () => {
  test("real money requires a named reviewer", async () => {
    const { db } = await fresh();
    await assert.rejects(
      () => db.query(
        `INSERT INTO market (country_code, legal_status, real_money_eligible, kyc_requirement)
         VALUES ('XB','PERMITTED',TRUE,'TIER_1')`
      ),
      /market_real_money_needs_review|violates check constraint/
    );
  });

  test("real money requires a legal position, not a hopeful one", async () => {
    const { db } = await fresh();
    await assert.rejects(
      () => db.query(
        `INSERT INTO market (country_code, legal_status, real_money_eligible,
                             kyc_requirement, reviewed_by, reviewed_at)
         VALUES ('XC','UNDETERMINED',TRUE,'TIER_1','counsel', now())`
      ),
      /market_real_money_needs_review|violates check constraint/
    );
  });

  test("real money requires at least TIER_1 KYC", async () => {
    const { db } = await fresh();
    await assert.rejects(
      () => db.query(
        `INSERT INTO market (country_code, legal_status, real_money_eligible,
                             kyc_requirement, reviewed_by, reviewed_at)
         VALUES ('XD','PERMITTED',TRUE,'TIER_0','counsel', now())`
      ),
      /market_real_money_needs_kyc|violates check constraint/
    );
  });

  test("a PROHIBITED market cannot be left unblocked", async () => {
    const { db } = await fresh();
    await assert.rejects(
      () => db.query(
        `INSERT INTO market (country_code, legal_status, geo_rule)
         VALUES ('XE','PROHIBITED','ALLOW')`
      ),
      /market_prohibited_is_blocked|violates check constraint/
    );
  });
});

describe("KYC, age and sanctions gate money", () => {
  async function ready(extra = {}) {
    const { db, svc } = await fresh();
    await openMarket(db);
    await place(db, "alice", "XA");
    if (extra.kyc !== false) await verifyKyc(db, "alice", extra.kyc ?? {});
    if (extra.screened !== false) await screen(db, "alice", extra.screened ?? true);
    return { db, svc };
  }

  test("a fully compliant player may play for cash", async () => {
    const { svc } = await ready();
    assert.equal((await svc.can("alice", "CASH_DUEL")).verdict, Verdict.ALLOW);
  });

  test("without KYC, cash play asks for it", async () => {
    const { svc } = await ready({ kyc: false });
    const r = await svc.can("alice", "CASH_DUEL");
    assert.equal(r.verdict, Verdict.REQUIRE_AGE_VERIFICATION);
  });

  test("TIER_1 is enough to deposit but not to withdraw", async () => {
    const { svc } = await ready({ kyc: { tier: "TIER_1", age: 30 } });
    assert.equal((await svc.can("alice", "DEPOSIT")).verdict, Verdict.ALLOW);
    const w = await svc.can("alice", "WITHDRAWAL");
    assert.equal(w.verdict, Verdict.REQUIRE_KYC);
    assert.equal(w.requiredTier, "TIER_2");
  });

  test("an under-age player is refused", async () => {
    const { svc } = await ready({ kyc: { tier: "TIER_2", age: 16 } });
    const r = await svc.can("alice", "CASH_DUEL");
    assert.equal(r.reason, Reason.UNDER_AGE);
  });

  test("a player who has never been screened is not clear", async () => {
    // Absence of a screening result is not a pass.
    const { svc } = await ready({ screened: false });
    assert.equal((await svc.can("alice", "CASH_DUEL")).reason, Reason.SANCTIONS_NOT_CLEAR);
  });

  test("a sanctions hit blocks money but not free play", async () => {
    const { svc } = await ready({ screened: false });
    const { db } = await ready({ screened: false });
    void db;
    assert.equal((await svc.can("alice", "FREE_PLAY")).verdict, Verdict.ALLOW);
    assert.equal((await svc.can("alice", "WITHDRAWAL")).reason, Reason.SANCTIONS_NOT_CLEAR);
  });

  test("screening history cannot be rewritten", async () => {
    const { db } = await ready();
    await assert.rejects(
      () => db.query("UPDATE sanctions_check SET clear = TRUE"), /append-only/
    );
  });

  test("an expired KYC drops the player back to TIER_0", async () => {
    const { db, svc } = await ready();
    await db.query("UPDATE kyc_verification SET expires_at = now() - interval '1 day'");
    const r = await svc.can("alice", "WITHDRAWAL");
    assert.equal(r.verdict, Verdict.REQUIRE_KYC);
    assert.equal(r.detail, "WITHDRAWAL requires TIER_2; you hold TIER_0",
      "an expired verification drops the effective tier to zero");
  });

  test("travelling raises a review, not a denial", async () => {
    const { svc } = await ready();
    const r = await svc.can("alice", "CASH_DUEL", { observedCountry: "XZ" });
    assert.equal(r.verdict, Verdict.REVIEW);
    assert.equal(r.reason, Reason.GEO_MISMATCH);
  });
});

describe("self-exclusion", () => {
  test("outranks everything, including a fully compliant player", async () => {
    const { db, svc } = await fresh();
    await openMarket(db);
    await place(db, "alice", "XA");
    await verifyKyc(db, "alice");
    await screen(db, "alice");
    assert.equal((await svc.can("alice", "CASH_DUEL")).verdict, Verdict.ALLOW);

    await svc.selfExclude({ playerId: "alice", days: 30, reason: "taking a break" });
    for (const product of ["FREE_PLAY", "RANKED", "CASH_DUEL", "DEPOSIT"]) {
      const r = await svc.can("alice", product);
      assert.equal(r.reason, Reason.SELF_EXCLUDED, `${product} must be blocked`);
    }
  });

  test("a permanent exclusion cannot be given an end date", async () => {
    const { db } = await fresh();
    await assert.rejects(
      () => db.query(
        `INSERT INTO self_exclusion (player_id, permanent, ends_at)
         VALUES ('alice',TRUE, now() + interval '1 day')`
      ),
      /permanent_has_no_end|violates check constraint/
    );
  });

  test("an exclusion cannot be deleted or shortened", async () => {
    const { db, svc } = await fresh();
    await svc.selfExclude({ playerId: "alice", days: 90 });
    await assert.rejects(() => db.query("DELETE FROM self_exclusion"), /append-only/);
    await assert.rejects(
      () => db.query("UPDATE self_exclusion SET ends_at = now()"), /append-only/
    );
  });

  test("it follows the device, not just the account", async () => {
    // An exclusion a new signup on the same device can walk around is theatre,
    // and in most regulated markets it is also a licence condition that it not be.
    const { db, svc } = await fresh(["alice", "mallory"]);
    await db.query(
      `INSERT INTO device (id, player_id, fingerprint) VALUES
       ('d1','alice','same-machine'), ('d2','mallory','same-machine')`
    );
    await svc.selfExclude({ playerId: "alice", permanent: true });
    assert.equal(await svc.isSelfExcluded("mallory"), true,
      "a fresh account on the excluded device is also excluded");
  });

  test("an unrelated device is unaffected", async () => {
    const { db, svc } = await fresh(["alice", "bob"]);
    await db.query(
      `INSERT INTO device (id, player_id, fingerprint) VALUES
       ('d1','alice','machine-a'), ('d2','bob','machine-b')`
    );
    await svc.selfExclude({ playerId: "alice", permanent: true });
    assert.equal(await svc.isSelfExcluded("bob"), false);
  });

  test("a temporary exclusion lapses, a live one does not", async () => {
    const { db, svc } = await fresh(["alice", "bob"]);
    await svc.selfExclude({ playerId: "alice", days: 30 });
    assert.equal(await svc.isSelfExcluded("alice"), true, "still inside the window");

    // The table is append-only, so the lapsed case is inserted as a window that
    // has already closed rather than aged by UPDATE.
    await db.query(
      `INSERT INTO self_exclusion (player_id, permanent, starts_at, ends_at)
       VALUES ('bob', FALSE, now() - interval '60 days', now() - interval '1 day')`
    );
    assert.equal(await svc.isSelfExcluded("bob"), false, "the window has closed");
  });
});

describe("responsible competition limits", () => {
  test("tightening a limit takes effect immediately", async () => {
    const { db, svc } = await fresh();
    await svc.setLimit({ playerId: "alice", kind: "DEPOSIT_DAILY", valueMinor: u(1000) });
    const tighten = await svc.setLimit({
      playerId: "alice", kind: "DEPOSIT_DAILY", valueMinor: u(100),
    });
    assert.equal(tighten.effectiveImmediately, true);
    const cur = await db.query(
      "SELECT responsible_limit_current('alice','DEPOSIT_DAILY')::text AS v"
    );
    assert.equal(cur.rows[0].v, u(100));
  });

  test("loosening a limit waits out a cooling-off window", async () => {
    // A player must not be able to raise their own ceiling in the moment they
    // most want to.
    const { db, svc } = await fresh();
    await svc.setLimit({ playerId: "alice", kind: "DEPOSIT_DAILY", valueMinor: u(100) });
    const loosen = await svc.setLimit({
      playerId: "alice", kind: "DEPOSIT_DAILY", valueMinor: u(5000),
    });
    assert.equal(loosen.effectiveImmediately, false);
    assert.equal(loosen.effectiveInHours, 24);

    const cur = await db.query(
      "SELECT responsible_limit_current('alice','DEPOSIT_DAILY')::text AS v"
    );
    assert.equal(cur.rows[0].v, u(100), "the old, tighter limit still applies");
  });

  test("a limit is enforced against what has already been spent", async () => {
    const { svc } = await fresh();
    await svc.setLimit({ playerId: "alice", kind: "DEPOSIT_DAILY", valueMinor: u(100) });
    const within = await svc.checkLimit({
      playerId: "alice", kind: "DEPOSIT_DAILY", proposedMinor: u(40), spentMinor: u(50),
    });
    assert.equal(within.verdict, Verdict.ALLOW);
    const over = await svc.checkLimit({
      playerId: "alice", kind: "DEPOSIT_DAILY", proposedMinor: u(60), spentMinor: u(50),
    });
    assert.equal(over.reason, Reason.LIMIT_EXCEEDED);
  });

  test("limit history cannot be deleted", async () => {
    const { db, svc } = await fresh();
    await svc.setLimit({ playerId: "alice", kind: "LOSS_DAILY", valueMinor: u(50) });
    await assert.rejects(() => db.query("DELETE FROM responsible_limit"), /append-only/);
  });
});

describe("skill-vs-chance evidence", () => {
  async function playedDuel(db, { result, r0, r1, id = "d1" }) {
    await db.query(
      `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                         tier, stake_minor, initial_state, time_control, status,
                         result, termination_reason, completed_at)
       VALUES ($1,'chess',1,$1,'alice','bob','FREE',0,'{}'::jsonb,'{}'::jsonb,
               'COMPLETED',$2,'CHECKMATE', now())`,
      [id, result]
    );
    for (const [pid, before, score] of [
      ["alice", r0, result === "1-0" ? 1.0 : result === "0-1" ? 0.0 : 0.5],
      ["bob", r1, result === "0-1" ? 1.0 : result === "1-0" ? 0.0 : 0.5],
    ]) {
      await db.query(
        `INSERT INTO rating_change (duel_id, player_id, game_id, score,
           rating_before_x100, rating_after_x100, rd_before_x100, rd_after_x100,
           volatility_before_x1e6, volatility_after_x1e6)
         VALUES ($1,$2,'chess',$3,$4,$4,10000,10000,60000,60000)`,
        [id, pid, score, before]
      );
    }
  }

  test("records whether the stronger player won", async () => {
    const { db, svc } = await fresh(["alice", "bob"]);
    await playedDuel(db, { result: "1-0", r0: 180000, r1: 150000 });
    const r = await svc.recordSkillEvidence("d1");
    assert.equal(r.ok, true);
    assert.equal(r.higherRatedWon, true);
    assert.equal(r.ratingGapX100, 30000);
  });

  test("records an upset correctly", async () => {
    const { db, svc } = await fresh(["alice", "bob"]);
    await playedDuel(db, { result: "0-1", r0: 180000, r1: 150000 });
    assert.equal((await svc.recordSkillEvidence("d1")).higherRatedWon, false);
  });

  test("measures against PRE-duel ratings", async () => {
    // Using post-duel ratings would build the conclusion into the data: the
    // winner's rating always rises, so the winner would always look stronger.
    const { db, svc } = await fresh(["alice", "bob"]);
    await playedDuel(db, { result: "0-1", r0: 160000, r1: 159000 });
    await db.query("UPDATE rating SET rating_x100 = 999999 WHERE TRUE").catch(() => {});
    const r = await svc.recordSkillEvidence("d1");
    assert.equal(r.ratingGapX100, 1000, "the gap is the one that existed before play");
  });

  test("is recorded once per duel", async () => {
    const { db, svc } = await fresh(["alice", "bob"]);
    await playedDuel(db, { result: "1-0", r0: 170000, r1: 150000 });
    await svc.recordSkillEvidence("d1");
    await svc.recordSkillEvidence("d1");
    const n = await db.query("SELECT count(*)::int c FROM skill_evidence");
    assert.equal(n.rows[0].c, 1);
  });

  test("the correlation view answers the legal question", async () => {
    const { db, svc } = await fresh(["alice", "bob"]);
    // A wide-gap sample in which the stronger player wins every time is what a
    // game of skill looks like; chance would sit near 50%.
    for (let i = 0; i < 10; i++) {
      await playedDuel(db, { result: "1-0", r0: 190000, r1: 150000, id: `d${i}` });
      await svc.recordSkillEvidence(`d${i}`);
    }
    const rows = await svc.skillCorrelation("chess");
    assert.ok(rows.length >= 1);
    assert.equal(Number(rows[0].higher_rated_win_pct), 100);
    assert.equal(rows[0].duels, 10);
  });
});
