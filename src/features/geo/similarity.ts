/**
 * Ratcliff/Obershelp similarity, the algorithm behind Python's
 * `difflib.SequenceMatcher.ratio()` (without the junk heuristics, which only
 * apply to sequences of 200+ items). The earlier crosswalk audit used that
 * function with thresholds of 0.80 to 0.85, so this reproduces its scores.
 */

interface Block {
  a: number;
  b: number;
  size: number;
}

function longestMatch(
  a: string,
  b: string,
  alo: number,
  ahi: number,
  blo: number,
  bhi: number,
): Block {
  let bestA = alo;
  let bestB = blo;
  let bestSize = 0;
  // lengths[j] = length of the common run ending at a[i-1], b[j-1].
  let previous = new Array<number>(bhi - blo + 1).fill(0);
  for (let i = alo; i < ahi; i++) {
    const current = new Array<number>(bhi - blo + 1).fill(0);
    for (let j = blo; j < bhi; j++) {
      if (a[i] === b[j]) {
        const length = previous[j - blo] + 1;
        current[j - blo + 1] = length;
        // Strictly greater keeps the earliest block, as difflib does.
        if (length > bestSize) {
          bestA = i - length + 1;
          bestB = j - length + 1;
          bestSize = length;
        }
      }
    }
    previous = current;
  }
  return { a: bestA, b: bestB, size: bestSize };
}

function matchedChars(
  a: string,
  b: string,
  alo: number,
  ahi: number,
  blo: number,
  bhi: number,
): number {
  if (alo >= ahi || blo >= bhi) return 0;
  const block = longestMatch(a, b, alo, ahi, blo, bhi);
  if (block.size === 0) return 0;
  return (
    block.size +
    matchedChars(a, b, alo, block.a, blo, block.b) +
    matchedChars(a, b, block.a + block.size, ahi, block.b + block.size, bhi)
  );
}

/** 2 * matches / total length, in [0, 1]. Two empty strings score 1. */
export function similarityRatio(a: string, b: string): number {
  const total = a.length + b.length;
  if (total === 0) return 1;
  return (2 * matchedChars(a, b, 0, a.length, 0, b.length)) / total;
}
