import { checkSources } from "./lib/sources.ts";

/** Compares the four files in data-source/ with their recorded SHA-256 values. */
const results = await checkSources();
let failed = false;
for (const { spec, actual, bytes, ok } of results) {
  failed ||= !ok;
  console.log(`${ok ? "OK      " : "MISMATCH"}  ${spec.file}`);
  console.log(`          recorded ${spec.sha256}   (${spec.recordedIn})`);
  console.log(`          actual   ${actual ?? "file not readable"}${bytes === null ? "" : `   ${bytes} bytes`}`);
}
console.log(failed ? "\nSource verification FAILED." : "\nAll four source files match their recorded hashes.");
process.exit(failed ? 1 : 0);
