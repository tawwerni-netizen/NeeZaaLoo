import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createLogger, createCollectingSink } from "../src/logger.mjs";
import { Events } from "../src/events.mjs";

describe("createLogger", () => {
  test("emits one JSON line per event, carrying ts/event/service plus fields", () => {
    const sink = createCollectingSink();
    const log = createLogger({ service: "matchmaking", sink });
    log.emit(Events.MATCHMAKING.PAIRED, { duelId: "d1", gameId: "chess" });

    assert.equal(sink.lines.length, 1);
    const line = sink.lines[0];
    assert.equal(line.event, Events.MATCHMAKING.PAIRED);
    assert.equal(line.service, "matchmaking");
    assert.equal(line.duelId, "d1");
    assert.ok(line.ts);
  });

  test("fields are redacted before they ever reach the sink", () => {
    const sink = createCollectingSink();
    const log = createLogger({ service: "auth", sink });
    log.emit(Events.AUTH.LOGIN_SUCCESS, { handle: "alice", password: "should-never-appear" });
    assert.equal(sink.lines[0].password, "[REDACTED]");
  });

  test("an unknown event name is refused, not silently accepted -- the catalog is the source of truth", () => {
    const sink = createCollectingSink();
    const log = createLogger({ service: "auth", sink });
    assert.throws(() => log.emit("auth.made_up_event_that_is_not_in_the_catalog", {}), /unknown event name/);
    assert.equal(sink.lines.length, 0);
  });

  test("createLogger requires a service name -- an anonymous event stream is not useful", () => {
    assert.throws(() => createLogger({}), TypeError);
  });

  test("child() merges extra bindings into every event it emits, on top of redaction", () => {
    const sink = createCollectingSink();
    const log = createLogger({ service: "api", sink });
    const withRequest = log.child({ requestId: "req-1", secret: "nope" });
    withRequest.emit(Events.API.REQUEST_COMPLETED, { path: "/v1/x" });

    const line = sink.lines[0];
    assert.equal(line.requestId, "req-1");
    assert.equal(line.secret, "[REDACTED]", "bindings are redacted too, not just per-call fields");
    assert.equal(line.path, "/v1/x");
    assert.equal(line.service, "api");
  });

  test("validateEventNames can be turned off for a caller that intentionally emits ad hoc diagnostic names", () => {
    const sink = createCollectingSink();
    const log = createLogger({ service: "debug", sink, validateEventNames: false });
    assert.doesNotThrow(() => log.emit("debug.anything", {}));
  });
});
