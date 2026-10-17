/**
 * The app's network guard, as a function, so the repository check and its own tests use the same rule.
 *
 * The rule: the app may make same-origin `fetch` requests from an explicit list of files, each to one literal
 * relative URL declared as `const LAYER_URL = "...";`, with exactly one `fetch(LAYER_URL, ...)` in the file. Nothing
 * else in `src/` may call `fetch`, open an XHR, a WebSocket, an EventSource, send a beacon or ask for a location.
 * (External addresses in source text are checked separately, in local-boundary.test.mts and globe-guards.test.mts.)
 * A new endpoint is allowed only by adding its file and exact URL to the list, which is a change to the tests, so it
 * is visible in review.
 */

export interface AllowedFetch {
  /** Repo-relative path with forward slashes. */
  file: string;
  /** The one same-origin URL this file may request, exactly as its literal reads. */
  url: string;
}

/** Everything that can reach beyond the page. `fetch` is allowed only through the list. */
export const NETWORK_PATTERN = /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|\bEventSource\b|sendBeacon|navigator\.geolocation/;
const OTHER_CHANNELS = /XMLHttpRequest|\bWebSocket\b|\bEventSource\b|sendBeacon|navigator\.geolocation/;

/** Violations of the guard across `sources` (repo-relative path to file text). Empty when it holds. */
export function networkViolations(sources: Record<string, string>, allowed: readonly AllowedFetch[]): string[] {
  const problems: string[] = [];
  const allow = new Map(allowed.map((a) => [a.file, a.url]));
  for (const [file, text] of Object.entries(sources)) {
    const url = allow.get(file);
    if (!NETWORK_PATTERN.test(text)) continue;
    if (url === undefined) {
      problems.push(`${file}: makes or can make a network request and is not on the allowed list`);
      continue;
    }
    if (OTHER_CHANNELS.test(text)) problems.push(`${file}: uses XHR, a socket, an event stream, a beacon or geolocation`);
    const declared = text.match(/const LAYER_URL = "([^"]*)";/);
    if (!declared) problems.push(`${file}: the URL is not one literal constant named LAYER_URL`);
    else if (declared[1] !== url) problems.push(`${file}: requests ${declared[1]}, not ${url}`);
    if (!/^\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(url)) problems.push(`${file}: the allowed URL ${url} is not a plain same-origin path`);
    if ((text.match(/\bfetch\s*\(/g) ?? []).length !== 1) problems.push(`${file}: does not hold exactly one fetch`);
    if (!/fetch\(LAYER_URL,/.test(text)) problems.push(`${file}: the fetch does not use LAYER_URL`);
  }
  return problems;
}
