/**
 * The one place this app talks to the real backend (apps/api).
 *
 * No client-side game logic, no client-computed results, no client-supplied
 * ratings or standings -- every one of those is a server-authoritative
 * concept per the platform's own architecture (see docs/architecture). This
 * file only ever does what any HTTP client does: send a request, carry the
 * bearer token, surface what the server said.
 */

export const API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000");

const ACCESS_TOKEN_KEY = "nz_access_token";
const REFRESH_TOKEN_KEY = "nz_refresh_token";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

function setCookie(name: string, value: string, days = 30) {
  if (typeof document === "undefined") return;
  const maxAge = days > 0 ? days * 24 * 60 * 60 : 0;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

function removeCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

export function getTokens() {
  if (typeof window === "undefined") return { accessToken: null, refreshToken: null };
  let accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  let refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);

  // Fallback to cookie if localStorage is empty
  if (!accessToken) {
    accessToken = getCookie(ACCESS_TOKEN_KEY);
    if (accessToken) window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  }
  if (!refreshToken) {
    refreshToken = getCookie(REFRESH_TOKEN_KEY);
    if (refreshToken) window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }

  return {
    accessToken,
    refreshToken,
  };
}

export function setTokens(accessToken: string, refreshToken: string, remember: boolean = true) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  // Persist into cookie for navigation resilience and 30-day "Stay logged in"
  const days = remember ? 30 : 1;
  setCookie(ACCESS_TOKEN_KEY, accessToken, days);
  setCookie(REFRESH_TOKEN_KEY, refreshToken, days);
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  removeCookie(ACCESS_TOKEN_KEY);
  removeCookie(REFRESH_TOKEN_KEY);
  removeCookie("nz_user_email");
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

/**
 * Step-up re-authentication, handled once for the whole admin surface.
 *
 * Privileged admin actions (granting a role, confiscating a balance,
 * toggling cash play on a game) are gated by the backend on a step-up
 * token: a five-minute, single-action token minted from the admin's
 * password (plus TOTP when enrolled). Without a client that can mint one,
 * every such button simply fails with a 401 -- which is exactly how the
 * protection came to be stripped off those actions once before, rather
 * than the flow being implemented.
 *
 * So it lives here instead of in each page: any request refused with
 * STEP_UP_REQUIRED asks the registered prompt for a password, mints a
 * token for the action the server named, and retries the original request
 * once. Tokens are cached in memory per action for their remaining life,
 * so a run of admin actions costs one prompt, not one per click.
 */
type StepUpPrompt = (action: string) => Promise<{ password: string; totpCode?: string | undefined } | null>;

let stepUpPrompt: StepUpPrompt | null = null;
const stepUpTokens = new Map<string, { token: string; expiresAt: number }>();

/** Registered once by the admin shell (see components/admin/StepUpProvider). */
export function setStepUpPrompt(prompt: StepUpPrompt | null) {
  stepUpPrompt = prompt;
}

export function clearStepUpTokens() {
  stepUpTokens.clear();
}

function cachedStepUpToken(action: string): string | null {
  const hit = stepUpTokens.get(action);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    stepUpTokens.delete(action);
    return null;
  }
  return hit.token;
}

async function mintStepUpToken(action: string): Promise<string | null> {
  if (!stepUpPrompt) return null;
  const answer = await stepUpPrompt(action);
  if (!answer) return null;
  const res = await rawRequest("POST", "/v1/auth/step-up", {
    body: { action, password: answer.password, totpCode: answer.totpCode || undefined },
    noRefresh: true,
  });
  if (!res.ok) throw new ApiError(res.status, res.body);
  const token = (res.body as { stepUpToken?: string } | null)?.stepUpToken;
  if (!token) return null;
  // The backend issues these for five minutes; expire ours a little early so
  // a token never dies mid-flight on a slow request.
  stepUpTokens.set(action, { token, expiresAt: Date.now() + 4 * 60 * 1000 });
  return token;
}

function stepUpActionFrom(body: unknown): string | null {
  const err = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : null;
  if (typeof err !== "object" || err === null) return null;
  const { code, detail } = err as { code?: unknown; detail?: unknown };
  if (String(code) !== "STEP_UP_REQUIRED") return null;
  return typeof detail === "string" && detail.length > 0 ? detail : null;
}

export async function api<T = unknown>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  let res = await rawRequest(method, path, options);

  if (res.status === 401 && !options.noRefresh && getTokens().refreshToken) {
    const stepUpAction = stepUpActionFrom(res.body);
    if (stepUpAction) {
      // An expired SESSION and a missing STEP-UP token both surface as 401.
      // Only the latter names an action, so only the latter is retried this
      // way -- a session refresh here would prompt for nothing and fail.
      const token = cachedStepUpToken(stepUpAction) ?? (options.stepUpToken ? null : await mintStepUpToken(stepUpAction));
      if (token) res = await rawRequest(method, path, { ...options, stepUpToken: token });
    } else {
      const refreshed = await ensureFreshSession();
      if (refreshed) res = await rawRequest(method, path, options);
    }
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
