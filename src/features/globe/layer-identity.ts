/**
 * The identity of the globe's own outline file, shared by the server check (layer-integrity.ts) and the browser
 * join (layer-merge.ts). The same two words are written by scripts/globe/build_overlay.py.
 */

/** File name under data/generated/, and the key of the file's record in the manifest's `meta.inputs`. */
export const GLOBE_LAYER_FILE = "globe-boundaries.json";

/** `meta.kind` of that file. The workspace's layer has no such kind, so it can never pass for it. */
export const GLOBE_LAYER_KIND = "globe-validated-outlines";
