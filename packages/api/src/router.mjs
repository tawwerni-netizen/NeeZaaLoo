/**
 * A small HTTP router.
 *
 * Hand-written rather than pulled in, for the same reason the OTP code is: this
 * sits in front of every authenticated surface, and a routing library is a
 * large amount of code with a large amount of trust for a job that is a hundred
 * lines. There is no path-to-regex parsing of user input beyond splitting on
 * "/", which removes an entire class of ReDoS and path-confusion bugs.
 */

export const MAX_BODY_BYTES = 64 * 1024;

/**
 * Compile a route table. Paths look like "/v1/players/:id".
 * Matching is exact on segment count -- no prefix matching, no wildcards, and
 * therefore no way for "/v1/admin/x" to be served by a route meant for "/v1/x".
 */
export function compileRoutes(routes) {
  return routes.map((r) => {
    const segments = r.path.split("/").filter(Boolean);
    return {
      ...r,
      segments,
      params: segments.filter((s) => s.startsWith(":")).map((s) => s.slice(1)),
    };
  });
}

export function matchRoute(compiled, method, pathname) {
  const parts = pathname.split("/").filter(Boolean);
  let pathMatched = false;

  for (const route of compiled) {
    if (route.segments.length !== parts.length) continue;

    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      const seg = route.segments[i];
      if (seg.startsWith(":")) {
        // A path parameter may not be empty and may not smuggle a separator.
        if (!parts[i] || parts[i].includes("%2F")) { ok = false; break; }
        params[seg.slice(1)] = decodeURIComponent(parts[i]);
      } else if (seg !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    pathMatched = true;
    if (route.method === method) return { route, params };
  }

  // Distinguishing 405 from 404 is a real usability gain and leaks nothing: the
  // path was already guessable by whoever asked for it.
  return pathMatched ? { methodNotAllowed: true } : null;
}

/** Read a JSON body with a hard size cap, refusing anything unparseable. */
export async function readJsonBody(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  const type = (req.headers["content-type"] ?? "").split(";")[0].trim();
  if (type && type !== "application/json") {
    return { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" };
  }

  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > maxBytes) return { ok: false, code: "PAYLOAD_TOO_LARGE" };

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    // Checked as it streams, not just against the declared header, which a
    // client controls and can lie about.
    if (total > maxBytes) return { ok: false, code: "PAYLOAD_TOO_LARGE" };
    chunks.push(chunk);
  }
  if (total === 0) return { ok: true, body: {} };

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, code: "BAD_REQUEST" };
    }
    return { ok: true, body: parsed };
  } catch {
    return { ok: false, code: "BAD_REQUEST" };
  }
}

/**
 * Headers applied to every response.
 *
 * The API serves JSON to programs, never markup to browsers, so the policy can
 * be maximally restrictive: nothing may be framed, nothing may be sniffed, and
 * no referrer leaks a resource id to a third party.
 */
export const SECURITY_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "permissions-policy": "geolocation=(), camera=(), microphone=()",
};

export function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { ...SECURITY_HEADERS, ...extraHeaders });
  res.end(body);
}

/**
 * A client-safe error.
 *
 * `code` is a stable string a client can branch on. `detail` is optional and
 * must never contain a stack, a SQL fragment, or an internal identifier -- the
 * server logs those, the client is not told them.
 */
export const errorBody = (code, detail) => (detail ? { error: { code, detail } } : { error: { code } });
