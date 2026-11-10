/**
 * Sign-in from the Frontier app: Frontier opens TerritoryIQ (in a WebView, an iframe or a new tab) at
 * `/sso?token=<token>`, and a valid token starts the same session the sign-in page gives, so nobody signs in twice.
 *
 * The token is `<payload>.<signature>`, both base64url (no padding):
 *   payload    JSON {"sub": "<Frontier user id>", "name": "<display name>", "role": "<role>", "iat": <unix s>,
 *              "exp": <unix s>, "jti": "<random id, 16-64 chars>"}
 *   signature  HMAC-SHA256 of the payload *text as sent* (the base64url string), keyed with FRONTIER_SSO_SECRET
 *
 * A token is accepted once (jti), for at most MAX_LIFETIME_SECONDS, and only for a role in FRONTIER_SSO_ROLES. Until
 * TerritoryIQ has per-person access, a signed-in person sees everything the shared account sees, so the role list
 * decides who Frontier may let in at all (default: head office only).
 *
 *   FRONTIER_SSO_SECRET   at least 32 random characters, shared with Frontier's server and nobody else; unset = /sso off
 *   FRONTIER_SSO_ROLES    space- or comma-separated roles allowed in, case-insensitive (default "HO MD ADMIN")
 *
 * Pure apart from the replay set, so the tests drive it with their own clock and secret.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_LIFETIME_SECONDS = 300;
/** Allowed difference between Frontier's clock and ours. */
const CLOCK_SKEW_SECONDS = 30;
const DEFAULT_ROLES = ["HO", "MD", "ADMIN"];

export interface FrontierUser {
  sub: string;
  name: string;
  role: string;
}

export type SsoResult = { ok: true; user: FrontierUser } | { ok: false; reason: string };

type Env = Record<string, string | undefined>;

export interface SsoConfig {
  secret: string;
  roles: Set<string>;
}

export function ssoConfig(env: Env = process.env): SsoConfig | null {
  const secret = env.FRONTIER_SSO_SECRET?.trim() ?? "";
  if (secret.length < 32) return null;
  const listed = (env.FRONTIER_SSO_ROLES ?? "").split(/[\s,]+/).filter(Boolean);
  return { secret, roles: new Set((listed.length ? listed : DEFAULT_ROLES).map((r) => r.toUpperCase())) };
}

export function signFrontierToken(payload: Record<string, unknown>, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

/** jti -> expiry, so a token (or a copied link) works once. One server process; a restart forgets, and expiry still holds. */
const seen = new Map<string, number>();

function remember(jti: string, exp: number, now: number): boolean {
  for (const [id, until] of seen) if (until < now) seen.delete(id);
  if (seen.has(jti)) return false;
  seen.set(jti, exp);
  return true;
}

const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() !== "" && value.length <= max ? value.trim() : null);

export function verifyFrontierToken(token: string | null, config: SsoConfig, now = Math.floor(Date.now() / 1000)): SsoResult {
  const match = /^([A-Za-z0-9_-]{10,2048})\.([A-Za-z0-9_-]{43})$/.exec(token ?? "");
  if (!match) return { ok: false, reason: "malformed" };
  const expected = createHmac("sha256", config.secret).update(match[1]).digest();
  const given = Buffer.from(match[2], "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad signature" };

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const { iat, exp } = payload;
  if (typeof iat !== "number" || typeof exp !== "number" || !Number.isInteger(iat) || !Number.isInteger(exp)) return { ok: false, reason: "missing iat or exp" };
  if (exp <= iat || exp - iat > MAX_LIFETIME_SECONDS) return { ok: false, reason: "lifetime too long" };
  if (iat > now + CLOCK_SKEW_SECONDS) return { ok: false, reason: "issued in the future" };
  if (exp <= now - CLOCK_SKEW_SECONDS) return { ok: false, reason: "expired" };

  const sub = text(payload.sub, 128);
  const role = text(payload.role, 40)?.toUpperCase() ?? null;
  const jti = typeof payload.jti === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(payload.jti) ? payload.jti : null;
  if (!sub || !role || !jti) return { ok: false, reason: "missing sub, role or jti" };
  if (!config.roles.has(role)) return { ok: false, reason: `role ${role} is not allowed` };
  if (!remember(jti, exp + CLOCK_SKEW_SECONDS, now)) return { ok: false, reason: "already used" };
  return { ok: true, user: { sub, role, name: text(payload.name, 120) ?? sub } };
}

/**
 * Web addresses allowed to show TerritoryIQ inside a frame (FRONTIER_EMBED_ORIGINS, space- or comma-separated
 * https origins). Anything that is not exactly an https scheme, a host and an optional port is dropped, so a typo cannot
 * open framing to everyone.
 */
export function embedOrigins(env: Env = process.env): string[] {
  return (env.FRONTIER_EMBED_ORIGINS ?? "")
    .split(/[\s,]+/)
    .filter((o) => /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(o));
}
