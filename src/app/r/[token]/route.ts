import { connection } from "next/server";
import { getByToken, respondByToken } from "@/features/visit-insights/client.server";
import { isToken, MAX_FORM_BYTES, parseReplyForm } from "@/features/visit-insights/forms";
import { isSameOrigin } from "@/features/visit-insights/label-form";
import { SITE } from "@/lib/site";
import type { SentMessage } from "@/features/visit-insights/types";

/**
 * GET /r/<token>: the page a field rep opens from a WhatsApp or email message from head office. It shows the message
 * and its to-dos; the rep ticks what is done and writes back. POST /r/<token> saves that.
 *
 * Public (no sign-in: reps have no TerritoryIQ account), so the proxy lets /r/ through. The token is the only key: 192
 * random bits, stored by the service only as a hash, expiring after 60 days. The page shows this one message and
 * nothing else, has no script and no `_next/` asset, and is never cached or indexed. Same pattern as /login.
 */

const HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STATUS: Record<SentMessage["status"], string> = { sent: "New", read: "Opened", replied: "Replied", done: "Done" };

function shell(title: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · ${SITE.name}</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
  :root { --bg:#f4f6fa; --card:#fff; --line:#e2e8f0; --ink:#0b1220; --muted:#475569; --accent:#14b8a6; --accent-ink:#0f766e; --ok:#166534; --ok-soft:#f0fdf4; --danger:#b91c1c; --danger-soft:#fef2f2; color-scheme: light dark; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b1220; --card:#111a2e; --line:#25324f; --ink:#f1f5fb; --muted:#b9c5da; --accent-ink:#2dd4bf; --ok:#86efac; --ok-soft:rgb(22 101 52 / .2); --danger:#fca5a5; --danger-soft:rgb(185 28 28 / .18); } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100dvh; padding:16px; background:var(--bg); color:var(--ink); font:16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Noto Sans Bengali", "Noto Sans Devanagari", sans-serif; }
  main { margin:0 auto; max-width:560px; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:20px; }
  .brand { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:13px; }
  .brand img { width:22px; height:22px; }
  h1 { font-size:20px; margin:12px 0 4px; line-height:1.3; }
  .meta { color:var(--muted); font-size:13px; margin:0 0 14px; }
  .pill { display:inline-block; padding:1px 8px; border-radius:99px; border:1px solid var(--line); font-size:12px; font-weight:600; }
  .body { white-space:pre-wrap; margin:0 0 16px; }
  h2 { font-size:15px; margin:18px 0 8px; }
  .todo { display:flex; gap:10px; align-items:flex-start; padding:10px 12px; border:1px solid var(--line); border-radius:10px; margin-bottom:8px; }
  .todo input { width:22px; height:22px; margin:1px 0 0; accent-color:var(--accent-ink); flex:none; }
  .thread p { margin:0 0 8px; padding:8px 12px; border-radius:10px; background:var(--bg); font-size:15px; white-space:pre-wrap; }
  .thread b { font-size:12px; color:var(--muted); display:block; }
  label.t { display:block; font-weight:600; font-size:14px; margin:16px 0 6px; }
  textarea { width:100%; min-height:96px; padding:10px; font:inherit; color:inherit; background:transparent; border:1px solid var(--line); border-radius:8px; }
  .row { display:flex; gap:10px; margin-top:14px; flex-wrap:wrap; }
  button { flex:1; min-width:140px; height:46px; font:inherit; font-weight:600; border-radius:8px; cursor:pointer; border:1px solid var(--line); background:transparent; color:inherit; }
  button.primary { background:var(--accent); color:#0b1220; border:0; }
  .notice { padding:10px 12px; border-radius:8px; font-size:14px; margin:0 0 12px; }
  .ok { background:var(--ok-soft); color:var(--ok); }
  .err { background:var(--danger-soft); color:var(--danger); }
</style>
</head>
<body>
<main>
  <div class="brand"><img src="/icon.svg" alt=""><span>Elegant Steel · message from head office</span></div>
  ${body}
</main>
</body>
</html>`;
  return new Response(html, { status, headers: HEADERS });
}

const gone = () =>
  shell("Link not valid", `<h1>This link is not valid</h1><p class="meta">It may have expired. Ask your supervisor to send the message again.</p>`, 404);

function render(token: string, m: SentMessage, saved: string | null): Response {
  const when = m.created_at ? new Date(m.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const notice =
    saved === "1"
      ? `<p class="notice ok" role="status">Saved. Head office can see your update.</p>`
      : saved === "0"
        ? `<p class="notice err" role="alert">Not saved. Please try again.</p>`
        : "";
  const todos = m.todos.length
    ? `<h2>To do</h2>${m.todos
        .map(
          (t, i) =>
            `<label class="todo"><input type="checkbox" name="todo" value="${i}"${t.done ? " checked" : ""}><span>${esc(t.text)}</span></label>`,
        )
        .join("")}`
    : "";
  const thread = m.replies.length
    ? `<h2>Conversation</h2><div class="thread">${m.replies
        .map((r) => `<p><b>${r.author === "rep" ? "You" : esc(m.sender)}</b>${esc(r.text)}</p>`)
        .join("")}</div>`
    : "";
  return shell(
    m.title,
    `${notice}<h1>${esc(m.title)}</h1>
  <p class="meta">${esc(m.sender)} · ${esc(when)} · <span class="pill">${STATUS[m.status]}</span></p>
  ${m.body ? `<p class="body">${esc(m.body)}</p>` : ""}
  ${thread}
  <form method="post" action="/r/${token}">
    <input type="hidden" name="token" value="${token}">
    ${todos}
    <label class="t" for="text">Your reply (optional)</label>
    <textarea id="text" name="text" maxlength="2000" placeholder="What did you do? Any problem?"></textarea>
    <div class="row">
      <button type="submit">Save</button>
      <button type="submit" class="primary" name="done" value="1">Save and mark all done</button>
    </div>
  </form>`,
  );
}

type Ctx = { params: Promise<{ token: string }> };

export async function GET(request: Request, ctx: Ctx) {
  await connection();
  const { token } = await ctx.params;
  if (!isToken(token)) return gone();
  const res = await getByToken(token);
  if (!res.ok) return res.kind === "upstream" ? gone() : shell("Unavailable", `<h1>Not available right now</h1><p class="meta">Please try again in a few minutes.</p>`, 503);
  return render(token, res.data, new URL(request.url).searchParams.get("saved"));
}

export async function POST(request: Request, ctx: Ctx) {
  await connection();
  const { token } = await ctx.params;
  if (!isToken(token)) return gone();
  if (!isSameOrigin(request.headers)) return new Response("Cross-site request refused.", { status: 403, headers: { "Cache-Control": "no-store" } });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_FORM_BYTES) return new Response("Request too large.", { status: 413 });
  const form = parseReplyForm(await request.text());
  const ok = form !== null && form.token === token && (await respondByToken(token, { text: form.text, done_todos: form.done_todos, done: form.done })).ok;
  return new Response(null, { status: 303, headers: { Location: `/r/${token}?saved=${ok ? 1 : 0}`, "Cache-Control": "no-store" } });
}
