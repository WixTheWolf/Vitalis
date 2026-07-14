import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { STATE_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

// Kicks off the Oura OAuth flow. If only a personal access token is
// configured, there is nothing to authorize: bounce home as connected.
export function GET(request: Request): NextResponse {
  const clientId = process.env.OURA_CLIENT_ID;
  const redirectUri = process.env.OURA_REDIRECT_URI;
  const origin = new URL(request.url).origin;

  if (!clientId || !redirectUri) {
    if (process.env.OURA_PERSONAL_ACCESS_TOKEN) {
      return NextResponse.redirect(new URL("/?oura=connected", origin));
    }
    return NextResponse.redirect(new URL("/?oura=misconfigured", origin));
  }

  const state = randomBytes(16).toString("hex");
  const authorize = new URL("https://cloud.ouraring.com/oauth/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", "daily heartrate personal");
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
