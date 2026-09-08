/**
 * Wire protocol frame validation.
 *
 * Direct unit tests for parseClientFrame, focused on the shape of `intent`.
 * The protocol used to hardcode intent as a string, which is true for chess
 * ("e2e4") but not for Speed Math ({answer: 19}) or any future game with a
 * structured intent -- every real move such a game's client sent was refused
 * before it ever reached the plugin. See the end-to-end Speed Math test for
 * how this was found.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseClientFrame, ErrorCode, ClientMsg } from "../src/protocol.mjs";

const frame = (o) => JSON.stringify(o);

describe("parseClientFrame: intent shape", () => {
  test("a string intent (chess) is accepted", () => {
    const r = parseClientFrame(frame({ t: ClientMsg.INTENT, duelId: "d1", intent: "e2e4" }));
    assert.equal(r.ok, true);
  });

  test("a plain object intent (speed math) is accepted", () => {
    const r = parseClientFrame(frame({ t: ClientMsg.INTENT, duelId: "d1", intent: { answer: 19 } }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.msg.intent, { answer: 19 });
  });

  test("an array intent is refused", () => {
    const r = parseClientFrame(frame({ t: ClientMsg.INTENT, duelId: "d1", intent: [1, 2] }));
    assert.equal(r.ok, false);
    assert.equal(r.code, ErrorCode.BAD_FRAME);
  });

  test("a null intent is refused", () => {
    const r = parseClientFrame(frame({ t: ClientMsg.INTENT, duelId: "d1", intent: null }));
    assert.equal(r.ok, false);
    assert.equal(r.code, ErrorCode.BAD_FRAME);
  });

  test("a bare number or boolean intent is refused", () => {
    for (const bad of [42, true]) {
      const r = parseClientFrame(frame({ t: ClientMsg.INTENT, duelId: "d1", intent: bad }));
      assert.equal(r.ok, false, `intent=${JSON.stringify(bad)} should be refused`);
      assert.equal(r.code, ErrorCode.BAD_FRAME);
    }
  });

  test("token, duelId and as are still string-only", () => {
    const r1 = parseClientFrame(frame({ t: ClientMsg.AUTH, token: { forged: true } }));
    assert.equal(r1.ok, false);
    assert.equal(r1.code, ErrorCode.BAD_FRAME);

    const r2 = parseClientFrame(frame({ t: ClientMsg.JOIN, duelId: { forged: true } }));
    assert.equal(r2.ok, false);
    assert.equal(r2.code, ErrorCode.BAD_FRAME);
  });
});
