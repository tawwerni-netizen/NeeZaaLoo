/**
 * The one place this app talks to the real backend (apps/api).
 *
 * No client-side game logic, no client-computed results, no client-supplied
 * ratings or standings -- every one of those is a server-authoritative
 * concept per the platform's own architecture (see docs/architecture). This
 * file only ever does what any HTTP client does: send a request, carry the
 * bearer token, surface what the server said.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const ACCESS_TOKEN_KEY = "nz_access_token";
const REFRESH_TOKEN_KEY = "nz_refresh_token";

export function getTokens() {
  if (typeof window === "undefined") return { accessToken: null, refreshToken: null };
  return {
    accessToken: window.localStorage.getItem(ACCESS_TOKEN_KEY),
    refreshToken: window.localStorage.getItem(REFRESH_TOKEN_KEY),
  };
}

export function setTokens(accessToken: string, refreshToken: string) {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string | undefined;
  // The backend's errorBody() second argument -- e.g. { existingTicketId }
  // on a support-ticket DUPLICATE_OPEN_TICKET response. Most callers never
  // read this; it exists for the rare case where the code alone is not
  // enough to render a useful next step (see support/new/page.tsx).
  detail: unknown;
  constructor(status: number, body: unknown) {
    // The backend's errorBody() (packages/api/src/router.mjs) always shapes
    // a failure as `{ error: { code, detail? } }` -- code is a nested
    // field, not the error value itself. Reading it directly, rather than
    // stringifying the whole `error` object, is what lets authErrorKey()
    // actually resolve a specific translated message instead of silently
    // falling back to the generic one on every request.
    const errorField = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
    const code = typeof errorField === "object" && errorField !== null && "code" in errorField
      ? String((errorField as { code?: unknown }).code)
      : undefined;
    super(code ?? `request failed with status ${status}`);
    this.status = status;
    this.code = code;
    this.detail = typeof errorField === "object" && errorField !== null && "detail" in errorField
      ? (errorField as { detail?: unknown }).detail
      : undefined;
  }
}

type RequestOptions = {
  body?: unknown;
  stepUpToken?: string;
  /** Skip the automatic refresh-and-retry on a 401 (used by refresh itself, to avoid recursion). */
  noRefresh?: boolean;
};

async function rawRequest(method: string, path: string, options: RequestOptions = {}) {
  const { accessToken } = getTokens();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (options.stepUpToken) headers["x-step-up-token"] = options.stepUpToken;

  const init: RequestInit = { method, headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  const res = await fetch(`${API_BASE}${path}`, init);
  let json: unknown = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json, ok: res.ok };
}

/**
 * A single, one-shot refresh attempt shared across concurrent 401s, so a
 * page firing several requests at once does not race the SAME refresh
 * token through /v1/auth/refresh multiple times (the backend's refresh
 * rotation treats a reused token as theft and burns the whole session
 * family -- see packages/auth's own tests for exactly why that guard
 * exists, and why a naive per-request refresh would trip it).
 */
let refreshInFlight: Promise<boolean> | null = null;

async function ensureFreshSession(): Promise<boolean> {
  const { refreshToken } = getTokens();
  if (!refreshToken) return false;
  if (!refreshInFlight) {
    refreshInFlight = rawRequest("POST", "/v1/auth/refresh", { body: { refreshToken }, noRefresh: true })
      .then((res) => {
        if (res.ok && res.body && typeof res.body === "object") {
          const { accessToken, refreshToken: newRefresh } = res.body as { accessToken: string; refreshToken: string };
          setTokens(accessToken, newRefresh);
          return true;
        }
        clearTokens();
        return false;
      })
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function api<T = unknown>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  let res = await rawRequest(method, path, options);
  if (res.status === 401 && !options.noRefresh && getTokens().refreshToken) {
    const refreshed = await ensureFreshSession();
    if (refreshed) res = await rawRequest(method, path, options);
  }
  if (!res.ok) throw new ApiError(res.status, res.body);
  return res.body as T;
}

export const get = <T = unknown>(path: string) => api<T>("GET", path);
export const post = <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
  api<T>("POST", path, { ...options, body });
export const patch = <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
  api<T>("PATCH", path, { ...options, body });
export const del = <T = unknown>(path: string, options?: RequestOptions) =>
  api<T>("DELETE", path, options);
