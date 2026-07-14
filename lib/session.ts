// Minimal iron-session equivalent: AES-256-GCM sealed values for httpOnly
// cookies, keyed off SESSION_SECRET. Dependency free by design.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export const OURA_COOKIE = "vitalis_oura";
export const STATE_COOKIE = "vitalis_oauth_state";

export type OuraTokens = {
  accessToken: string;
  refreshToken?: string;
  // Epoch milliseconds after which the access token is expected to be stale.
  expiresAt?: number;
};

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short (16+ characters required)");
  }
  return createHash("sha256").update(secret).digest();
}

export function seal(payload: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, ciphertext, tag].map((b) => b.toString("base64url")).join(".");
}

export function open<T>(sealed: string | undefined | null): T | null {
  if (!sealed) return null;
  try {
    const [ivB64, ctB64, tagB64] = sealed.split(".");
    if (!ivB64 || !ctB64 || !tagB64) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};
