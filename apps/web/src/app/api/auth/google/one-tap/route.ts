import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const credential = body?.credential;

    if (!credential || typeof credential !== "string") {
      return NextResponse.json({ ok: false, error: "MISSING_CREDENTIAL" }, { status: 400 });
    }

    // Decode JWT payload (Google ID Token)
    const parts = credential.split(".");
    if (parts.length < 2) {
      return NextResponse.json({ ok: false, error: "MALFORMED_TOKEN" }, { status: 400 });
    }

    const rawPayload = parts[1];
    if (!rawPayload) {
      return NextResponse.json({ ok: false, error: "MALFORMED_TOKEN" }, { status: 400 });
    }

    let payload: any;
    try {
      const base64 = rawPayload.replace(/-/g, "+").replace(/_/g, "/");
      const json = Buffer.from(base64, "base64").toString("utf8");
      payload = JSON.parse(json);
    } catch {
      return NextResponse.json({ ok: false, error: "TOKEN_PARSE_ERROR" }, { status: 400 });
    }

    if (!payload?.email) {
      return NextResponse.json({ ok: false, error: "EMAIL_MISSING" }, { status: 400 });
    }

    // Forward to backend sync-session
    const apiTarget = process.env.API_INTERNAL_URL || "http://127.0.0.1:4000";
    let syncRes = await fetch(`${apiTarget}/v1/auth/google/sync-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: payload.email,
        subject: payload.sub || payload.id,
        name: payload.name || payload.given_name || payload.email.split("@")[0],
      }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);

    if (!syncRes || !syncRes.ok) {
      const origin = request.nextUrl.origin;
      syncRes = await fetch(`${origin}/v1/auth/google/sync-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: payload.email,
          subject: payload.sub || payload.id,
          name: payload.name || payload.given_name || payload.email.split("@")[0],
        }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
    }

    if (!syncRes || !syncRes.ok) {
      const errText = syncRes ? await syncRes.text() : "No response from backend";
      console.error("[OneTap] sync-session error:", errText);
      return NextResponse.json({ ok: false, error: "SYNC_SESSION_FAILED" }, { status: 502 });
    }

    const sessionData = await syncRes.json();
    const { accessToken, refreshToken, playerId } = sessionData;

    const response = NextResponse.json({
      ok: true,
      accessToken,
      refreshToken,
      playerId,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    });

    // Set 30-day session cookies
    const maxAge = 60 * 60 * 24 * 30;
    const isProd = process.env.NODE_ENV === "production";

    response.cookies.set("nz_access_token", accessToken, {
      path: "/",
      maxAge,
      httpOnly: false,
      secure: isProd,
      sameSite: "lax",
    });

    response.cookies.set("nz_refresh_token", refreshToken, {
      path: "/",
      maxAge,
      httpOnly: false,
      secure: isProd,
      sameSite: "lax",
    });

    response.cookies.set("nz_user_email", payload.email, {
      path: "/",
      maxAge,
      httpOnly: false,
      secure: isProd,
      sameSite: "lax",
    });

    return response;
  } catch (error: any) {
    console.error("[OneTap] Exception:", error);
    return NextResponse.json({ ok: false, error: error?.message || "INTERNAL_ERROR" }, { status: 500 });
  }
}
