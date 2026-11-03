import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionCookie } from "../../src/lib/auth.ts";
import { embedOrigins, signFrontierToken, ssoConfig, verifyFrontierToken } from "../../src/lib/frontier-sso.ts";

/**
 * Sign-in from Frontier (src/lib/frontier-sso.ts): a short-lived token signed with the shared secret, used once, for
 * an allowed role only; and framing allowed only for the https origins named.
 */

const SECRET = "s".repeat(40);
const NOW = 1_800_000_000;
const config = ssoConfig({ FRONTIER_SSO_SECRET: SECRET })!;
let counter = 0;
const token = (over: Record<string, unknown> = {}, secret = SECRET) =>
  signFrontierToken({ sub: "EMP-1042", name: "Head Office", role: "HO", iat: NOW, exp: NOW + 60, jti: `jti-${String(++counter).padStart(16, "0")}`, ...over }, secret);

describe("Frontier sign-in token", () => {
  it("accepts a fresh, signed token for an allowed role, once", () => {
    const t = token();
    assert.deepEqual(verifyFrontierToken(t, config, NOW), { ok: true, user: { sub: "EMP-1042", name: "Head Office", role: "HO" } });
    assert.deepEqual(verifyFrontierToken(t, config, NOW + 1), { ok: false, reason: "already used" });
  });

  it("refuses a wrong secret, a changed payload, an expired or long-lived token, a missing field and a junk string", () => {
    assert.equal(verifyFrontierToken(token({}, "x".repeat(40)), config, NOW).ok, false);
    const [body, sig] = token().split(".");
    const forged = Buffer.from(Buffer.from(body, "base64url").toString().replace('"HO"', '"MD"')).toString("base64url");
    assert.deepEqual(verifyFrontierToken(`${forged}.${sig}`, config, NOW), { ok: false, reason: "bad signature" });
    assert.deepEqual(verifyFrontierToken(token({ iat: NOW - 200, exp: NOW - 100 }), config, NOW), { ok: false, reason: "expired" });
    assert.deepEqual(verifyFrontierToken(token({ exp: NOW + 3600 }), config, NOW), { ok: false, reason: "lifetime too long" });
    assert.deepEqual(verifyFrontierToken(token({ iat: NOW + 120, exp: NOW + 180 }), config, NOW), { ok: false, reason: "issued in the future" });
    assert.deepEqual(verifyFrontierToken(token({ jti: "short" }), config, NOW), { ok: false, reason: "missing sub, role or jti" });
    for (const junk of [null, "", "abc", "a.b", `${"A".repeat(20)}.${"B".repeat(43)}`]) assert.equal(verifyFrontierToken(junk, config, NOW).ok, false);
  });

  it("lets in only the roles listed, head office by default", () => {
    assert.deepEqual(verifyFrontierToken(token({ role: "Sales Officer" }), config, NOW), { ok: false, reason: "role SALES OFFICER is not allowed" });
    assert.equal(verifyFrontierToken(token({ role: "md" }), config, NOW).ok, true);
    const wide = ssoConfig({ FRONTIER_SSO_SECRET: SECRET, FRONTIER_SSO_ROLES: "HO, ASM" })!;
    assert.equal(verifyFrontierToken(token({ role: "asm" }), wide, NOW).ok, true);
    assert.equal(verifyFrontierToken(token({ role: "MD" }), wide, NOW).ok, false);
  });

  it("is off without a secret of at least 32 characters", () => {
    assert.equal(ssoConfig({}), null);
    assert.equal(ssoConfig({ FRONTIER_SSO_SECRET: "short" }), null);
  });
});

describe("framing and the session cookie", () => {
  it("allows framing only for exact https origins", () => {
    assert.deepEqual(embedOrigins({}), []);
    assert.deepEqual(embedOrigins({ FRONTIER_EMBED_ORIGINS: "https://frontier.example.com, http://insecure.example.com *  https://a.b:8443 https://x.com/path" }), [
      "https://frontier.example.com",
      "https://a.b:8443",
    ]);
  });

  it("uses SameSite=None only for a framed session on a real host", () => {
    assert.match(sessionCookie("t", "territoryiq.example", true), /SameSite=None; Max-Age=\d+; Secure$/);
    assert.match(sessionCookie("t", "territoryiq.example"), /SameSite=Lax/);
    assert.match(sessionCookie("t", "127.0.0.1:3000", true), /SameSite=Lax/);
  });
});
