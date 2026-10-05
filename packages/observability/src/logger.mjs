/**
 * Structured, redacted, one-JSON-line-per-event logging.
 *
 * Every event is a fact about something that happened, not a free-text
 * message: a stable `event` name from the catalog, a timestamp, the emitting
 * service, and whatever fields describe it -- always redacted before it
 * reaches the sink, never after, so there is no code path that can log
 * first and redact later.
 */
import { redact } from "./redact.mjs";
import { ALL_EVENT_NAMES } from "./events.mjs";

export function createLogger({
  service,
  sink = process.stdout,
  now = () => new Date().toISOString(),
  validateEventNames = true,
} = {}) {
  if (!service) throw new TypeError("createLogger requires a service name");

  function emit(event, fields = {}) {
    if (validateEventNames && !ALL_EVENT_NAMES.has(event)) {
      throw new Error(`unknown event name "${event}" -- add it to observability/src/events.mjs first`);
    }
    const line = {
      ts: now(),
      event,
      service,
      ...redact(fields),
    };
    sink.write(JSON.stringify(line) + "\n");
    return line;
  }

  return {
    emit,
    /** A logger pre-bound to extra fields every event it emits should carry (e.g. a request id). */
    child(bindings) {
      return createLogger({
        service,
        now,
        validateEventNames,
        sink: {
          write: (line) => {
            // `line` is already-serialized JSON from the child's own emit();
            // re-open it once to merge in the parent's bindings rather than
            // asking every call site to remember to spread them in.
            const parsed = JSON.parse(line);
            sink.write(JSON.stringify({ ...parsed, ...redact(bindings) }) + "\n");
          },
        },
      });
    },
  };
}

/** A sink for tests: collects emitted lines instead of writing anywhere. */
export function createCollectingSink() {
  const lines = [];
  return {
    write: (line) => lines.push(JSON.parse(line)),
    lines,
  };
}
