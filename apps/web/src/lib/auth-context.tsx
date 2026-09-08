"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { get, post, patch, getTokens, setTokens, clearTokens, ApiError } from "./api";
import { useI18n } from "./i18n/context";
import type { SupportedLocale } from "./i18n/locale";
import { LOCALE_COOKIE, LOCALE_EXPLICIT_COOKIE, LOCALE_COOKIE_MAX_AGE_S } from "./i18n/constants";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

type Player = { id: string; handle: string; locale: SupportedLocale; created_at: string };

type AuthState = {
  player: Player | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  register: (handle: string, password: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  logout: () => Promise<void>;
  /** Saves a language preference to the signed-in player's account (PATCH /v1/me). */
  setLocale: (locale: SupportedLocale) => Promise<void>;
  /**
   * Adopts a session this component did not itself mint -- the one case
   * today is the Google OAuth callback page, which already has a real
   * accessToken/refreshToken from POST /v1/auth/google/finalize and just
   * needs the rest of the app to recognise it, exactly the way login()'s
   * own last two steps do. Not a second session mechanism: same tokens,
   * same storage, same /v1/me refresh.
   */
  applySession: (accessToken: string, refreshToken: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const { locale: activeLocale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  const refreshPlayer = useCallback(async () => {
    const { accessToken } = getTokens();
    if (!accessToken) {
      setPlayer(null);
      setLoading(false);
      return;
    }
    try {
      const me = await get<Player>("/v1/me");
      setPlayer(me);
    } catch {
      clearTokens();
      setPlayer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPlayer();
  }, [refreshPlayer]);

  // The one place the "saved account preference" tier of the locale
  // resolution order (packages/i18n/src/resolve.mjs) gets applied: this app
  // keeps its auth token in localStorage rather than a cookie, so
  // middleware.ts -- which decides the locale for the very first response,
  // before any of this has run -- can only ever see a device-locale guess
  // or an explicit past choice, never a signed-in player's saved
  // preference. Once we know who they are, correct course exactly once: if
  // the page landed on a locale nobody actually chose in this browser (no
  // LOCALE_EXPLICIT_COOKIE) and it does not match what they saved, move
  // them to their saved locale and remember it, so every later request
  // resolves correctly at the edge with no further redirect.
  useEffect(() => {
    if (!player) return;
    if (player.locale === activeLocale) return;
    if (readCookie(LOCALE_EXPLICIT_COOKIE)) return;
    document.cookie = `${LOCALE_COOKIE}=${player.locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_S}; samesite=lax`;
    const rest = pathname.split("/").slice(2).join("/");
    router.replace(`/${player.locale}/${rest}`);
  }, [player, activeLocale, pathname, router]);

  const login = useCallback(async (identifier: string, password: string) => {
    try {
      const r = await post<{ playerId: string; accessToken: string; refreshToken: string }>(
        "/v1/auth/login", { identifier, password }, { noRefresh: true }
      );
      setTokens(r.accessToken, r.refreshToken);
      await refreshPlayer();
      return { ok: true as const };
    } catch (e) {
      const reason = e instanceof ApiError ? (e.code ?? "LOGIN_FAILED") : "NETWORK_ERROR";
      return { ok: false as const, reason };
    }
  }, [refreshPlayer]);

  const register = useCallback(async (handle: string, password: string) => {
    try {
      await post("/v1/auth/register", { handle, password }, { noRefresh: true });
      return login(handle, password);
    } catch (e) {
      const reason = e instanceof ApiError ? (e.code ?? "REGISTER_FAILED") : "NETWORK_ERROR";
      return { ok: false as const, reason };
    }
  }, [login]);

  const logout = useCallback(async () => {
    const { refreshToken } = getTokens();
    try {
      await post("/v1/auth/logout", { refreshToken }, { noRefresh: true });
    } catch {
      // A failed revoke call must not trap the user in a "logged in" state
      // client-side -- clear local tokens regardless.
    }
    clearTokens();
    setPlayer(null);
  }, []);

  const applySession = useCallback(async (accessToken: string, refreshToken: string) => {
    setTokens(accessToken, refreshToken);
    await refreshPlayer();
  }, [refreshPlayer]);

  const setLocale = useCallback(async (locale: SupportedLocale) => {
    try {
      const updated = await patch<Player>("/v1/me", { locale });
      setPlayer(updated);
    } catch {
      // The language switcher already navigated the visitor to the new
      // locale regardless -- a failed save just means it will not be
      // remembered as their account preference next time.
    }
  }, []);

  return (
    <AuthContext.Provider value={{ player, loading, login, register, logout, setLocale, applySession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
