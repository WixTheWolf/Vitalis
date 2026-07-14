import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { OURA_COOKIE, cookieOptions, open, seal, type OuraTokens } from "@/lib/session";
import { OuraAuthError, fetchOuraVitals, getCached, refreshTokens, setCached } from "@/lib/oura";

export const runtime = "nodejs";

// Normalized vitals proxy. Token priority: sealed OAuth cookie, then the
// OURA_PERSONAL_ACCESS_TOKEN env fallback for solo use. Responses are cached
// for 60 seconds per token, and a 401 from Oura triggers one refresh attempt.
export async function GET(request: NextRequest): Promise<NextResponse> {
  let tokens = open<OuraTokens>(request.cookies.get(OURA_COOKIE)?.value);
  let fromCookie = tokens !== null;

  if (!tokens) {
    const pat = process.env.OURA_PERSONAL_ACCESS_TOKEN;
    if (pat) {
      tokens = { accessToken: pat };
      fromCookie = false;
    }
  }

  if (!tokens) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const tokenKey = createHash("sha256").update(tokens.accessToken).digest("hex");
  const cached = getCached(tokenKey);
  if (cached) {
    return NextResponse.json(
      { vitals: cached, source: "oura", cached: true },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  }

  let refreshed: OuraTokens | null = null;
  try {
    let vitals;
    try {
      vitals = await fetchOuraVitals(tokens.accessToken);
    } catch (err) {
      if (err instanceof OuraAuthError && fromCookie && tokens.refreshToken) {
        refreshed = await refreshTokens(tokens.refreshToken);
        vitals = await fetchOuraVitals(refreshed.accessToken);
      } else {
        throw err;
      }
    }

    setCached(tokenKey, vitals);
    const res = NextResponse.json(
      { vitals, source: "oura", cached: false },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
    if (refreshed) res.cookies.set(OURA_COOKIE, seal(refreshed), cookieOptions);
    return res;
  } catch (err) {
    if (err instanceof OuraAuthError) {
      const res = NextResponse.json({ error: "unauthorized" }, { status: 401 });
      if (fromCookie) res.cookies.delete(OURA_COOKIE);
      return res;
    }
    return NextResponse.json({ error: "upstream_failed" }, { status: 502 });
  }
}
