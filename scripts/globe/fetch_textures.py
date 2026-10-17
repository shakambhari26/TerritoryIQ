"""One-time fetch and preparation of the globe prototype's Earth textures.

Run with the isolated flag, from anywhere:

    python -I scripts/globe/fetch_textures.py --raw-dir <new empty dir> [--skip-download]

What it does
  1. Downloads two NASA Earth Observatory files from assets.science.nasa.gov (the current host of NASA
     Visible Earth content). The request carries a generic User-Agent and nothing else about the user,
     the machine or the workbook. No other host is contacted.
  2. Records the SHA-256 of each downloaded file.
  3. Derives the files the app serves from public/globe/: an 8192 x 4096 day texture, a 1200 x 1200 native-resolution crop over eastern India, the 2048 x 1024 cloud
     map as a greyscale JPEG, and an ocean mask derived from the day texture's colour.
  4. Writes scripts/globe/texture-manifest.json (sources, hashes, derivation) and prints it.

The app never runs this. At run time the browser loads only the same-origin files in public/globe/.
Needs Pillow and NumPy (build-time only; they are not project dependencies).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

USER_AGENT = "TerritoryIQ-local-prototype/0.1"
HOST = "assets.science.nasa.gov"

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "public" / "globe"
MANIFEST = Path(__file__).resolve().parent / "texture-manifest.json"

BASE = f"https://{HOST}/content/dam/science/esd/eo"
SOURCES = {
    "day": {
        "url": f"{BASE}/images/bmng/bmng-topography-bathymetry/july/world.topo.bathy.200407.3x21600x10800.jpg",
        "page": "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry",
        "title": "Blue Marble: Next Generation with Topography and Bathymetry, July (2004 composite), 21600 x 10800",
        "credit": "NASA Earth Observatory (Reto Stockli, NASA Goddard Space Flight Center); data from MODIS",
        "file": "world.topo.bathy.200407.3x21600x10800.jpg",
    },
    "clouds": {
        "url": f"{BASE}/content-feature/bluemarble/images/cloud_combined_2048.jpg",
        "page": "https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/",
        "title": "Blue Marble (2001-2002) global cloud composite, cloud_combined_2048",
        "credit": "NASA Earth Observatory (Reto Stockli, NASA Goddard Space Flight Center)",
        "file": "cloud_combined_2048.jpg",
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, target: Path) -> None:
    from urllib.parse import urlparse

    if urlparse(url).hostname != HOST:
        raise SystemExit(f"refusing to contact {url}")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=300) as response, target.open("wb") as handle:  # noqa: S310
        while chunk := response.read(1 << 20):
            handle.write(chunk)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", required=True, type=Path)
    parser.add_argument("--skip-download", action="store_true", help="reuse files already in --raw-dir")
    args = parser.parse_args()

    from PIL import Image
    import numpy as np

    Image.MAX_IMAGE_PIXELS = 300_000_000
    raw: Path = args.raw_dir
    raw.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    retrieved = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    if args.skip_download and MANIFEST.exists():
        # Re-deriving from files already downloaded: keep the original retrieval time.
        retrieved = json.loads(MANIFEST.read_text(encoding="utf-8"))["retrievedAt"]

    manifest: dict = {"retrievedAt": retrieved, "userAgent": USER_AGENT, "sources": {}, "derived": {}}
    if MANIFEST.exists():
        # The outline-data record is kept by hand next to the textures; re-deriving the textures must not drop it.
        kept = json.loads(MANIFEST.read_text(encoding="utf-8")).get("outlineData")
        if kept is not None:
            manifest["outlineData"] = kept
    for key, source in SOURCES.items():
        target = raw / source["file"]
        if not args.skip_download:
            download(source["url"], target)
        with Image.open(target) as image:
            size = list(image.size)
            mode = image.mode
        manifest["sources"][key] = {**source, "bytes": target.stat().st_size, "sha256": sha256(target), "pixels": size, "mode": mode}

    # Day texture: Lanczos downsample to 8192 x 4096. Equirectangular, longitude -180..180 left to right.
    with Image.open(raw / SOURCES["day"]["file"]) as image:
        if list(image.size) != [21600, 10800]:
            raise SystemExit(f"unexpected day texture size {image.size}")
        day = image.convert("RGB").resize((8192, 4096), Image.LANCZOS)
    day.save(OUT_DIR / "earth-day-8k.jpg", quality=88, optimize=True, progressive=True)
    # A 4096 x 2048 variant for GPUs or devices that cannot hold the 8k texture.
    day.resize((4096, 2048), Image.LANCZOS).save(OUT_DIR / "earth-day-4k.jpg", quality=88, optimize=True, progressive=True)

    # Cloud map: greyscale (white = cloud), kept at the source size.
    with Image.open(raw / SOURCES["clouds"]["file"]) as image:
        clouds = image.convert("L")
    clouds.save(OUT_DIR / "earth-clouds.jpg", quality=90, optimize=True)

    # Ocean mask derived from colour (white = open water). Used only for the sun glint on the sea.
    small = np.asarray(day.resize((2048, 1024), Image.LANCZOS)).astype(np.int16)
    red, green, blue = small[..., 0], small[..., 1], small[..., 2]
    ocean = ((blue - red) > 14) & (blue >= green - 4)
    mask = Image.fromarray((ocean * 255).astype(np.uint8), "L")
    from PIL import ImageFilter

    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    mask.save(OUT_DIR / "earth-ocean-mask.png", optimize=True)

    for name, how in {
        "earth-day-8k.jpg": "Lanczos downsample of the 21600 x 10800 day image to 8192 x 4096, JPEG quality 88 progressive",
        "earth-day-4k.jpg": "the 8192 x 4096 day texture resampled (Lanczos) to 4096 x 2048, JPEG quality 88 progressive; used when the GPU or device cannot hold the 8k texture",
        "earth-clouds.jpg": "cloud_combined_2048.jpg converted to 8-bit greyscale, JPEG quality 90",
        "earth-ocean-mask.png": "day image at 2048 x 1024; ocean where (blue - red) > 14 and blue >= green - 4; Gaussian blur radius 1.2; greyscale PNG",
    }.items():
        path = OUT_DIR / name
        with Image.open(path) as image:
            manifest["derived"][name] = {"how": how, "bytes": path.stat().st_size, "sha256": sha256(path), "pixels": list(image.size)}

    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    if sys.flags.isolated != 1:
        print("warning: run with python -I", file=sys.stderr)
    main()
