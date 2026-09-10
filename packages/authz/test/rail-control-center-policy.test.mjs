/**
 * The Admin Payment & Stablecoin Control Center's own two new actions --
 * admin.rail.read/admin.rail.manage -- against the SAME authorize() engine
 * every other admin action goes through. Nothing new is invented here; this
 * is proof that the new capabilities actually landed in the grid correctly,
 * covering exactly the two failure modes the Control Center's own test list
 * names: an unauthorized change, and a step-up failure.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { authorize, Decision, capabilitiesFor } from "../src/policy.mjs";

function admin(roles, overrides = {}) {
  return { type: "ADMIN", id: "adm-1", roles, mfaEnrolled: true, disabled: false, ...overrides };
}

describe("UNAUTHORIZED CHANGE: a role without rail.manage cannot touch a rail", () => {
  test("SUPPORT cannot manage a rail", () => {
    const decision = authorize({ actor: admin(["SUPPORT"]), action: "admin.rail.manage" });
    assert.equal(decision.decision, Decision.DENY);
    assert.equal(decision.reason, "MISSING_CAPABILITY");
  });

  test("RISK_ADMIN can SEE a rail (rail.read) but cannot manage it", () => {
    const canRead = authorize({ actor: admin(["RISK_ADMIN"]), action: "admin.rail.read" });
    assert.equal(canRead.decision, Decision.ALLOW);
    const canManage = authorize({ actor: admin(["RISK_ADMIN"]), action: "admin.rail.manage" });
    assert.equal(canManage.decision, Decision.DENY);
  });

  test("ANALYST and READ_ONLY can see rails and controls, but hold no capability that changes either", () => {
    for (const role of ["ANALYST", "READ_ONLY"]) {
      const caps = capabilitiesFor([role]);
      assert.equal(caps.has("rail.read"), true, `${role} should see the control center`);
      assert.equal(caps.has("control.read"), true, `${role} should see global switches`);
      assert.equal(caps.has("rail.manage"), false, `${role} must not be able to change a rail`);
      assert.equal(caps.has("control.toggle"), false, `${role} must not be able to flip a global switch`);
    }
  });

  test("only FINANCE_ADMIN and SUPER_ADMIN can manage a rail", () => {
    const holders = Object.entries(
      Object.fromEntries(["SUPER_ADMIN", "ADMIN", "FINANCE_ADMIN", "RISK_ADMIN", "ANALYST", "READ_ONLY", "SUPPORT"]
        .map((r) => [r, capabilitiesFor([r]).has("rail.manage")]))
    ).filter(([, has]) => has).map(([r]) => r).sort();
    assert.deepEqual(holders, ["FINANCE_ADMIN", "SUPER_ADMIN"]);
  });

  test("a player, however privileged their own account, cannot reach an admin rail action", () => {
    const decision = authorize({ actor: { type: "PLAYER", id: "p1" }, action: "admin.rail.manage" });
    assert.equal(decision.decision, Decision.DENY);
    assert.equal(decision.reason, "ADMIN_ONLY");
  });

  test("an admin without MFA enrolled holds no rail privileges at all, capability or not", () => {
    const decision = authorize({ actor: admin(["SUPER_ADMIN"], { mfaEnrolled: false }), action: "admin.rail.manage" });
    assert.equal(decision.decision, Decision.DENY);
    assert.equal(decision.reason, "MFA_REQUIRED");
  });

  test("a disabled admin account cannot manage a rail even with the right role", () => {
    const decision = authorize({ actor: admin(["FINANCE_ADMIN"], { disabled: true }), action: "admin.rail.manage" });
    assert.equal(decision.decision, Decision.DENY);
    assert.equal(decision.reason, "ACCOUNT_DISABLED");
  });
});

describe("STEP-UP FAILURE: rail.manage demands step-up even from a fully-capable admin", () => {
  test("a FINANCE_ADMIN with the capability but no step-up is told to step up, not denied outright", () => {
    const decision = authorize({ actor: admin(["FINANCE_ADMIN"]), action: "admin.rail.manage" });
    assert.equal(decision.decision, Decision.REQUIRE_STEP_UP);
  });

  test("a step-up completed for a DIFFERENT action does not carry over to admin.rail.manage", () => {
    const decision = authorize({
      actor: admin(["FINANCE_ADMIN"], { stepUpFor: "admin.withdrawal.approve" }),
      action: "admin.rail.manage",
    });
    assert.equal(decision.decision, Decision.REQUIRE_STEP_UP);
  });

  test("step-up completed for admin.rail.manage itself unlocks it", () => {
    const decision = authorize({
      actor: admin(["FINANCE_ADMIN"], { stepUpFor: "admin.rail.manage" }),
      action: "admin.rail.manage",
    });
    assert.equal(decision.decision, Decision.ALLOW);
  });

  test("admin.rail.read and admin.control.read need no step-up -- pure visibility is not a sensitive action", () => {
    assert.equal(authorize({ actor: admin(["READ_ONLY"]), action: "admin.rail.read" }).decision, Decision.ALLOW);
    assert.equal(authorize({ actor: admin(["READ_ONLY"]), action: "admin.control.read" }).decision, Decision.ALLOW);
  });

  test("GLOBAL PAUSE (admin.control.toggle) also demands step-up, unchanged by this feature", () => {
    const decision = authorize({ actor: admin(["ADMIN"]), action: "admin.control.toggle" });
    assert.equal(decision.decision, Decision.REQUIRE_STEP_UP);
  });
});
