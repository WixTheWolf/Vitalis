import { NextRequest, NextResponse } from "next/server";
import { OURA_COOKIE, STATE_COOKIE, cookieOptions, seal } from "@/lib/session";
import { exchangeCode } from "@/lib/oura";

export const runtime = "nodejs";

// OAuth callback: verify state, exchange the code for tokens, seal them into
// an encrypted httpOnly cookie, and send the user home.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/?oura=error&reason=${reason}`, origin));
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  if (!code) return fail("missing_code");
  if (!state || !expectedState || state !== expectedState) return fail("bad_state");

  try {
    const tokens = await exchangeCode(code);
    const res = NextResponse.redirect(new URL("/?oura=connected", origin));
    res.cookies.delete(STATE_COOKIE);
    res.cookies.set(OURA_COOKIE, seal(tokens), cookieOptions);
    return res;
  } catch {
    return fail("exchange_failed");
  }
}
