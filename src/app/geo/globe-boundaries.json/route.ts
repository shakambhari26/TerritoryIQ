import path from "node:path";
import { connection } from "next/server";
import { globeLayerResponse, readGlobeLayerFile } from "@/features/globe/layer-integrity";
import { getGlobeManifest } from "@/features/globe/overlay.server";

/**
 * Serves the globe prototype's own outline file, `data/generated/globe-boundaries.json`: exactly the outlines that
 * passed validation in scripts/globe/build_overlay.py, and only while the bytes still match the SHA-256 and dataset
 * identity that the validated manifest recorded. The workspace's `/geo/boundaries.json` route and file are separate
 * and unchanged. The file lives in `data/generated/` (server only), never in `public/`, so this handler is the only
 * way to it, after `src/proxy.ts` has accepted the request's host.
 *
 * The file is read and checked on every request, so a file that goes missing or is altered while the server runs is
 * refused (404 or 500 with a code and no data) rather than served from a cached copy.
 */
export async function GET() {
  await connection();
  return globeLayerResponse(await readGlobeLayerFile(path.join(process.cwd(), "data", "generated"), getGlobeManifest()));
}
