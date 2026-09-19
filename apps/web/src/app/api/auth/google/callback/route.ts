import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const code = searchParams.get("code");
  const stateStr = searchParams.get("state");

  // Determine true public origin behind reverse proxies (Hostinger, Cloudflare, Nginx)
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");

  const origin =
    process.env.APP_BASE_URL ||
    (host.startsWith("0.0.0.0") ? "https://nizalo.com" : `${proto}://${host}`);

  let locale = "ar";
  try {
    if (stateStr) {
      const parsed = JSON.parse(decodeURIComponent(stateStr));
      if (parsed.locale) locale = parsed.locale;
    }
  } catch {
    // Keep default locale
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/${locale}/login?error=cancelled`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${origin}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    console.error("Missing Google OAuth credentials in environment");
    return NextResponse.redirect(`${origin}/${locale}/login?error=missing_credentials`);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Google Token Exchange Error:", tokenData);
      return NextResponse.redirect(`${origin}/${locale}/login?error=token_exchange_failed`);
    }

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    if (!profile.email) {
      return NextResponse.redirect(`${origin}/${locale}/login?error=email_not_provided`);
    }

    const syncPayload = JSON.stringify({
      email: profile.email,
      subject: profile.id || profile.sub,
      name: profile.name,
    });

    const candidates = [
      process.env.API_INTERNAL_URL || "http://127.0.0.1:4000",
      "http://localhost:4000",
      "http://127.0.0.1:3000",
      "http://localhost:3000",
      origin,
    ].filter(Boolean);

    let syncRes: Response | null = null;
    let lastError: any = null;

    for (const base of candidates) {
      try {
        const candidateRes = await fetch(`${base}/v1/auth/google/sync-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: syncPayload,
          signal: AbortSignal.timeout(8000),
        });
        if (candidateRes.ok) {
          syncRes = candidateRes;
          break;
        } else {
          lastError = `Status ${candidateRes.status} from ${base}`;
        }
      } catch (err: any) {
        lastError = err?.message || err;
      }
    }

    if (!syncRes || !syncRes.ok) {
      console.error("[Google Callback] All sync targets failed. Last error:", lastError);
      const code = syncRes?.status ? `sync_failed_${syncRes.status}` : "sync_failed";
      return NextResponse.redirect(`${origin}/${locale}/login?error=${code}`);
    }

    const sessionData = await syncRes.json();
    const accessToken = sessionData.accessToken;
    const refreshToken = sessionData.refreshToken;

    const targetUrl = `${origin}/${locale}/auth/google/complete?outcome=session_direct&access=${encodeURIComponent(accessToken)}&refresh=${encodeURIComponent(refreshToken)}`;
    const response = NextResponse.redirect(targetUrl);

    // Set persistent auth cookies for 30 days
    const maxAge = 60 * 60 * 24 * 30; // 30 days
    response.cookies.set("nz_access_token", accessToken, {
      path: "/",
      maxAge,
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    response.cookies.set("nz_refresh_token", refreshToken, {
      path: "/",
      maxAge,
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    response.cookies.set("nz_user_email", profile.email, {
      path: "/",
      maxAge,
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return response;
  } catch (error) {
    console.error("Google Auth Exception:", error);
    return NextResponse.redirect(`${origin}/${locale}/login?error=server_error`);
  }
}
