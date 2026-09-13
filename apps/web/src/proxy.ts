import { NextResponse, type NextRequest } from "next/server";
import { SUPPORTED_LOCALE_CODES, resolveLocale } from "@/lib/i18n/locale";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_S } from "@/lib/i18n/constants";

/**
 * Locale routing for every page. Runs before Next's own router, on every
 * request that is not a static asset or an internal Next path.
 *
 * The full resolution order (explicit choice > saved account preference >
 * device locale > English, see packages/i18n/src/resolve.mjs) only
 * partially lives here: this app keeps auth tokens in localStorage, not a
 * cookie, so middleware -- which only ever sees cookies and headers -- has
 * no way to know a visitor is signed in or what they saved as their
 * account preference. What it CAN resolve correctly is "explicit choice
 * (the nz_locale cookie, set once the language switcher is used) beats
 * device locale beats English". The remaining tier -- a signed-in player's
 * saved preference overriding a first-time device-locale guess -- is
 * applied client-side once auth-context.tsx has fetched /v1/me (see the
 * comment there), which then also writes this same cookie so every later
 * request resolves correctly right here, with no further client redirect.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const alreadyLocalized = SUPPORTED_LOCALE_CODES.some(
    (code) => pathname === `/${code}` || pathname.startsWith(`/${code}/`)
  );
  if (alreadyLocalized) return NextResponse.next();

  const isAsset = /\.[^/]+$/.test(pathname) || pathname.startsWith("/_next");
  if (isAsset) return NextResponse.next();

  if (pathname.startsWith("/v1")) return NextResponse.next();

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value ?? null;
  const locale = resolveLocale({
    explicit: cookieLocale,
    acceptLanguage: request.headers.get("accept-language"),
  });

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  const response = NextResponse.redirect(url);
  if (!cookieLocale) {
    // Remember the device-derived locale too, so a reload of "/" resolves
    // straight to the same place without re-parsing Accept-Language --
    // this is a cache of the *result*, not an "explicit choice": the
    // client-side account-preference correction (see above) still treats
    // it as overridable, never as if the visitor had picked it themselves.
    response.cookies.set(LOCALE_COOKIE, locale, { maxAge: LOCALE_COOKIE_MAX_AGE_S, path: "/", sameSite: "lax" });
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|v1|_next/static|_next/image|favicon.ico).*)"],
};
