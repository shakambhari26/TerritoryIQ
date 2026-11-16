/** Preview an uploaded sheet: what applying it would change. A same-origin POST of `{ file }` to the literal `/api/globe/team/preview`. */

import type { UploadPreview } from "../team-types";

const PREVIEW_URL = "/api/globe/team/preview";

export async function previewSheet(file: string, signal?: AbortSignal): Promise<UploadPreview> {
  const response = await fetch(PREVIEW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file }),
    signal,
    cache: "no-store",
  });
  if (response.status === 401) throw new Error("Your sign-in has expired. Reload the page to sign in again.");
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new Error(typeof message === "string" && message.length < 300 ? message : "That did not work. Try again.");
  }
  return body as UploadPreview;
}
