import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  authMode,
  clearedSessionCookie,
  createSessionToken,
  hashPassword,
  isRequestAuthorized,
  readCookie,
  safeNextPath,
  sessionCookie,
  verifyCredentials,
  verifyPassword,
  verifySessionToken,
  type AuthConfig,
} from "../../src/lib/auth.ts";
import { clientAddress, isLockedOut, recordFailure, recordSuccess, resetLoginLimiter } from "../../src/lib/login-limiter.ts";
import { handleBlockRowsRequest } from "../../src/features/globe/block-rows-route.server.ts";

/**
 * Hosted sign-in (src/lib/auth.ts): local mode is unchanged, hosted mode needs a valid session for every data path,
 * and a partial configuration refuses everything.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const PASSWORD = "correct horse battery staple";
const HASH = hashPassword(PASSWORD);
const SECRET = "s".repeat(40);
const ENV = { TERRITORYIQ_USERNAME: "planner", TERRITORYIQ_PASSWORD_HASH: HASH, TERRITORYIQ_SESSION_SECRET: SECRET };
const CONFIG: AuthConfig = { username: "planner", passwordHash: HASH, secret: SECRET };
const NOW = 1_800_000_000;

describe("hosted sign-in: mode selection", () => {
  it("is local when nothing is set, so the loopback-only prototype is unchanged", () => {
    assert.deepEqual(authMode({}), { kind: "local" });
    assert.deepEqual(authMode({ TERRITORYIQ_USERNAME: "  " }), { kind: "local" });
  });

  it("is hosted only when all three are set and valid", () => {
    assert.deepEqual(authMode(ENV), { kind: "hosted", config: CONFIG });
  });

  it("fails closed on a partial or invalid configuration", () => {
    for (const env of [
      { TERRITORYIQ_USERNAME: "planner" },
      { ...ENV, TERRITORYIQ_SESSION_SECRET: "" },
      { ...ENV, TERRITORYIQ_PASSWORD_HASH: "" },
      { ...ENV, TERRITORYIQ_PASSWORD_HASH: PASSWORD },
      { ...ENV, TERRITORYIQ_SESSION_SECRET: "short" },
    ]) {
      assert.equal(authMode(env).kind, "misconfigured", JSON.stringify(Object.keys(env)));
    }
  });
});

describe("hosted sign-in: password and credentials", () => {
  it("stores a salted scrypt hash, never the password", () => {
    assert.match(HASH, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    assert.ok(!HASH.includes(PASSWORD));
    assert.notEqual(hashPassword(PASSWORD), HASH, "a fresh salt each time");
  });

  it("accepts only the right username and password", () => {
    assert.equal(verifyPassword(PASSWORD, HASH), true);
    assert.equal(verifyPassword(`${PASSWORD} `, HASH), false);
    assert.equal(verifyPassword(PASSWORD, "scrypt:bad"), false);
    assert.equal(verifyCredentials("planner", PASSWORD, CONFIG), true);
    assert.equal(verifyCredentials("Planner", PASSWORD, CONFIG), false);
    assert.equal(verifyCredentials("planner", "wrong", CONFIG), false);
    assert.equal(verifyCredentials("", "", CONFIG), false);
  });
});

describe("hosted sign-in: session token", () => {
  it("is valid until it expires, and not after", () => {
    const token = createSessionToken(CONFIG, NOW);
    assert.equal(verifySessionToken(token, CONFIG, NOW), true);
    assert.equal(verifySessionToken(token, CONFIG, NOW + SESSION_TTL_SECONDS - 1), true);
    assert.equal(verifySessionToken(token, CONFIG, NOW + SESSION_TTL_SECONDS), false);
  });

  it("cannot be forged, extended or reused after a secret, username or password change", () => {
    const token = createSessionToken(CONFIG, NOW);
    const [, sig] = token.split(".");
    assert.equal(verifySessionToken(`${NOW + 10 * SESSION_TTL_SECONDS}.${sig}`, CONFIG, NOW), false, "extended expiry");
    assert.equal(verifySessionToken(`${NOW + 60}.${"A".repeat(43)}`, CONFIG, NOW), false, "made-up signature");
    assert.equal(verifySessionToken(token, { ...CONFIG, secret: "t".repeat(40) }, NOW), false, "new secret");
    assert.equal(verifySessionToken(token, { ...CONFIG, username: "other" }, NOW), false, "new username");
    assert.equal(verifySessionToken(token, { ...CONFIG, passwordHash: hashPassword("another password!") }, NOW), false, "new password");
    for (const junk of [null, undefined, "", "x", "1.2", `${NOW}.`, `${token}x`]) {
      assert.equal(verifySessionToken(junk, CONFIG, NOW), false, String(junk));
    }
  });

  it("is set HttpOnly, SameSite=Lax and Secure off loopback", () => {
    const hosted = sessionCookie("t", "territoryiq.up.railway.app");
    assert.match(hosted, new RegExp(`^${SESSION_COOKIE}=t; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}; Secure$`));
    assert.doesNotMatch(sessionCookie("t", "127.0.0.1:3000"), /Secure/);
    assert.match(clearedSessionCookie("territoryiq.up.railway.app"), /Max-Age=0; Secure$/);
  });

  it("reads exactly the named cookie", () => {
    assert.equal(readCookie(`a=1; ${SESSION_COOKIE}=abc; b=2`, SESSION_COOKIE), "abc");
    assert.equal(readCookie(`x${SESSION_COOKIE}=abc`, SESSION_COOKIE), null);
    assert.equal(readCookie(null, SESSION_COOKIE), null);
  });
});

describe("hosted sign-in: request authorization", () => {
  const headers = (init: Record<string, string>) => new Headers(init);
  const hosted = authMode(ENV);
  const cookie = `${SESSION_COOKIE}=${createSessionToken(CONFIG)}`;

  it("local mode: loopback Host only, as before", () => {
    assert.equal(isRequestAuthorized(headers({ host: "127.0.0.1:3000" }), { kind: "local" }), true);
    assert.equal(isRequestAuthorized(headers({ host: "evil.example", cookie }), { kind: "local" }), false);
  });

  it("hosted mode: a valid session on any Host, nothing without one", () => {
    assert.equal(isRequestAuthorized(headers({ host: "territoryiq.up.railway.app", cookie }), hosted), true);
    assert.equal(isRequestAuthorized(headers({ host: "territoryiq.up.railway.app" }), hosted), false);
    assert.equal(isRequestAuthorized(headers({ host: "127.0.0.1:3000" }), hosted), false, "loopback is not a bypass");
    assert.equal(isRequestAuthorized(headers({ host: "x", cookie: `${SESSION_COOKIE}=1.abc` }), hosted), false);
  });

  it("misconfigured: never", () => {
    assert.equal(isRequestAuthorized(headers({ host: "127.0.0.1", cookie }), { kind: "misconfigured", problem: "x" }), false);
  });

  it("the block-rows handler applies the same rule", async () => {
    const saved = { ...process.env };
    Object.assign(process.env, ENV);
    try {
      const source = { available: true, rows: () => [] };
      const post = (extra: Record<string, string>) =>
        new Request("http://territoryiq.up.railway.app/api/globe/block-rows", {
          method: "POST",
          headers: { host: "territoryiq.up.railway.app", "content-type": "application/json", ...extra },
          body: JSON.stringify({ blockId: "GB-1" }),
        });
      assert.equal((await handleBlockRowsRequest(post({}), source)).status, 403);
      assert.notEqual((await handleBlockRowsRequest(post({ cookie }), source)).status, 403);
    } finally {
      for (const key of Object.keys(ENV)) if (!(key in saved)) delete process.env[key];
    }
  });
});

describe("hosted sign-in: redirects and guessing", () => {
  beforeEach(() => resetLoginLimiter());

  it("sends people only to a same-site path after sign-in", () => {
    assert.equal(safeNextPath("/workspace?x=1"), "/workspace?x=1");
    for (const bad of [null, "", "workspace", "//evil.example", "/\\evil.example", "https://evil.example", "/login", "/logout"]) {
      assert.equal(safeNextPath(bad), "/", String(bad));
    }
  });

  it("locks an address out after 10 failures in 15 minutes, and a success clears it", () => {
    const t = Date.now();
    for (let i = 0; i < 9; i++) recordFailure("1.2.3.4", t);
    assert.equal(isLockedOut("1.2.3.4", t), false);
    recordFailure("1.2.3.4", t);
    assert.equal(isLockedOut("1.2.3.4", t), true);
    assert.equal(isLockedOut("5.6.7.8", t), false, "another address is not affected");
    assert.equal(isLockedOut("1.2.3.4", t + 15 * 60 * 1000), false, "the window passes");
    recordSuccess("1.2.3.4");
    assert.equal(isLockedOut("1.2.3.4", t), false);
  });

  it("locks everyone out after 100 failures from any mix of addresses", () => {
    const t = Date.now();
    for (let i = 0; i < 100; i++) recordFailure(`10.0.0.${i}`, t);
    assert.equal(isLockedOut("192.0.2.1", t), true);
  });

  it("takes the client address from the edge's headers", () => {
    assert.equal(clientAddress(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" })), "1.1.1.1");
    assert.equal(clientAddress(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" })), "2.2.2.2");
    assert.equal(clientAddress(new Headers()), "unknown");
  });
});

describe("hosted sign-in: wiring", () => {
  it("the proxy gates every path: no matcher, only the sign-in page is public", () => {
    const proxy = read("src/proxy.ts");
    assert.doesNotMatch(proxy, /export const config/);
    assert.match(proxy, /new Set\(\["\/login", "\/logout", "\/icon\.svg"\]\)/);
    assert.match(proxy, /isRequestAuthorized\(request\.headers, mode\)/);
    assert.match(proxy, /mode\.kind === "misconfigured"[\s\S]*status: 503/);
  });

  it("the sign-in page needs no script or _next asset (the proxy refuses those without a session)", () => {
    const login = read("src/app/login/route.ts");
    assert.doesNotMatch(login, /<script|\/_next\//);
    assert.match(login, /await connection\(\);/);
  });

  it("the hosted start script refuses to bind all interfaces without sign-in", () => {
    const env = { ...process.env };
    for (const key of Object.keys(ENV)) delete env[key];
    const run = spawnSync(process.execPath, [join(ROOT, "scripts", "start-hosted.mjs")], { env, encoding: "utf8" });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Refusing to start on all interfaces without sign-in/);
  });

  it("railway.json builds normally and starts only through the guarded script", () => {
    const railway = JSON.parse(read("railway.json"));
    assert.equal(railway.deploy.startCommand, "npm run start:hosted");
    assert.equal(JSON.parse(read("package.json")).scripts["start:hosted"], "node scripts/start-hosted.mjs");
  });
});
