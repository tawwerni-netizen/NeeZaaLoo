import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { canTransition, allowedTransitionsFrom, canReopen, isValidStatus, TICKET_STATUSES } from "../src/state-machine.mjs";

describe("canTransition", () => {
  test("the documented happy path is all valid", () => {
    const path = ["OPEN", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"];
    for (let i = 0; i < path.length - 1; i++) {
      assert.equal(canTransition(path[i], path[i + 1]), true, `${path[i]} -> ${path[i + 1]} should be valid`);
    }
  });

  test("CLOSED is terminal -- nothing transitions out of it, including back to OPEN", () => {
    assert.deepEqual(allowedTransitionsFrom("CLOSED"), []);
    assert.equal(canTransition("CLOSED", "OPEN"), false);
    assert.equal(canTransition("CLOSED", "IN_PROGRESS"), false);
  });

  test("a client cannot skip straight from OPEN to CLOSED", () => {
    assert.equal(canTransition("OPEN", "CLOSED"), false);
  });

  test("a client cannot skip straight from OPEN to IN_PROGRESS", () => {
    assert.equal(canTransition("OPEN", "IN_PROGRESS"), false);
  });

  test("WAITING_FOR_USER only ever returns to IN_PROGRESS", () => {
    assert.deepEqual(allowedTransitionsFrom("WAITING_FOR_USER"), ["IN_PROGRESS"]);
  });

  test("ESCALATED can resume progress or be assigned to the new team", () => {
    assert.equal(canTransition("ESCALATED", "IN_PROGRESS"), true);
    assert.equal(canTransition("ESCALATED", "ASSIGNED"), true);
    assert.equal(canTransition("ESCALATED", "RESOLVED"), false, "an escalated ticket must be picked up before it can resolve");
  });

  test("an unrecognized status has no valid transitions, never throws", () => {
    assert.deepEqual(allowedTransitionsFrom("NOT_A_REAL_STATUS"), []);
    assert.equal(canTransition("NOT_A_REAL_STATUS", "OPEN"), false);
  });

  test("RESOLVED can close or reopen, nothing else", () => {
    assert.deepEqual(allowedTransitionsFrom("RESOLVED").sort(), ["CLOSED", "OPEN"].sort());
  });
});

describe("canReopen", () => {
  test("only RESOLVED tickets can be reopened", () => {
    assert.equal(canReopen("RESOLVED"), true);
    for (const status of TICKET_STATUSES) {
      if (status !== "RESOLVED") assert.equal(canReopen(status), false, `${status} must not be reopenable`);
    }
  });
});

describe("isValidStatus", () => {
  test("recognizes every documented status", () => {
    for (const status of TICKET_STATUSES) assert.equal(isValidStatus(status), true);
  });

  test("rejects garbage", () => {
    assert.equal(isValidStatus("DELETED"), false);
    assert.equal(isValidStatus(""), false);
    assert.equal(isValidStatus(undefined), false);
  });
});
