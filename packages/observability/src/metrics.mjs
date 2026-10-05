/**
 * A minimal, dependency-free metrics registry.
 *
 * No client library is pulled in: the platform has no metrics backend
 * deployed yet (there is no production bootstrap process at all -- see
 * RISK_REGISTER item 18), so committing to a specific client now would be
 * guessing at infrastructure that does not exist. What every backend
 * eventually agrees on is the Prometheus text exposition format, so that is
 * the one thing this module produces; wiring `renderPrometheus()` behind a
 * real `/metrics` HTTP route is a five-line addition whenever a real
 * scraper exists, not a decision that needs to be made now.
 */
function labelKey(labels) {
  if (!labels || Object.keys(labels).length === 0) return "";
  return Object.keys(labels).sort().map((k) => `${k}="${String(labels[k]).replace(/"/g, '\\"')}"`).join(",");
}

export function createMetricsRegistry() {
  /** name -> { type, help, series: Map<labelKey, number|number[]> } */
  const metrics = new Map();

  function ensure(name, type, help) {
    let m = metrics.get(name);
    if (!m) {
      m = { type, help, series: new Map() };
      metrics.set(name, m);
    } else if (m.type !== type) {
      throw new TypeError(`metric ${name} already registered as ${m.type}, not ${type}`);
    }
    return m;
  }

  return {
    counter(name, { help = "" } = {}) {
      const m = ensure(name, "counter", help);
      return {
        inc(value = 1, labels = {}) {
          if (value < 0) throw new RangeError("a counter cannot decrease");
          const key = labelKey(labels);
          m.series.set(key, (m.series.get(key) ?? 0) + value);
        },
      };
    },

    gauge(name, { help = "" } = {}) {
      const m = ensure(name, "gauge", help);
      return {
        set(value, labels = {}) { m.series.set(labelKey(labels), value); },
        inc(value = 1, labels = {}) { m.series.set(labelKey(labels), (m.series.get(labelKey(labels)) ?? 0) + value); },
        dec(value = 1, labels = {}) { m.series.set(labelKey(labels), (m.series.get(labelKey(labels)) ?? 0) - value); },
      };
    },

    /** Bucketed histogram, Prometheus-shaped: cumulative `le` buckets plus `_sum`/`_count`. */
    histogram(name, { buckets = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000], help = "" } = {}) {
      const m = ensure(name, "histogram", help);
      m.buckets = buckets;
      return {
        observe(value, labels = {}) {
          const key = labelKey(labels);
          let h = m.series.get(key);
          if (!h) {
            h = { sum: 0, count: 0, bucketCounts: new Array(buckets.length).fill(0) };
            m.series.set(key, h);
          }
          h.sum += value;
          h.count += 1;
          for (let i = 0; i < buckets.length; i++) {
            if (value <= buckets[i]) h.bucketCounts[i] += 1;
          }
        },
      };
    },

    /** A structured snapshot, for tests -- easier to assert on than parsing text back out. */
    snapshot() {
      const out = {};
      for (const [name, m] of metrics) {
        out[name] = { type: m.type, series: Object.fromEntries(m.series) };
      }
      return out;
    },

    renderPrometheus() {
      const lines = [];
      for (const [name, m] of metrics) {
        if (m.help) lines.push(`# HELP ${name} ${m.help}`);
        lines.push(`# TYPE ${name} ${m.type}`);
        for (const [lk, value] of m.series) {
          if (m.type === "histogram") {
            const h = value;
            for (let i = 0; i < m.buckets.length; i++) {
              const bucketLabels = lk ? `${lk},le="${m.buckets[i]}"` : `le="${m.buckets[i]}"`;
              lines.push(`${name}_bucket{${bucketLabels}} ${h.bucketCounts[i]}`);
            }
            const infLabels = lk ? `${lk},le="+Inf"` : `le="+Inf"`;
            lines.push(`${name}_bucket{${infLabels}} ${h.count}`);
            lines.push(`${name}_sum${lk ? `{${lk}}` : ""} ${h.sum}`);
            lines.push(`${name}_count${lk ? `{${lk}}` : ""} ${h.count}`);
          } else {
            lines.push(`${lk ? `${name}{${lk}}` : name} ${value}`);
          }
        }
      }
      return lines.join("\n") + "\n";
    },
  };
}
