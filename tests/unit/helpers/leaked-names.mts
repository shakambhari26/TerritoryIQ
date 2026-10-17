/**
 * Whether staff names appear in a piece of text, for the tests that prove a response or a payload carries none.
 *
 * It matches each name as written, as JSON text, with HTML escaping, and in any letter case, and returns only HOW
 * MANY names matched. A test built on it can fail without printing a name, so real names never reach a test log.
 */
export function leakedNames(text: string, names: readonly string[]): number {
  const haystack = text.toLowerCase();
  const htmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  let found = 0;
  for (const name of names) {
    const variants = [name, JSON.stringify(name).slice(1, -1), htmlEscape(name), name.replace(/\s+/g, " ").trim()];
    if (variants.some((v) => v.length > 0 && haystack.includes(v.toLowerCase()))) found++;
  }
  return found;
}
