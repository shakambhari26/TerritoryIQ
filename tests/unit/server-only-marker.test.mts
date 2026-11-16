import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const SRC = path.join(ROOT, "src");

/**
 * The modules that read the generated workbook data are marked with Next's `import "server-only"`, so a client
 * component that reaches one, directly or through a chain, fails the build instead of shipping the module. Next resolves
 * the marker itself (no package is installed for it). Tests never import these two modules, which is why a bare marker
 * does not break `node --test`; they are checked here from source. The reachability rule (no `.server` module under a
 * `"use client"` file, even through a chain) is tests/unit/globe-names-on-demand.test.mts, "structure: client code
 * cannot reach the names-bearing manifest or its records".
 */
const MARKED = ["src/features/territory/dataset.server.ts", "src/features/globe/overlay.server.ts"];

function* sourceFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(file);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield file;
  }
}
const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("server-only marker on the modules that read the generated data", () => {
  for (const file of MARKED) {
    it(`${file} imports "server-only" as a real import, ahead of everything else`, () => {
      const code = withoutComments(readFileSync(path.join(ROOT, file), "utf8"));
      const firstImport = code.match(/^\s*import\b[^;\n]*/m)?.[0].trim();
      assert.match(firstImport ?? "", /^import\s+["']server-only["']$/);
    });
  }

  it("any importable module that reads data/generated is marked, so a new data module cannot skip the marker", () => {
    // Route handlers and pages are left out: nothing can import them from a client file, so they are server-only already.
    const entryPoint = /^src\/app\/.*\/(?:route\.ts|page\.tsx)$/;
    const readers = [...sourceFiles(SRC)]
      .filter((file) => /["']data["']\s*,\s*["']generated["']/.test(withoutComments(readFileSync(file, "utf8"))))
      .map(rel)
      .filter((file) => !entryPoint.test(file))
      .sort();
    assert.deepEqual(readers, [...MARKED].sort());
  });
});
