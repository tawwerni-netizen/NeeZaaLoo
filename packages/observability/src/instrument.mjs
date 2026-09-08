/**
 * Wrap ANY existing service object with latency, call-count and error-rate
 * instrumentation, without touching that service's own source at all.
 *
 * This is deliberately generic rather than hand-added to each of the
 * platform's 15+ service packages: a bespoke `emit()` call threaded through
 * settlement.mjs, payments.mjs, tournament.mjs and the rest would touch
 * financial code that is already correct and already tested, for a purely
 * observational purpose that does not need to live inside the transaction
 * boundary. Wrapping from the outside gets the same "API latency, API
 * errors, worker execution" coverage the phase asks for, for every service,
 * with zero lines changed in any of them.
 *
 * What this CANNOT give you is business-semantic detail ("why did this
 * withdrawal get queued for review rather than auto-approved") -- only that
 * `withdraw()` was called, took 4ms, and either returned or threw. Where
 * that richer detail matters and is cheap to add without risk (the lease
 * manager, the dispatch worker), those files take an explicit optional
 * `emit` instead. Both approaches share the same event catalog and the same
 * metrics registry, so a dashboard does not need to know which one produced
 * a given series.
 */
export function instrument(service, { name, metrics, logger, redactArgs = () => undefined } = {}) {
  if (!name) throw new TypeError("instrument() requires a service `name`");

  const calls = metrics?.counter(`${name}_calls_total`, { help: `calls to ${name} methods` });
  const errors = metrics?.counter(`${name}_errors_total`, { help: `errors from ${name} methods` });
  const duration = metrics?.histogram(`${name}_duration_ms`, { help: `duration of ${name} method calls in ms` });

  const wrapped = {};
  for (const key of Object.keys(service)) {
    const original = service[key];
    if (typeof original !== "function") {
      wrapped[key] = original;
      continue;
    }
    wrapped[key] = async function instrumented(...args) {
      const labels = { method: key };
      calls?.inc(1, labels);
      const startedAt = Date.now();
      try {
        const result = await original.apply(service, args);
        duration?.observe(Date.now() - startedAt, labels);
        return result;
      } catch (err) {
        errors?.inc(1, labels);
        duration?.observe(Date.now() - startedAt, labels);
        logger?.emit("service_call.failed", {
          service: name,
          method: key,
          error: err.message,
          code: err.code ?? null,
          args: redactArgs(key, args),
        });
        throw err;
      }
    };
  }
  return wrapped;
}
