/**
 * Authorisation.
 *
 * Most of these tests are attempts to get a decision the actor should not be
 * able to get. The capability grid is asserted in full, so widening a role is
 * something a person has to do on purpose, in a test, with a reviewer.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import {
  authorize, Decision, ACTIONS, ROLE_CAPABILITIES, capabilitiesFor,
  undeclaredActions, orphanedCapabilities, ALL_CAPABILITIES,
} from "../src/policy.mjs";

const ALL_ON = Object.fromEntries(
  ["REGISTRATION", "MATCHMAKING", "CASH_MATCHES", "TOURNAMENTS", "DEPOSITS",
   "WITHDRAWALS", "PROMOTIONS", "REGIONS", "REFERRALS"].map((k) => [k, true])
);

const admin = (roles, over = {}) => ({
  type: "ADMIN", id: "admin-1", roles, mfaEnrolled: true, ...over,
});
const player = (id = "alice", over = {}) => ({ type: "PLAYER", id, ...over });

const decide = (req) => authorize({ controls: ALL_ON, ...req }).decision;

// ---------------------------------------------------------------------------

describe("deny by default", () => {
  test("an undeclared action is denied to everyone, including SUPER_ADMIN", () => {
    for (const actor of [player(), admin(["SUPER_ADMIN"]), { type: "SYSTEM", id: "worker" }]) {
      const r = authorize({ actor, action: "admin.secretly.do.anything", controls: ALL_ON });
      assert.equal(r.decision, Decision.DENY);
      assert.equal(r.reason, "UNDECLARED_ACTION");
    }
  });

  test("a missing actor is denied", () => {
    assert.equal(decide({ actor: null, action: "player.login" }), Decision.DENY);
  });

  test("an unknown actor type is denied", () => {
    assert.equal(decide({ actor: { type: "ROBOT", id: "x" }, action: "admin.user.read" }),
      Decision.DENY);
  });

  test("every declared action names a capability that some role holds", () => {
    const { usedButNeverGranted } = orphanedCapabilities();
    assert.deepEqual(usedButNeverGranted, [],
      "an action requiring a capability nobody has is unreachable dead code");
  });

  test("every granted capability is used by some action", () => {
    const { grantedButNeverUsed } = orphanedCapabilities();
    assert.deepEqual(grantedButNeverUsed, [],
      "a capability nobody checks is a privilege granted for no reason");
  });

  test("undeclaredActions() catches a route that forgot to declare itself", () => {
    assert.deepEqual(undeclaredActions(["player.login", "admin.user.read"]), []);
    assert.deepEqual(undeclaredActions(["admin.new.endpoint"]), ["admin.new.endpoint"]);
  });
});

describe("the capability grid", () => {
  // Asserted in full. If a role gains a capability, this test fails and someone
  // has to decide, in writing, that the widening is intended.
  //
  // 2026-09-06: SUPER_ADMIN and ADMIN both gained "tournament.manage" when the
  // Tournament Engine was wired into the API. Tournaments are operational
  // content, the same category as the content/support capabilities ADMIN
  // already holds, and prize settlement (the one step that moves money) is
  // separately gated by its own step-up + four-eyes action, so this widening
  // does not create a new path to unreviewed money movement. Intended.
  //
  // 2026-09-06 (same day, Phase 4): the reconciliation job runner shipped
  // with two new capabilities, "reconciliation.read" and
  // "reconciliation.decide". Read access follows the exact same distribution
  // as "audit.read" (SUPER_ADMIN, ADMIN, RISK_ADMIN, ANALYST, READ_ONLY --
  // everyone who already gets a look at the audit trail also gets a look at
  // reconciliation cases). Decide access (closing a case as RESOLVED or
  // FALSE_POSITIVE) goes only to SUPER_ADMIN and FINANCE_ADMIN, the two roles
  // that already hold "adjustment.create" -- reconciliation cases are
  // financial-discrepancy findings, and FINANCE_ADMIN is their natural owner.
  // RISK_ADMIN sees the same cases (many originate from provider/settlement
  // signals it already reviews elsewhere) but cannot close them. Crucially,
  // resolving a case never moves money by itself -- the one reconciliation
  // action that DOES have financial teeth, the automatic solvency-breach
  // withdrawal halt, is system-triggered with no admin action at all, so
  // this widening does not create any new path to unreviewed money movement
  // either. Intended.
  // 2026-09-06 (same day, RBAC foundation): SUPER_ADMIN gained "rbac.manage",
  // gating admin.rbac.manage -- create/edit a CUSTOM role and decide which
  // permission codes (db/migrations/0015) it holds. This is deliberately
  // separate from "role.manage" above (which governs the fixed
  // SUPER_ADMIN/FINANCE_ADMIN/... grid): no permission code seeded in 0015
  // shadows an existing capability, so this widening opens no new path to
  // money, risk, or fairplay authority -- only to domains (support tickets,
  // chat moderation, game-catalog config) that have no enforcement point yet.
  // Restricted to SUPER_ADMIN alone, matching "role.manage" and
  // "control.global" above, for the same reason: the surface that assigns
  // privileges must not itself be assignable by anyone but the top role.
  const EXPECTED = {
    // +3 each for FINANCE_ADMIN/SUPER_ADMIN (rail.read, rail.manage,
    // control.read), +2 for ADMIN/RISK_ADMIN/ANALYST/READ_ONLY (rail.read,
    // control.read only -- rail.manage stays finance-and-super-admin-only,
    // the same spread as economy.manage) since the Admin Payment &
    // Stablecoin Control Center's own capabilities were added.
    SUPER_ADMIN: 32,
    ADMIN: 17,
    FINANCE_ADMIN: 16,
    RISK_ADMIN: 16,
    ANTI_CHEAT_MODERATOR: 6,
    CONTENT_MODERATOR: 2,
    SUPPORT: 3,
    ANALYST: 5,
    READ_ONLY: 7,
  };

  for (const [role, count] of Object.entries(EXPECTED)) {
    test(`${role} holds exactly ${count} capabilities`, () => {
      assert.equal(ROLE_CAPABILITIES[role].length, count,
        `actual: ${JSON.stringify(ROLE_CAPABILITIES[role])}`);
    });
  }

  test("only SUPER_ADMIN can pull the global emergency switch", () => {
    const holders = Object.entries(ROLE_CAPABILITIES)
      .filter(([, caps]) => caps.includes("control.global"))
      .map(([r]) => r);
    assert.deepEqual(holders, ["SUPER_ADMIN"]);
  });

  test("only SUPER_ADMIN can manage roles", () => {
    const holders = Object.entries(ROLE_CAPABILITIES)
      .filter(([, caps]) => caps.includes("role.manage"))
      .map(([r]) => r);
    assert.deepEqual(holders, ["SUPER_ADMIN"]);
  });

  test("SUPPORT cannot see wallets, ledgers, or risk", () => {
    const caps = capabilitiesFor(["SUPPORT"]);
    for (const forbidden of ["wallet.read", "ledger.read", "risk.read",
                             "withdrawal.review", "withdrawal.approve", "adjustment.create"]) {
      assert.equal(caps.has(forbidden), false, `SUPPORT must not hold ${forbidden}`);
    }
  });

  test("RISK_ADMIN can hold a payout but cannot release one", () => {
    // The distinction that matters: the role that flags a withdrawal as
    // suspicious must not also be able to let it through.
    const caps = capabilitiesFor(["RISK_ADMIN"]);
    assert.equal(caps.has("withdrawal.review"), true);
    assert.equal(caps.has("withdrawal.approve"), false);
  });

  test("ANALYST and READ_ONLY hold nothing that changes state", () => {
    const mutating = ["user.restrict", "user.close", "duel.void", "withdrawal.approve",
      "adjustment.create", "economy.manage", "risk.decide", "fairplay.decide",
      "content.moderate", "role.manage", "control.toggle", "control.global"];
    for (const role of ["ANALYST", "READ_ONLY"]) {
      const caps = capabilitiesFor([role]);
      for (const m of mutating) {
        assert.equal(caps.has(m), false, `${role} must not hold ${m}`);
      }
    }
  });

  test("no role outside finance can create a balance adjustment", () => {
    const holders = Object.entries(ROLE_CAPABILITIES)
      .filter(([, caps]) => caps.includes("adjustment.create"))
      .map(([r]) => r).sort();
    assert.deepEqual(holders, ["FINANCE_ADMIN", "SUPER_ADMIN"]);
  });
});

describe("admin authorisation", () => {
  test("an admin without MFA holds no privileges at all", () => {
    const r = authorize({
      actor: admin(["SUPER_ADMIN"], { mfaEnrolled: false }),
      action: "admin.user.read", controls: ALL_ON,
    });
    assert.equal(r.decision, Decision.DENY);
    assert.equal(r.reason, "MFA_REQUIRED");
  });

  test("a disabled admin is denied", () => {
    assert.equal(
      decide({ actor: admin(["SUPER_ADMIN"], { disabled: true }), action: "admin.user.read" }),
      Decision.DENY
    );
  });

  test("a missing capability is denied with the reason", () => {
    const r = authorize({
      actor: admin(["SUPPORT"]), action: "admin.ledger.read", controls: ALL_ON,
    });
    assert.equal(r.decision, Decision.DENY);
    assert.equal(r.reason, "MISSING_CAPABILITY");
    assert.match(r.detail, /ledger\.read/);
  });

  test("a held capability with no step-up requirement is allowed", () => {
    assert.equal(decide({ actor: admin(["ANALYST"]), action: "admin.analytics.read" }),
      Decision.ALLOW);
  });

  test("sensitive actions demand step-up even from someone who holds the capability", () => {
    assert.equal(decide({ actor: admin(["RISK_ADMIN"]), action: "admin.risk.decide" }),
      Decision.REQUIRE_STEP_UP);
    assert.equal(
      decide({
        actor: admin(["RISK_ADMIN"], { stepUpFor: "admin.risk.decide" }),
        action: "admin.risk.decide",
      }),
      Decision.ALLOW
    );
  });

  test("a step-up for one action does not unlock another", () => {
    assert.equal(
      decide({
        actor: admin(["SUPER_ADMIN"], { stepUpFor: "admin.user.restrict" }),
        action: "admin.control.global",
      }),
      Decision.REQUIRE_STEP_UP
    );
  });
});

describe("four eyes", () => {
  const financeStepped = admin(["FINANCE_ADMIN"], {
    id: "finance-1", stepUpFor: "admin.withdrawal.approve",
  });

  test("approving a withdrawal alone is not enough", () => {
    const r = authorize({
      actor: financeStepped, action: "admin.withdrawal.approve", controls: ALL_ON,
    });
    assert.equal(r.decision, Decision.REQUIRE_APPROVAL);
    assert.equal(r.reason, "SECOND_ADMIN_REQUIRED");
  });

  test("a second, different admin unlocks it", () => {
    const r = authorize({
      actor: financeStepped, action: "admin.withdrawal.approve", controls: ALL_ON,
      approval: { approvedBy: "finance-2", action: "admin.withdrawal.approve" },
    });
    assert.equal(r.decision, Decision.ALLOW);
  });

  test("self-approval is refused — and seniority is not an exception", () => {
    for (const roles of [["FINANCE_ADMIN"], ["SUPER_ADMIN"]]) {
      const r = authorize({
        actor: admin(roles, { id: "same-person", stepUpFor: "admin.withdrawal.approve" }),
        action: "admin.withdrawal.approve",
        controls: ALL_ON,
        approval: { approvedBy: "same-person", action: "admin.withdrawal.approve" },
      });
      assert.equal(r.decision, Decision.DENY);
      assert.equal(r.reason, "SELF_APPROVAL");
    }
  });

  test("an approval for a different action does not transfer", () => {
    const r = authorize({
      actor: admin(["SUPER_ADMIN"], { stepUpFor: "admin.user.close" }),
      action: "admin.user.close",
      controls: ALL_ON,
      approval: { approvedBy: "admin-2", action: "admin.economy.change" },
    });
    assert.equal(r.reason, "APPROVAL_MISMATCH");
  });

  test("every money-moving action requires four eyes", () => {
    for (const action of ["admin.withdrawal.approve", "admin.adjustment.create",
                          "admin.economy.change", "admin.duel.void"]) {
      assert.equal(ACTIONS[action].fourEyes, true, `${action} must require a second admin`);
      assert.equal(ACTIONS[action].stepUp, true, `${action} must require step-up`);
    }
  });
});

describe("player authorisation", () => {
  test("a player cannot reach an admin action", () => {
    const r = authorize({ actor: player(), action: "admin.ledger.read", controls: ALL_ON });
    assert.equal(r.decision, Decision.DENY);
    assert.equal(r.reason, "ADMIN_ONLY");
  });

  test("a player cannot act on another player's resources", () => {
    const r = authorize({
      actor: player("alice"), action: "wallet.read",
      resource: { ownerId: "bob" }, controls: ALL_ON,
    });
    assert.equal(r.decision, Decision.DENY);
    assert.equal(r.reason, "NOT_OWNER");
  });

  test("a player may act on their own", () => {
    assert.equal(
      decide({ actor: player("alice"), action: "wallet.read", resource: { ownerId: "alice" } }),
      Decision.ALLOW
    );
  });

  test("withdrawing demands step-up", () => {
    assert.equal(
      decide({ actor: player("alice"), action: "wallet.withdraw", resource: { ownerId: "alice" } }),
      Decision.REQUIRE_STEP_UP
    );
    assert.equal(
      decide({
        actor: player("alice", { stepUpFor: "wallet.withdraw" }),
        action: "wallet.withdraw", resource: { ownerId: "alice" },
      }),
      Decision.ALLOW
    );
  });

  test("being an admin grants no access to another player's own-scope actions", () => {
    // An admin must not be able to withdraw from a user's wallet just by being
    // an admin. Money leaves through admin.* actions, with four eyes, or not
    // at all.
    const r = authorize({
      actor: admin(["SUPER_ADMIN"], { id: "root", stepUpFor: "wallet.withdraw" }),
      action: "wallet.withdraw",
      resource: { ownerId: "alice" },
      controls: ALL_ON,
    });
    assert.equal(r.decision, Decision.DENY);
    assert.equal(r.reason, "NOT_OWNER");
  });
});

describe("system actors", () => {
  test("automation may do deterministic work", () => {
    assert.equal(decide({ actor: { type: "SYSTEM", id: "settler" }, action: "duel.spectate" }),
      Decision.ALLOW);
  });

  test("automation may never perform an action needing a human", () => {
    for (const action of ["admin.withdrawal.approve", "admin.user.close",
                          "admin.fairplay.decide", "wallet.withdraw"]) {
      const r = authorize({ actor: { type: "SYSTEM", id: "worker" }, action, controls: ALL_ON });
      assert.equal(r.decision, Decision.DENY, `${action} must not be automatable`);
      assert.equal(r.reason, "HUMAN_REQUIRED");
    }
  });
});

describe("emergency controls gate everyone", () => {
  test("a disabled control denies the action, admin or not", () => {
    const controls = { ...ALL_ON, WITHDRAWALS: false };
    for (const actor of [player("alice", { stepUpFor: "wallet.withdraw" }),
                         admin(["SUPER_ADMIN"], { stepUpFor: "wallet.withdraw" })]) {
      const r = authorize({
        actor, action: "wallet.withdraw", resource: { ownerId: actor.id }, controls,
      });
      assert.equal(r.decision, Decision.DENY);
      assert.equal(r.reason, "CONTROL_DISABLED");
    }
  });

  test("switches are independent — stopping cash does not stop free play", () => {
    const controls = { ...ALL_ON, CASH_MATCHES: false };
    assert.equal(decide({ actor: player(), action: "duel.play.cash", controls }), Decision.DENY);
    assert.equal(
      authorize({ actor: player(), action: "duel.play.free", controls }).decision,
      Decision.ALLOW
    );
  });

  test("a missing control value fails closed", () => {
    assert.equal(
      authorize({ actor: player(), action: "duel.play.free", controls: {} }).decision,
      Decision.DENY
    );
  });
});

describe("the admin plane in the database", () => {
  async function fresh() {
    const db = await PGlite.create();
    await migrate(db);
    await db.query(
      `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES
       ('root','root@nizalo','Root',TRUE),
       ('fin-1','fin1@nizalo','Finance One',TRUE),
       ('fin-2','fin2@nizalo','Finance Two',TRUE)`
    );
    return db;
  }

  test("nobody grants themselves a role", async () => {
    const db = await fresh();
    await assert.rejects(
      () => db.query(
        `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason)
         VALUES ('root','SUPER_ADMIN','root','bootstrapping myself')`
      ),
      /admin_role_grant_not_self|violates check constraint/
    );
  });

  test("active roles are readable and revocation takes effect", async () => {
    const db = await fresh();
    await db.query(
      `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason)
       VALUES ('fin-1','FINANCE_ADMIN','root','hired')`
    );
    let r = await db.query("SELECT admin_roles('fin-1') AS roles");
    assert.deepEqual(r.rows[0].roles, ["FINANCE_ADMIN"]);

    await db.query("UPDATE admin_role_grant SET revoked_at = now() WHERE admin_id='fin-1'");
    r = await db.query("SELECT admin_roles('fin-1') AS roles");
    assert.deepEqual(r.rows[0].roles, []);
  });

  test("a disabled admin has no roles, whatever the grants say", async () => {
    const db = await fresh();
    await db.query(
      `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason)
       VALUES ('fin-1','FINANCE_ADMIN','root','hired')`
    );
    await db.query("UPDATE admin_user SET disabled_at = now() WHERE id='fin-1'");
    const r = await db.query("SELECT admin_roles('fin-1') AS roles");
    assert.deepEqual(r.rows[0].roles, []);
  });

  test("grant history cannot be deleted", async () => {
    const db = await fresh();
    await db.query(
      `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason)
       VALUES ('fin-1','FINANCE_ADMIN','root','hired')`
    );
    await assert.rejects(
      () => db.query("DELETE FROM admin_role_grant WHERE admin_id='fin-1'"), /append-only/
    );
  });

  test("the database refuses a self-approved request", async () => {
    const db = await fresh();
    await assert.rejects(
      () => db.query(
        `INSERT INTO approval_request
           (id, action, subject_type, subject_id, requested_by, reason, status, decided_by, decided_at)
         VALUES ('ap1','admin.withdrawal.approve','withdrawal','w1','fin-1','urgent',
                 'APPROVED','fin-1', now())`
      ),
      /approval_no_self_approval|violates check constraint/
    );
  });

  test("a second admin may approve", async () => {
    const db = await fresh();
    await db.query(
      `INSERT INTO approval_request
         (id, action, subject_type, subject_id, requested_by, reason, status, decided_by, decided_at)
       VALUES ('ap2','admin.withdrawal.approve','withdrawal','w1','fin-1','payout review',
               'APPROVED','fin-2', now())`
    );
    const r = await db.query("SELECT status, decided_by FROM approval_request WHERE id='ap2'");
    assert.equal(r.rows[0].decided_by, "fin-2");
  });
});

describe("emergency controls in the database", () => {
  async function fresh() {
    const db = await PGlite.create();
    await migrate(db);
    await db.query(
      `INSERT INTO admin_user (id,email,display_name,mfa_enrolled)
       VALUES ('root','root@nizalo','Root',TRUE)`
    );
    return db;
  }

  test("cash and payments are OFF by default", async () => {
    const db = await fresh();
    for (const key of ["CASH_MATCHES", "DEPOSITS", "WITHDRAWALS", "PROMOTIONS"]) {
      const r = await db.query("SELECT control_enabled($1) AS on", [key]);
      assert.equal(r.rows[0].on, false, `${key} must not be on by default`);
    }
    const play = await db.query("SELECT control_enabled('MATCHMAKING') AS on");
    assert.equal(play.rows[0].on, true, "free play is on");
  });

  test("a toggle without a reason is refused", async () => {
    const db = await fresh();
    await assert.rejects(
      () => db.query("UPDATE platform_control SET enabled = TRUE WHERE key='DEPOSITS'"),
      /requires a new reason/
    );
  });

  test("re-using the previous reason is refused", async () => {
    const db = await fresh();
    await assert.rejects(
      () => db.query(
        `UPDATE platform_control SET enabled=TRUE, changed_by='root',
                reason='off until payment integration is production-ready'
          WHERE key='DEPOSITS'`
      ),
      /requires a new reason/
    );
  });

  test("an anonymous toggle is refused", async () => {
    const db = await fresh();
    await assert.rejects(
      () => db.query(
        `UPDATE platform_control SET enabled=TRUE, reason='because' WHERE key='DEPOSITS'`
      ),
      /requires a named actor/
    );
  });

  test("every toggle is recorded", async () => {
    const db = await fresh();
    await db.query(
      `UPDATE platform_control SET enabled=TRUE, changed_by='root',
              reason='sandbox testing enabled' WHERE key='DEPOSITS'`
    );
    const log = await db.query(
      "SELECT key, from_value, to_value, reason FROM platform_control_change"
    );
    assert.equal(log.rows.length, 1);
    assert.deepEqual(
      [log.rows[0].key, log.rows[0].from_value, log.rows[0].to_value],
      ["DEPOSITS", false, true]
    );
    await assert.rejects(
      () => db.query("DELETE FROM platform_control_change"), /append-only/
    );
  });

  test("the global emergency switch stops everything else", async () => {
    const db = await fresh();
    await db.query(
      `UPDATE platform_control SET enabled=TRUE, changed_by='root',
              reason='suspected incident' WHERE key='GLOBAL_EMERGENCY'`
    );
    for (const key of ["MATCHMAKING", "REGISTRATION", "TOURNAMENTS", "WITHDRAWALS"]) {
      const r = await db.query("SELECT control_enabled($1) AS on", [key]);
      assert.equal(r.rows[0].on, false, `${key} must be off under global emergency`);
    }
    const g = await db.query("SELECT control_enabled('GLOBAL_EMERGENCY') AS on");
    assert.equal(g.rows[0].on, true, "the switch itself still reads as engaged");
  });

  test("stopping the world destroys no data", async () => {
    // "Never use shutdown as data destruction" -- the switch gates new actions
    // and touches nothing that already exists.
    //
    // The baseline is measured, not assumed to be zero: migration 0026
    // seeds four fixed VS_COMPUTER bot identities (ai-easy/medium/hard/
    // expert) into `player` as part of the ordinary migrate() a fresh()
    // database already runs, so a fresh instance is never actually
    // player-less. The property this test proves is "nothing already
    // there gets destroyed," which a before/after delta demonstrates
    // exactly as well as an absolute count -- and without coupling this
    // test to how many rows any migration happens to seed.
    const db = await fresh();
    const before = await db.query("SELECT count(*)::int n FROM player");
    await db.query("INSERT INTO player (id, handle) VALUES ('alice','alice')");
    await db.query(
      `UPDATE platform_control SET enabled=TRUE, changed_by='root',
              reason='incident' WHERE key='GLOBAL_EMERGENCY'`
    );
    const after = await db.query("SELECT count(*)::int n FROM player");
    assert.equal(after.rows[0].n, before.rows[0].n + 1, "players survive an emergency stop");
  });
});
