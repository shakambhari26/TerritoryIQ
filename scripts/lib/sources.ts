import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The four source files under data-source/ and the SHA-256 values recorded for
 * them in docs/data-audit (workbook inventory, crosswalk review, README
 * provenance). Nothing in this project writes to that folder; these hashes are
 * how that is checked.
 */

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SOURCE_DIR = path.join(ROOT, "data-source");

export interface SourceSpec {
  key: "workbook" | "lgdDistricts" | "lgdBlocks" | "readme";
  file: string;
  sha256: string;
  /** Where the value was recorded. */
  recordedIn: string;
}

export const SOURCES: readonly SourceSpec[] = [
  {
    key: "workbook",
    file: "AREA MAPPING.xlsx",
    sha256: "85c7f6a02370562d0e38286f592a71014a61a365e68e9cb05dc10eac22295fe3",
    recordedIn: "docs/data-audit/workbook-inventory.md, section 1",
  },
  {
    key: "lgdDistricts",
    file: "LGD_West_Bengal_Districts_2026-10-15.xls",
    sha256: "6bfb026b79c85e7c171297c001dacc0f3df61422e28f0442818c222632591ce8",
    recordedIn: "data-source/README_provenance.txt",
  },
  {
    key: "lgdBlocks",
    file: "LGD_West_Bengal_Development_Blocks_with_Covered_Villages_2026-10-15.xls",
    sha256: "e266d8141fbcb2870d757f3cbbb4650e8ace1e553887c9bbb84444eb95fc3a36",
    recordedIn: "data-source/README_provenance.txt",
  },
  {
    key: "readme",
    file: "README_provenance.txt",
    sha256: "4e46ee0fc5333805a0bdcc139d55ceb4b5c9b8147792f945379384650343279b",
    recordedIn: "docs/data-audit/geographic-crosswalk-review.md, section 4.1",
  },
];

export function sourcePath(spec: SourceSpec): string {
  return path.join(SOURCE_DIR, spec.file);
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

export function sha256Buffer(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export interface SourceCheck {
  spec: SourceSpec;
  actual: string | null;
  bytes: number | null;
  ok: boolean;
}

export async function checkSources(): Promise<SourceCheck[]> {
  const results: SourceCheck[] = [];
  for (const spec of SOURCES) {
    try {
      const file = sourcePath(spec);
      const [actual, info] = await Promise.all([sha256File(file), stat(file)]);
      results.push({ spec, actual, bytes: info.size, ok: actual === spec.sha256 });
    } catch {
      results.push({ spec, actual: null, bytes: null, ok: false });
    }
  }
  return results;
}
