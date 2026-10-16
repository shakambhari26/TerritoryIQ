/**
 * Fails if the production build output contains the abstract test fixture.
 *
 * Gate P0 requires that fixtures are "excluded from production". The fixture
 * is imported only inside a non-production branch of a development-only route,
 * so a production build must drop it. This scan proves it: it looks in the
 * files a deployment serves or runs (`.next/static`, `.next/server`) for the
 * fixture's dataset ID and every unit label.
 *
 * Run after `npm run build`:  npm run verify:build
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FIXTURE_LAYER } from "../tests/fixtures/abstract-layer.ts";

/** Strings that exist only in the fixture and must never appear in a build. */
export function fixtureMarkers(layer = FIXTURE_LAYER) {
  return [...new Set([layer.datasetId, ...layer.features.map((f) => f.label)])];
}

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

/**
 * Returns every `{ file, marker }` where a marker appears in a file under
 * `directories`, and how many files were read (so an empty scan is visible).
 */
export function findLeaks(directories, markers) {
  const leaks = [];
  let filesScanned = 0;
  for (const directory of directories) {
    if (!existsSync(directory)) continue;
    for (const file of walk(directory)) {
      const content = readFileSync(file);
      filesScanned += 1;
      for (const marker of markers) {
        if (content.includes(marker)) leaks.push({ file, marker });
      }
    }
  }
  return { leaks, filesScanned };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const next = join(root, ".next");
  if (!existsSync(join(next, "BUILD_ID"))) {
    console.error("verify:build: no production build found (.next/BUILD_ID is missing). Run `npm run build` first.");
    process.exit(2);
  }

  const markers = fixtureMarkers();
  const { leaks, filesScanned } = findLeaks([join(next, "static"), join(next, "server")], markers);

  if (filesScanned === 0) {
    console.error("verify:build: scanned 0 files, so the result proves nothing.");
    process.exit(2);
  }
  if (leaks.length > 0) {
    console.error(`verify:build: FAILED. The test fixture is present in the build output:`);
    for (const { file, marker } of leaks) console.error(`  ${file}  contains  ${JSON.stringify(marker)}`);
    process.exit(1);
  }
  console.log(`verify:build: OK. ${filesScanned} files scanned, none contain any of ${markers.length} fixture markers.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
