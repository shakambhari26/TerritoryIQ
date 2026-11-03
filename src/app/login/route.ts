import { connection } from "next/server";
import {
  authMode,
  createSessionToken,
  isRequestAuthorized,
  safeNextPath,
  sessionCookie,
  verifyCredentials,
} from "@/lib/auth";
import { clientAddress, isLockedOut, recordFailure, recordSuccess } from "@/lib/login-limiter";
import { SITE } from "@/lib/site";

/**
 * GET /login: the sign-in form. POST /login: checks the username and password (src/lib/auth.ts) and sets the session
 * cookie. In local mode there is nothing to sign in to, so both send the visitor home.
 *
 * The page is one self-contained HTML document with no script and no `_next/` asset, because the proxy refuses those
 * to anyone without a session. It is dynamic (`connection()`) and never cached.
 */

const MAX_FORM_BYTES = 4096;
const NO_STORE = { "Cache-Control": "no-store" };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(next: string, error: string | null, status: number): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in · ${SITE.name}</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
  :root { --bg:#f4f6fa; --card:#fff; --line:#e2e8f0; --ink:#0b1220; --muted:#475569; --accent:#14b8a6; --accent-ink:#0f766e; --danger:#b91c1c; --danger-soft:#fef2f2; color-scheme: light dark; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b1220; --card:#111a2e; --line:#25324f; --ink:#f1f5fb; --muted:#b9c5da; --accent-ink:#2dd4bf; --danger:#fca5a5; --danger-soft:rgb(185 28 28 / .18); } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100dvh; display:grid; place-items:center; padding:16px; background:var(--bg); color:var(--ink); font:16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { width:100%; max-width:380px; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:28px; box-shadow:0 10px 30px rgb(11 18 32 / .08); }
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:20px; }
  .brand img { width:32px; height:32px; }
  .brand b { font-size:17px; letter-spacing:-.01em; }
  h1 { font-size:20px; margin:0 0 4px; }
  p.lead { margin:0 0 20px; color:var(--muted); font-size:14px; }
  label { display:block; font-size:14px; font-weight:600; margin:14px 0 6px; }
  input { width:100%; height:42px; padding:0 12px; font:inherit; color:inherit; background:transparent; border:1px solid var(--line); border-radius:8px; }
  input:focus { outline:2px solid var(--accent); outline-offset:1px; border-color:var(--accent); }
  button { width:100%; height:44px; margin-top:22px; font:inherit; font-weight:600; color:#0b1220; background:var(--accent); border:0; border-radius:8px; cursor:pointer; }
  button:hover { filter:brightness(1.05); }
  button:focus-visible { outline:2px solid var(--accent-ink); outline-offset:2px; }
  .error { margin:0 0 4px; padding:10px 12px; font-size:14px; color:var(--danger); background:var(--danger-soft); border-radius:8px; }
</style>
</head>
<body>
<main>
  <div class="brand"><img src="/icon.svg" alt=""><b>${SITE.name}</b></div>
  <h1>Sign in</h1>
  <p class="lead">This workspace holds confidential territory data.</p>
  ${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ""}
  <form method="post" action="/login">
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    <label for="username">Username</label>
    <input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Sign in</button>
  </form>
</main>
</body>
</html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE } });
}

const redirect = (location: string, extra: Record<string, string> = {}) =>
  new Response(null, { status: 303, headers: { Location: location, ...NO_STORE, ...extra } });

/**
 * A cross-site form cannot sign anyone in. Browsers send Sec-Fetch-Site, which a page cannot set, so it decides when
 * present. Origin is not enough on its own: the app's `Referrer-Policy: no-referrer` makes Chrome send `Origin: null`
 * for this page's own form. Without Sec-Fetch-Site (an older browser, or curl), a named Origin must be this host.
 */
function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin" || site === "none";
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  await connection();
  const mode = authMode();
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  if (mode.kind !== "hosted" || isRequestAuthorized(request.headers, mode)) return redirect(next);
  return page(next, null, 200);
}

export async function POST(request: Request) {
  await connection();
  const mode = authMode();
  if (mode.kind !== "hosted") return redirect("/");
  if (!sameOrigin(request)) return new Response("Cross-site sign-in refused.", { status: 403, headers: NO_STORE });

  const text = await request.text();
  if (text.length > MAX_FORM_BYTES) return new Response("Request too large.", { status: 413, headers: NO_STORE });
  const form = new URLSearchParams(text);
  const next = safeNextPath(form.get("next"));

  const client = clientAddress(request.headers);
  if (isLockedOut(client)) return page(next, "Too many sign-in attempts. Try again in 15 minutes.", 429);

  if (!verifyCredentials(form.get("username") ?? "", form.get("password") ?? "", mode.config)) {
    recordFailure(client);
    return page(next, "Incorrect username or password.", 401);
  }

  recordSuccess(client);
  return redirect(next, { "Set-Cookie": sessionCookie(createSessionToken(mode.config), request.headers.get("host")) });
}
