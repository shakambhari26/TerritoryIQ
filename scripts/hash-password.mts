/**
 * npm run auth:hash-password
 *
 * Asks for a password (typed input is not shown), and prints the TERRITORYIQ_PASSWORD_HASH value for it plus a fresh
 * random TERRITORYIQ_SESSION_SECRET. Paste both into the host's environment variables (see src/lib/auth.ts).
 * The password itself is never printed, stored or sent anywhere.
 */
import { randomBytes } from "node:crypto";
import { stdin, stdout } from "node:process";
import { hashPassword } from "../src/lib/auth.ts";

const MIN_LENGTH = 12;

function ask(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      // Piped input: read the first line.
      let data = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => (data += chunk));
      stdin.on("end", () => resolve(data.split(/\r?\n/)[0] ?? ""));
      stdin.on("error", reject);
      return;
    }
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const password = await ask("Password for TerritoryIQ sign-in: ");
if (password.length < MIN_LENGTH) {
  console.error(`Use at least ${MIN_LENGTH} characters.`);
  process.exit(1);
}
if (stdin.isTTY) {
  const again = await ask("Type it again: ");
  if (again !== password) {
    console.error("The two entries do not match.");
    process.exit(1);
  }
}

console.log("\nSet these on the host (keep them out of git):\n");
console.log(`TERRITORYIQ_PASSWORD_HASH=${hashPassword(password)}`);
console.log(`TERRITORYIQ_SESSION_SECRET=${randomBytes(32).toString("base64url")}`);
console.log("TERRITORYIQ_USERNAME=<the sign-in name you choose>");
