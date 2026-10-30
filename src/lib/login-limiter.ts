/**
 * In-memory brake on password guessing at POST /login. Per client address: 10 failures in 15 minutes locks that
 * address out until the window passes. Across all addresses: 100 failures in 15 minutes locks sign-in for everyone,
 * so spreading guesses over many addresses does not help much either. A success clears that address's count.
 *
 * It lives in one server process and resets on restart, which is enough for a single Railway instance. More than one
 * instance would need a shared store.
 */

const WINDOW_MS = 15 * 60 * 1000;
const PER_CLIENT_LIMIT = 10;
const GLOBAL_LIMIT = 100;
const MAX_TRACKED_CLIENTS = 10_000;

const failures = new Map<string, number[]>();
let globalFailures: number[] = [];

const recent = (times: number[], now: number) => times.filter((t) => now - t < WINDOW_MS);

export function isLockedOut(client: string, now = Date.now()): boolean {
  globalFailures = recent(globalFailures, now);
  if (globalFailures.length >= GLOBAL_LIMIT) return true;
  return recent(failures.get(client) ?? [], now).length >= PER_CLIENT_LIMIT;
}

export function recordFailure(client: string, now = Date.now()): void {
  if (failures.size >= MAX_TRACKED_CLIENTS) {
    for (const [key, times] of failures) if (recent(times, now).length === 0) failures.delete(key);
  }
  failures.set(client, [...recent(failures.get(client) ?? [], now), now]);
  globalFailures.push(now);
}

export function recordSuccess(client: string): void {
  failures.delete(client);
}

/** Test hook. */
export function resetLoginLimiter(): void {
  failures.clear();
  globalFailures = [];
}

/** The client address as the platform's edge reports it. Railway sets X-Real-IP and X-Forwarded-For. */
export function clientAddress(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
