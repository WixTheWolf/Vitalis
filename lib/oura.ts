// Server side Oura v2 API client: fetch, normalize, refresh, cache.
// Only ever runs in route handlers; the browser never touches api.ouraring.com.

import type { Vitals } from "./vitals";
import type { OuraTokens } from "./session";

const API = "https://api.ouraring.com/v2/usercollection";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";

type OuraDoc = Record<string, unknown>;
type OuraList = { data?: OuraDoc[] };

export class OuraAuthError extends Error {}

async function ouraGet(path: string, params: Record<string, string>, accessToken: string): Promise<OuraList> {
  const url = `${API}/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new OuraAuthError("oura token rejected");
  if (!res.ok) throw new Error(`oura ${path} failed with ${res.status}`);
  return (await res.json()) as OuraList;
}

export async function refreshTokens(refreshToken: string): Promise<OuraTokens> {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new OuraAuthError("cannot refresh without client credentials");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new OuraAuthError(`token refresh failed with ${res.status}`);
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
  };
}

export async function exchangeCode(code: string): Promise<OuraTokens> {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  const redirectUri = process.env.OURA_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new OuraAuthError("OURA_CLIENT_ID, OURA_CLIENT_SECRET and OURA_REDIRECT_URI must be set");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new OuraAuthError(`code exchange failed with ${res.status}`);
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function latest(list: OuraList): OuraDoc | undefined {
  const arr = list.data ?? [];
  return arr.length > 0 ? arr[arr.length - 1] : undefined;
}

// Pulls daily_readiness, daily_sleep, sleep sessions and recent heartrate and
// maps them into the app's Vitals shape. Fields the API cannot provide
// (batteries, steps) are simply omitted; the client merges partials.
export async function fetchOuraVitals(accessToken: string): Promise<Partial<Vitals>> {
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);
  const dayRange = { start_date: isoDate(twoDaysAgo), end_date: isoDate(now) };
  const hrRange = {
    start_datetime: new Date(now.getTime() - 6 * 3_600_000).toISOString(),
    end_datetime: now.toISOString(),
  };

  const [readinessList, dailySleepList, sleepList, hrList] = await Promise.all([
    ouraGet("daily_readiness", dayRange, accessToken),
    ouraGet("daily_sleep", dayRange, accessToken),
    ouraGet("sleep", dayRange, accessToken),
    ouraGet("heartrate", hrRange, accessToken),
  ]);

  const readiness = latest(readinessList);
  const dailySleep = latest(dailySleepList);
  const hr = latest(hrList);

  // Prefer the longest sleep session of the latest day for duration and
  // overnight biometrics; naps would otherwise win as the "latest" record.
  const sessions = sleepList.data ?? [];
  const lastDay = sessions.length > 0 ? sessions[sessions.length - 1].day : undefined;
  const nightly = sessions
    .filter((s) => s.day === lastDay)
    .sort((a, b) => (num(a.total_sleep_duration) ?? 0) - (num(b.total_sleep_duration) ?? 0))
    .pop();

  const out: Partial<Vitals> = {};
  const set = <K extends keyof Vitals>(k: K, v: Vitals[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };

  set("readiness", num(readiness?.score));
  set("skinTempDelta", num(readiness?.temperature_deviation));
  set("sleepScore", num(dailySleep?.score));

  const dur = num(nightly?.total_sleep_duration);
  set("sleepHours", dur !== undefined ? Math.round((dur / 3600) * 10) / 10 : undefined);
  set("hrv", num(nightly?.average_hrv));
  set("rhr", num(nightly?.lowest_heart_rate));
  set("respRate", num(nightly?.average_breath));

  set("hr", num(hr?.bpm));
  return out;
}

// 60 second per token response cache, shared across requests in this runtime.
type CacheEntry = { at: number; vitals: Partial<Vitals> };
const cache = new Map<string, CacheEntry>();
const CACHE_MS = 60_000;

export function getCached(tokenKey: string): Partial<Vitals> | null {
  const hit = cache.get(tokenKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.vitals;
  return null;
}

export function setCached(tokenKey: string, vitals: Partial<Vitals>): void {
  cache.set(tokenKey, { at: Date.now(), vitals });
  if (cache.size > 100) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}
