import type { NextConfig } from "next";

/**
 * Response headers (checked on real responses by tests/e2e/response-headers.test.mts).
 *
 * These are hardening and cache hygiene only. They do not authenticate anyone or decide who may see what: the app has
 * no accounts, and its protection is the 127.0.0.1 bind plus the loopback Host check in src/proxy.ts.
 *
 * No script or style Content-Security-Policy yet: Next's prerendered pages carry inline bootstrap scripts, the pages
 * use inline `style` attributes, and a nonce cannot be added to prerendered HTML, so a restrictive policy would break
 * the app until it is designed and tested for the globe renderer too. The CSP below only holds directives that cannot
 * affect scripts, styles, images or requests. `Permissions-Policy` switches off the features the app never uses (it
 * uses WebGL and same-origin fetches only), and HSTS is left out because the prototype is plain http on loopback.
 */
const BASELINE_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nothing here needs the referrer, and the one outbound link (OpenStreetMap) is user-clicked.
  { key: "Referrer-Policy", value: "no-referrer" },
  // Clickjacking: the CSP directive is the standard; X-Frame-Options covers old browsers.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value:
      "accelerometer=(), autoplay=(), bluetooth=(), camera=(), display-capture=(), fullscreen=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), serial=(), usb=(), xr-spatial-tracking=()",
  },
];

/**
 * Pages and routes that carry the workbook (staff names on the workspace, territory figures on the Overview), its
 * derived boundary layer, or the rows of a selected globe block (POST /api/globe/block-rows). Next gives a prerendered
 * page `s-maxage=31536000`, which lets a shared cache keep a copy for a year; these must not be stored.
 */
const PRIVATE_NO_STORE = [{ key: "Cache-Control", value: "private, no-store" }];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      { source: "/:path*", headers: BASELINE_HEADERS },
      // The Overview shows workbook-derived territory figures (no staff names; see tests/e2e/overview-privacy.test.mts).
      { source: "/", headers: PRIVATE_NO_STORE },
      { source: "/workspace", headers: PRIVATE_NO_STORE },
      { source: "/globe", headers: PRIVATE_NO_STORE },
      { source: "/geo/:path*", headers: PRIVATE_NO_STORE },
      { source: "/api/:path*", headers: PRIVATE_NO_STORE },
    ];
  },
  // The Gate P0 data-free map preview was folded into the workspace. Old links
  // and bookmarks land on the one working map. Redirects are checked before
  // routes, so this holds whether or not the old route files are still on disk.
  async redirects() {
    return [
      { source: "/territory-map", destination: "/workspace", permanent: false },
      { source: "/territory-map/:path*", destination: "/workspace", permanent: false },
      // The globe started at /globe-prototype and is now at /globe. Temporary (307) while it is a local prototype.
      { source: "/globe-prototype", destination: "/globe", permanent: false },
      { source: "/globe-prototype/:path*", destination: "/globe", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
