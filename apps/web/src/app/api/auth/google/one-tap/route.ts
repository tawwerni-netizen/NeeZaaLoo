import { NextRequest, NextResponse } from "next/server";
import { syncDirectWithDb } from "@/lib/server-auth-sync";

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
    const syncPayload = JSON.stringify({
      email: payload.email,
      subject: payload.sub || payload.id,
      name: payload.name || payload.given_name || payload.email.split("@")[0],
    });

    let sessionData: { accessToken: string; refreshToken: string; playerId?: string } | null = null;

    // 1. Prefer fast in-process session generation (unified monolith)
    if (typeof (globalThis as any).__NIZALO_SYNC_SESSION__ === "function") {
      try {
        const inProcResult = await (globalThis as any).__NIZALO_SYNC_SESSION__({
          email: payload.email,
          subject: payload.sub || payload.id,
          name: payload.name || payload.given_name || payload.email.split("@")[0],
          ip: request.headers.get("x-forwarded-for") || undefined,
        });
        if (inProcResult?.accessToken) {
          sessionData = inProcResult;
        }
      } catch (inProcErr) {
        console.error("[OneTap] In-process sync error:", inProcErr);
      }
    }

    // 2. Direct database sync fallback (works 100% in Next.js worker context without HTTP loopback)
    if (!sessionData) {
      try {
        const directResult = await syncDirectWithDb({
          email: payload.email,
          subject: payload.sub || payload.id,
          name: payload.name || payload.given_name || payload.email.split("@")[0],
          ip: request.headers.get("x-forwarded-for") || undefined,
          userAgent: request.headers.get("user-agent") || undefined,
        });
        if (directResult?.accessToken) {
          sessionData = directResult;
        }
      } catch (dbErr: any) {
        console.error("[OneTap] Direct DB sync error:", dbErr?.message || dbErr);
      }
    }

    // 3. Fallback to loopback candidates if direct sync failed
    if (!sessionData) {
      const candidates = [
        process.env.API_INTERNAL_URL || "http://127.0.0.1:4000",
        "http://localhost:4000",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        request.nextUrl.origin,
      ].filter(Boolean);

      let lastError: any = null;
      for (const base of candidates) {
        try {
          const candidateRes = await fetch(`${base}/v1/auth/google/sync-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: syncPayload,
            signal: AbortSignal.timeout(4000),
          });
          if (candidateRes.ok) {
            sessionData = await candidateRes.json();
            break;
          } else {
            const errText = await candidateRes.text().catch(() => "");
            lastError = `Status ${candidateRes.status} from ${base}: ${errText.slice(0, 100)}`;
            console.warn(`[OneTap] Candidate ${base} returned status ${candidateRes.status}:`, errText.slice(0, 100));
          }
        } catch (err: any) {
          lastError = err?.message || err;
        }
      }

      if (!sessionData || !sessionData.accessToken) {
        console.error("[OneTap] All sync targets failed. Last error:", lastError);
        return NextResponse.json({ ok: false, error: "SYNC_SESSION_FAILED" }, { status: 502 });
      }
    }

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
