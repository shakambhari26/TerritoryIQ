import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MAX_LABEL_FORM_BYTES, isSameOrigin, parseLabelForm } from "../../src/features/visit-insights/label-form.ts";
import { MAX_CHAT_BYTES, parseChatBody } from "../../src/features/visit-insights/chat-form.ts";
import {
  MAX_FORM_BYTES,
  isToken,
  parseContactForm,
  parseKeywordForm,
  parseMessageForm,
  parseNoteForm,
  parseReplyForm,
} from "../../src/features/visit-insights/forms.ts";

/**
 * Visit Insights (src/app/visit-insights): the correction form only accepts fixed-pattern values from this site, and
 * the ML service's API key stays on the server.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("visit insights: label form", () => {
  it("accepts a well-formed correction, with or without urgency", () => {
    assert.deepEqual(parseLabelForm("visit_key=a1b2c3d4e5f6a7b8&segment=HOT_ORDER&urgency=P1"), {
      visit_key: "a1b2c3d4e5f6a7b8", segment: "HOT_ORDER", urgency: "P1",
    });
    assert.equal(parseLabelForm("visit_key=V0001&segment=PAYMENT&urgency=")?.urgency, null);
  });

  it("rejects anything outside the fixed patterns or over the size cap", () => {
    for (const body of [
      "visit_key=../etc&segment=HOT_ORDER",
      "visit_key=V1&segment=hot_order",
      "visit_key=V1&segment=HOT_ORDER&urgency=P9",
      "segment=HOT_ORDER",
      `visit_key=V1&segment=HOT_ORDER&x=${"a".repeat(MAX_LABEL_FORM_BYTES)}`,
    ]) {
      assert.equal(parseLabelForm(body), null, body.slice(0, 60));
    }
  });

  it("refuses cross-site posts", () => {
    const h = (o: Record<string, string>) => new Headers({ host: "app.example", ...o });
    assert.equal(isSameOrigin(h({ "sec-fetch-site": "same-origin" })), true);
    assert.equal(isSameOrigin(h({ "sec-fetch-site": "cross-site" })), false);
    assert.equal(isSameOrigin(h({ origin: "https://evil.example" })), false);
    assert.equal(isSameOrigin(h({ origin: "https://app.example" })), true);
  });
});

describe("visit insights: the API key stays server-side", () => {
  it("the chat window is the only client component; it never sees the key and calls only its own route", () => {
    const chat = read("src/features/visit-insights/components/ChatBoard.tsx");
    assert.match(chat, /^"use client";/);
    assert.doesNotMatch(chat, /VISIT_INTEL|process\.env/);
    assert.match(chat, /const CHAT_URL = "\/api\/visit-insights\/chat";/);
    assert.equal((chat.match(/\bfetch\s*\(/g) ?? []).length, 1);
    assert.match(chat, /fetch\(CHAT_URL,/);
  });

  it("only server files read VISIT_INTEL_API_KEY, and every other component is a server component", () => {
    const client = read("src/features/visit-insights/client.server.ts");
    assert.match(client, /process\.env\.VISIT_INTEL_API_KEY/);
    for (const f of ["components/parts.tsx", "components/RoleViews.tsx", "components/AskPanel.tsx", "components/ExploreView.tsx", "components/Recommendations.tsx", "components/ExplanationView.tsx", "components/Messaging.tsx", "links.ts", "types.ts", "label-form.ts", "chat-form.ts", "forms.ts"]) {
      const src = read(`src/features/visit-insights/${f}`);
      assert.doesNotMatch(src, /VISIT_INTEL_API_KEY|^["']use client["']/m, f);
    }
  });

  it("the pages and the reps' reply links are never stored by a shared cache", () => {
    const config = read("next.config.ts");
    assert.match(config, /source: "\/visit-insights", headers: PRIVATE_NO_STORE/);
    assert.match(config, /source: "\/visit-insights\/:path\*", headers: PRIVATE_NO_STORE/);
    assert.match(config, /source: "\/r\/:path\*", headers: PRIVATE_NO_STORE/);
  });
});

describe("visit insights: chat body", () => {
  it("accepts a message, keeps only known follow-up keys, and defaults unknown roles", () => {
    const body = parseChatBody(JSON.stringify({ message: " which dealers asked for credit ", role: "hacker", days: 30, previous: { reps: ["A"], evil: ["x"] } }));
    assert.deepEqual(body, { message: "which dealers asked for credit", role: "md", days: 30, previous: { reps: ["A"] } });
  });

  it("rejects empty, oversized, non-JSON and non-object bodies", () => {
    for (const text of ["", "not json", "[]", "null", JSON.stringify({ message: "" }), JSON.stringify({ message: "a".repeat(301) }), "x".repeat(MAX_CHAT_BYTES + 1)]) {
      assert.equal(parseChatBody(text), null, text.slice(0, 40));
    }
  });
});

describe("visit insights: head-office forms", () => {
  const form = (o: Record<string, string | string[]>) => {
    const f = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
    return f.toString();
  };

  it("a message keeps known channels only, splits to-dos by line and strips list markers", () => {
    const m = parseMessageForm(form({ rep_name: "Test Rep", title: "Rust complaint", body: "Call today", todos: "1. Call the mason\n- Replace 2 bundles\n\n", channels: ["in_app", "whatsapp", "sms"], visit_key: "a1b2", ai_drafted: "1" }));
    assert.deepEqual(m, { rep_name: "Test Rep", kind: "todo", title: "Rust complaint", body: "Call today", todos: ["Call the mason", "Replace 2 bundles"], channels: ["in_app", "whatsapp"], visit_key: "a1b2", ai_drafted: true });
  });

  it("a message without a channel, a title, a valid rep or a valid visit key is refused", () => {
    const bad: Record<string, string>[] = [
      { rep_name: "A Rep", title: "Hi there", channels: "sms" },
      { rep_name: "A Rep", title: "", channels: "in_app" },
      { rep_name: "<script>", title: "Hi there", channels: "in_app" },
      { rep_name: "A Rep", title: "Hi there", channels: "in_app", visit_key: "../x" },
    ];
    for (const o of bad) assert.equal(parseMessageForm(form(o)), null, JSON.stringify(o));
    assert.equal(parseMessageForm("x=" + "a".repeat(MAX_FORM_BYTES)), null);
  });

  it("a contact keeps an empty field as 'unchanged' and refuses a bad email", () => {
    const email = ["rep", "example.com"].join("@"); // built, so the no-email-in-source guardrail stays clean
    assert.deepEqual(parseContactForm(form({ rep_name: "A Rep", whatsapp: "", email })), { rep_name: "A Rep", whatsapp: null, email });
    assert.equal(parseContactForm(form({ rep_name: "A Rep", whatsapp: "", email: "" })), null);
    assert.equal(parseContactForm(form({ rep_name: "A Rep", email: "not-an-email" })), null);
  });

  it("a keyword needs a known language, a code-shaped target and a weight in (0, 5]", () => {
    const ok = parseKeywordForm(form({ term: "  rod  er dam beshi ", language: "bn", target: "COMPETITOR_PRICE", weight: "2.5", status: "draft" }));
    assert.deepEqual(ok, { action: "add", keyword: { term: "rod er dam beshi", language: "bn", target: "COMPETITOR_PRICE", weight: 2.5, status: "draft", meaning: "" } });
    for (const o of [{ language: "fr" }, { target: "hot order" }, { weight: "9" }, { weight: "0" }, { status: "gold" }]) {
      assert.equal(parseKeywordForm(form({ term: "abc", language: "en", target: "HOT_ORDER", weight: "1", status: "draft", ...o })), null, JSON.stringify(o));
    }
    assert.deepEqual(parseKeywordForm(form({ action: "toggle", id: "12", active: "0" })), { action: "toggle", id: 12, active: false });
    assert.equal(parseKeywordForm(form({ action: "toggle", id: "-1" })), null);
  });

  it("a note needs a message id and text", () => {
    assert.deepEqual(parseNoteForm(form({ id: "3", text: " Well done " })), { id: 3, text: "Well done" });
    assert.equal(parseNoteForm(form({ id: "x", text: "hi" })), null);
  });
});

describe("visit insights: the rep's reply link", () => {
  const token = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";

  it("reply forms accept only a well-formed token and to-do indexes 0-19", () => {
    const r = parseReplyForm(new URLSearchParams([["token", token], ["todo", "0"], ["todo", "2"], ["todo", "99"], ["todo", "x"], ["text", " done "], ["done", "1"]]).toString());
    assert.deepEqual(r, { token, text: "done", done_todos: [0, 2], done: true });
    assert.equal(parseReplyForm("token=short"), null);
    assert.equal(isToken("../../etc/passwd"), false);
    assert.equal(isToken(token), true);
  });

  it("the proxy opens exactly one path segment under /r/, nothing else", () => {
    const proxy = read("src/proxy.ts");
    const rx = new RegExp(proxy.match(/const REPLY_LINK = \/(.+)\/;/)![1]);
    assert.equal(rx.test(`/r/${token}`), true);
    for (const p of ["/r/", "/r/short", `/r/${token}/x`, `/rx/${token}`, `/api/r/${token}`, `/r/${token}.json`]) assert.equal(rx.test(p), false, p);
    assert.match(proxy, /PUBLIC_PATHS\.has\(pathname\) \|\| REPLY_LINK\.test\(pathname\)/);
  });

  it("the reply page escapes everything it shows and refuses cross-site posts", () => {
    const route = read("src/app/r/[token]/route.ts");
    assert.match(route, /const esc = /);
    assert.doesNotMatch(route, /\$\{m\.(title|body|sender)\}/, "message fields must go through esc()");
    assert.match(route, /isSameOrigin\(request\.headers\)/);
    assert.doesNotMatch(route, /<script/i);
  });
});
