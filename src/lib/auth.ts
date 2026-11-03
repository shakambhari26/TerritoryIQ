/**
 * Sign-in for a hosted deployment: one shared username and password, set through the environment.
 *
 * Two modes, picked from the environment on every call:
 *   - local: none of the three variables below is set. Nothing changes from the localhost-only prototype: the
 *     loopback Host check (src/lib/loopback.ts) is the only gate, and there is no sign-in.
 *   - hosted: all three are set. Any Host is accepted, and every request needs a valid session cookie except the
 *     sign-in page itself. The proxy (src/proxy.ts) enforces it for every path; the block-rows handler checks again.
 * A partial set (one or two of the three) is "misconfigured" and refuses everything, so a typo fails closed.
 *
 *   TERRITORYIQ_USERNAME        the sign-in name
 *   TERRITORYIQ_PASSWORD_HASH   `scrypt:<salt hex>:<key hex>`, made by `npm run auth:hash-password`; never the password
 *   TERRITORYIQ_SESSION_SECRET  at least 32 random characters; changing it signs everyone out
 *
 * The session is `<expiry seconds>.<HMAC-SHA256>` over the username, the password hash and the expiry, so it carries
 * no data, cannot be forged without the secret, and stops working when the password or username changes.
 *
 * This is one shared account, not per-user identity: it keeps the data off the open internet, but it does not say who
 * looked at what, and everyone who knows the password sees everything. See docs/hosted-readiness-plan.md.
 */

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { isLoopbackHost } from "./loopback.ts";

export const SESSION_COOKIE = "tiq_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const MIN_SECRET_LENGTH = 32;

const ENV_KEYS = ["TERRITORYIQ_USERNAME", "TERRITORYIQ_PASSWORD_HASH", "TERRITORYIQ_SESSION_SECRET"] as const;
const SCRYPT_KEY_BYTES = 64;
const HASH_PATTERN = /^scrypt:([0-9a-f]{32}):([0-9a-f]{128})$/;

export interface AuthConfig {
  username: string;
  passwordHash: string;
  secret: string;
}

export type AuthMode =
  | { kind: "local" }
  | { kind: "hosted"; config: AuthConfig }
  | { kind: "misconfigured"; problem: string };

type Env = Record<string, string | undefined>;

export function authMode(env: Env = process.env): AuthMode {
  const [username, passwordHash, secret] = ENV_KEYS.map((key) => env[key]?.trim() ?? "");
  const set = [username, passwordHash, secret].filter(Boolean).length;
  if (set === 0) return { kind: "local" };
  if (set < ENV_KEYS.length) return { kind: "misconfigured", problem: `set all of ${ENV_KEYS.join(", ")}, or none` };
  if (!HASH_PATTERN.test(passwordHash)) {
    return { kind: "misconfigured", problem: "TERRITORYIQ_PASSWORD_HASH is not a hash from `npm run auth:hash-password`" };
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    return { kind: "misconfigured", problem: `TERRITORYIQ_SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters` };
  }
  return { kind: "hosted", config: { username, passwordHash, secret } };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT_KEY_BYTES);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const match = HASH_PATTERN.exec(stored);
  if (!match) return false;
  const expected = Buffer.from(match[2], "hex");
  const actual = scryptSync(password, Buffer.from(match[1], "hex"), SCRYPT_KEY_BYTES);
  return timingSafeEqual(actual, expected);
}

/** Constant-time string comparison (both sides are hashed first, so their lengths never leak). */
function sameString(a: string, b: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function verifyCredentials(username: string, password: string, config: AuthConfig): boolean {
  // Both checks always run, so a wrong username takes as long as a wrong password.
  const userOk = sameString(username, config.username);
  const passwordOk = verifyPassword(password, config.passwordHash);
  return userOk && passwordOk;
}

function sign(expires: number, config: AuthConfig): string {
  return createHmac("sha256", config.secret)
    .update(`v1|${config.username}|${config.passwordHash}|${expires}`)
    .digest("base64url");
}

export function createSessionToken(config: AuthConfig, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const expires = nowSeconds + SESSION_TTL_SECONDS;
  return `${expires}.${sign(expires, config)}`;
}

export function verifySessionToken(
  token: string | null | undefined,
  config: AuthConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!token) return false;
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires <= nowSeconds || expires > nowSeconds + SESSION_TTL_SECONDS) return false;
  return sameString(match[2], sign(expires, config));
}

/** The value of one cookie from a raw `Cookie` header, or null. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index !== -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

/**
 * The single question every data-bearing path asks: may this request see data? Local mode: only a loopback Host.
 * Hosted mode: only a valid session cookie. Misconfigured: never.
 */
export function isRequestAuthorized(headers: Headers, mode: AuthMode = authMode()): boolean {
  if (mode.kind === "local") return isLoopbackHost(headers.get("host"));
  if (mode.kind === "misconfigured") return false;
  return verifySessionToken(readCookie(headers.get("cookie"), SESSION_COOKIE), mode.config);
}

/** `Set-Cookie` for a new session. `Secure` everywhere but loopback, where a test over plain http needs it off. */
export function sessionCookie(token: string, host: string | null): string {
  const secure = isLoopbackHost(host) ? "" : "; Secure";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearedSessionCookie(host: string | null): string {
  const secure = isLoopbackHost(host) ? "" : "; Secure";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/** Where to send someone after sign-in: a same-site path only, never `//host` or an absolute URL. */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  if (value.startsWith("/login") || value.startsWith("/logout")) return "/";
  return value.slice(0, 512);
}
