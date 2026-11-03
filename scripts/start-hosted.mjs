/**
 * npm run start:hosted: the production server for a host such as Railway.
 *
 * This is the one place the app listens on all interfaces, because a hosted platform's edge has to reach it. It
 * refuses to start unless sign-in is fully configured (the three TERRITORYIQ_* variables in src/lib/auth.ts), so a
 * hosted server can never come up without a password in front of the data. `npm run start` still binds 127.0.0.1.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED = ["TERRITORYIQ_USERNAME", "TERRITORYIQ_PASSWORD_HASH", "TERRITORYIQ_SESSION_SECRET"];
const missing = REQUIRED.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  console.error(`Refusing to start on all interfaces without sign-in. Missing: ${missing.join(", ")}.`);
  console.error("Run `npm run auth:hash-password` locally and set the values on the host.");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
const port = process.env.PORT || "3000";
const child = spawn(process.execPath, [next, "start", "-H", "0.0.0.0", "-p", port], { cwd: root, stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
