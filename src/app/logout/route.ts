import { connection } from "next/server";
import { clearedSessionCookie } from "@/lib/auth";

/**
 * POST /logout: clears the session cookie and returns to the sign-in page. POST only, so a link or an image on
 * another site cannot sign anyone out. The cookie carries no server-side state, so there is nothing else to revoke;
 * changing TERRITORYIQ_SESSION_SECRET signs out every browser at once.
 */
export async function POST(request: Request) {
  await connection();
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/login",
      "Cache-Control": "no-store",
      "Set-Cookie": clearedSessionCookie(request.headers.get("host")),
    },
  });
}
