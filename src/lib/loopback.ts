/**
 * Loopback-only host check for the localhost prototype.
 *
 * The server is started with `-H 127.0.0.1`, which is the real boundary: nothing
 * outside this machine can open a connection. This check is a second layer. It
 * refuses a request whose `Host` header names anything other than the loopback
 * address, which blocks a DNS-rebinding page (a hostile site whose name resolves
 * to 127.0.0.1) from reading the app's data through the visitor's browser, and
 * a server accidentally started on all interfaces from being used by name or LAN
 * address. A client on the network can still forge the header, so it does not
 * replace the bind address and is not authentication.
 */

/** `localhost`, `127.0.0.1` or `[::1]`, optionally followed by a numeric port. Nothing else. */
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;

export function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return LOOPBACK_HOST.test(host.trim().toLowerCase());
}
