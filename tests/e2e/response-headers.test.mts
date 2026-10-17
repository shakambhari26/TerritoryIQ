import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { startServer, type Server } from "./harness.mts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/**
 * Response headers on the real production server (`npm run build` first; no browser and no dataset needed, so it
 * runs whether or not `data:build` has been run). Next gives a prerendered page `s-maxage=31536000`, which a shared
 * cache may keep for a year; the pages and routes that carry workbook data must say `private, no-store` instead.
 * These headers are hygiene, not access control: nothing here authenticates a visitor.
 *
 * The tests read headers only. They never print or compare a response body to workbook content.
 */
const skip = existsSync(path.join(ROOT, ".next", "BUILD_ID")) ? false : "run `npm run build` first";

const SENSITIVE_PAGES = ["/", "/workspace", "/globe"];
/** Present with the dataset (200) or without it (404 "not built"): the headers must not depend on which. */
const SENSITIVE_ROUTES = ["/geo/boundaries.json", "/geo/globe-boundaries.json"];

describe("response headers on the production server", { skip }, () => {
  let server: Server;
  before(async () => {
    server = await startServer();
  });
  after(async () => {
    await server?.stop();
  });

  const url = (urlPath: string) => `${server.baseUrl}${urlPath}`;

  /** The baseline every response carries, whatever the path or status. */
  function assertBaseline(headers: Headers, label: string) {
    assert.equal(headers.get("x-content-type-options"), "nosniff", `${label}: nosniff`);
    assert.equal(headers.get("referrer-policy"), "no-referrer", `${label}: referrer policy`);
    assert.equal(headers.get("x-frame-options"), "DENY", `${label}: X-Frame-Options`);
    const csp = headers.get("content-security-policy") ?? "";
    assert.match(csp, /(^|;\s*)frame-ancestors 'none'(;|$)/, `${label}: frame-ancestors`);
    const permissions = headers.get("permissions-policy") ?? "";
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
      assert.match(permissions, new RegExp(`(^|, )${feature}=\\(\\)`), `${label}: permissions policy turns off ${feature}`);
    }
  }

  /** No shared-cache lifetime of any kind, and an explicit refusal to store. */
  function assertPrivateNoStore(headers: Headers, label: string) {
    const cacheControl = headers.get("cache-control") ?? "";
    assert.equal(cacheControl, "private, no-store", `${label}: Cache-Control was "${cacheControl}"`);
    assert.doesNotMatch(cacheControl, /s-maxage|max-age|public|stale-while-revalidate/, `${label}: no cache lifetime`);
  }

  for (const urlPath of [...SENSITIVE_PAGES, ...SENSITIVE_ROUTES]) {
    it(`${urlPath}: private, no-store plus the security baseline`, async () => {
      const response = await fetch(url(urlPath));
      assert.ok(response.status === 200 || (urlPath.startsWith("/geo/") && response.status === 404), `${urlPath} answered ${response.status}`);
      await response.arrayBuffer();
      assertPrivateNoStore(response.headers, urlPath);
      assertBaseline(response.headers, urlPath);
    });
  }

  it("a data-free geo response keeps its JSON type; with data it is JSON too", async () => {
    for (const urlPath of SENSITIVE_ROUTES) {
      const response = await fetch(url(urlPath));
      await response.arrayBuffer();
      assert.match(response.headers.get("content-type") ?? "", /^application\/json/, urlPath);
    }
  });

  it("the page's RSC payload and its prefetch variants (the same data as the HTML) are private, no-store", async () => {
    // Next answers an RSC request lacking the `_rsc` hash with a 307 to the URL that has it; fetch follows it.
    for (const urlPath of SENSITIVE_PAGES) {
      for (const extra of [{} as Record<string, string>,{ "Next-Router-Prefetch": "1", "Next-Router-Segment-Prefetch": "/_tree" }, { "Next-Router-Prefetch": "1", "Next-Router-Segment-Prefetch": "/_full" }]) {
        const label = `${urlPath} RSC ${JSON.stringify(extra)}`;
        const response = await fetch(url(urlPath), { headers: { RSC: "1", ...extra } });
        await response.arrayBuffer();
        assert.equal(response.status, 200, label);
        assert.match(response.headers.get("content-type") ?? "", /^text\/x-component/, `${label}: this is the RSC payload, not HTML`);
        assertPrivateNoStore(response.headers, label);
        assertBaseline(response.headers, label);
      }
    }
  });

  it("the sensitive pages no longer advertise the one-year shared-cache lifetime", async () => {
    for (const urlPath of [...SENSITIVE_PAGES, ...SENSITIVE_ROUTES]) {
      const response = await fetch(url(urlPath));
      await response.arrayBuffer();
      assert.doesNotMatch(response.headers.get("cache-control") ?? "", /31536000/, urlPath);
    }
  });

  it("/ is still the working Overview", async () => {
    const response = await fetch(url("/"));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
    const html = await response.text();
    assert.match(html, /Territory Overview/);
  });

  it("the other pages are still served as HTML", async () => {
    for (const [urlPath, title] of [["/workspace", "Territory Workspace"], ["/globe", "Globe"]]) {
      const response = await fetch(url(urlPath));
      assert.equal(response.status, 200, urlPath);
      assert.match(await response.text(), new RegExp(title), urlPath);
    }
  });

  it("static assets keep their own immutable policy (the no-store rule is not applied to them)", async () => {
    const html = await (await fetch(url("/"))).text();
    const asset = html.match(/\/_next\/static\/[^"'\s\\]+\.(?:js|css)/)?.[0];
    assert.ok(asset, "the page links a static script or stylesheet");
    const response = await fetch(url(asset));
    await response.arrayBuffer();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /immutable/);
    assertBaseline(response.headers, asset);
  });

  it("a missing path and the favicon carry the baseline but are not forced to no-store", async () => {
    const missing = await fetch(url("/no-such-page"));
    await missing.arrayBuffer();
    assert.equal(missing.status, 404);
    assertBaseline(missing.headers, "/no-such-page");
    assert.doesNotMatch(missing.headers.get("cache-control") ?? "", /s-maxage/);
    const icon = await fetch(url("/icon.svg"));
    await icon.arrayBuffer();
    assertBaseline(icon.headers, "/icon.svg");
    assert.notEqual(icon.headers.get("cache-control"), "private, no-store");
  });

  describe("the loopback Host check is unchanged", () => {
    /** A GET with an explicit Host header, which `fetch` does not allow. */
    const get = (urlPath: string, host: string) =>
      new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
        const target = new URL(url(urlPath));
        const request = http.request({ hostname: target.hostname, port: target.port, path: urlPath, method: "GET", headers: { Host: host } }, (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (c: Buffer) => chunks.push(c));
          response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
        });
        request.on("error", reject);
        request.end();
      });

    const port = () => new URL(server.baseUrl).port;

    it("refuses a non-loopback Host on every sensitive path with the fixed message, no-store and no page content", async () => {
      for (const urlPath of [...SENSITIVE_PAGES, ...SENSITIVE_ROUTES]) {
        for (const host of ["evil.example", `evil.example:${port()}`, "localhost.evil.example", "127.0.0.1.evil.example", "192.168.1.5"]) {
          const refused = await get(urlPath, host);
          assert.equal(refused.status, 403, `${urlPath} with Host "${host}"`);
          assert.equal(refused.headers["cache-control"], "no-store", `${urlPath}: the refusal is never cached`);
          assert.match(refused.body, /^TerritoryIQ is a localhost-only prototype\./);
          assert.doesNotMatch(refused.body, /<html|Territory Overview|Territory Workspace/);
        }
      }
    });

    it("still answers localhost, 127.0.0.1 and [::1] hosts, with and without a port", async () => {
      for (const urlPath of ["/", "/workspace", "/globe"]) {
        for (const host of ["localhost", `localhost:${port()}`, "127.0.0.1", `127.0.0.1:${port()}`, "[::1]", `[::1]:${port()}`, "LOCALHOST"]) {
          const served = await get(urlPath, host);
          assert.equal(served.status, 200, `${urlPath} with Host ${host}`);
          assert.equal(served.headers["cache-control"], "private, no-store", `${urlPath} with Host ${host}`);
        }
      }
    });
  });
});
