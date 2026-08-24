#!/usr/bin/env python3
"""
Download a local pool of portrait/face photos from Pexels for offline use
in the Caricature Practice Trainer.

The API key is used ONLY here, locally, at download time. It is never read
by index.html/app.js and never gets committed or deployed anywhere -- the
web app only ever loads the already-downloaded jpgs and faces/images.json.

Usage:
    echo 'PEXELS_API_KEY=your-key-here' > .env   # once, at the project root
    python3 tools/download_pexels.py --count 300

Get a free key at https://www.pexels.com/api/ (no cost, generous free tier).

Re-running this script is safe: it resumes, skipping photos it has already
downloaded (tracked by Pexels photo id in faces/images.json), and appends
new ones until --count total images are on disk.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("Missing dependency. Run: pip install requests")

API_URL = "https://api.pexels.com/v1/search"
PER_PAGE = 80  # Pexels max per page

# Caricature practice needs a face looking straight at the camera, so every
# query is phrased toward front-on headshots rather than profile/candid shots
# that only show part of the face.
DEFAULT_QUERIES = [
    "portrait face looking at camera",
    "headshot facing camera",
    "front facing portrait",
    "close up face portrait",
    "studio headshot",
    "smiling headshot front view",
    "id photo portrait",
    "man portrait looking at camera",
    "woman portrait looking at camera",
    "elderly portrait facing camera",
]

# Pexels' avg_color for a photo is a near-neutral gray when the photo itself
# is black-and-white; a real color photo's channels spread out much more.
GRAYSCALE_CHANNEL_SPREAD = 12


def is_grayscale(hex_color):
    if not hex_color or not hex_color.startswith("#"):
        return False
    hex_color = hex_color.lstrip("#")
    try:
        r, g, b = (int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
    except (ValueError, IndexError):
        return False
    return max(r, g, b) - min(r, g, b) <= GRAYSCALE_CHANNEL_SPREAD


def load_existing(faces_dir: Path):
    manifest_path = faces_dir / "images.json"
    if manifest_path.exists():
        with open(manifest_path, "r") as f:
            entries = json.load(f)
    else:
        entries = []
    seen_ids = {e["id"] for e in entries if "id" in e}
    next_num = 1
    for e in entries:
        stem = Path(e["file"]).stem
        if stem.startswith("face_") and stem[5:].isdigit():
            next_num = max(next_num, int(stem[5:]) + 1)
    return entries, seen_ids, next_num


def fetch_page(session, api_key, query, page, orientation):
    resp = session.get(
        API_URL,
        headers={"Authorization": api_key},
        params={
            "query": query,
            "per_page": PER_PAGE,
            "page": page,
            "orientation": orientation,
        },
        timeout=30,
    )
    if resp.status_code == 429:
        retry_after = int(resp.headers.get("Retry-After", "5"))
        print(f"  Rate limited, waiting {retry_after}s...")
        time.sleep(retry_after)
        return fetch_page(session, api_key, query, page, orientation)
    resp.raise_for_status()
    return resp.json()


def download_photo(session, url, dest_path):
    resp = session.get(url, stream=True, timeout=30)
    resp.raise_for_status()
    with open(dest_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)


def load_dotenv_key(project_root: Path):
    """Read PEXELS_API_KEY=... from a .env file at the project root, if present."""
    env_path = project_root / ".env"
    if not env_path.exists():
        return None
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key.strip() == "PEXELS_API_KEY":
            return value.strip().strip('"').strip("'")
    return None


def main():
    project_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-key", default=os.environ.get("PEXELS_API_KEY") or load_dotenv_key(project_root),
                         help="Pexels API key (defaults to PEXELS_API_KEY env var, then a .env file)")
    parser.add_argument("--count", type=int, default=300, help="Total images to have on disk (default: 300)")
    parser.add_argument("--out", default=None, help="Output directory (default: ../faces relative to this script)")
    parser.add_argument("--orientation", default="portrait", choices=["portrait", "landscape", "square"],
                         help="Photo orientation to search for (default: portrait)")
    parser.add_argument("--size", default="large",
                         choices=["original", "large2x", "large", "medium", "small", "portrait", "tiny"],
                         help="Pexels image size variant to download (default: large, ~650px tall, "
                              "sharp enough to fill a desktop screen)")
    parser.add_argument("--queries", default=None,
                         help="Comma-separated search terms (default: a built-in diverse set)")
    parser.add_argument("--delay", type=float, default=0.4, help="Seconds to sleep between requests (default: 0.4)")
    args = parser.parse_args()

    if not args.api_key:
        sys.exit("No API key. Pass --api-key or set PEXELS_API_KEY. Get one free at https://www.pexels.com/api/")

    faces_dir = Path(args.out) if args.out else project_root / "faces"
    faces_dir.mkdir(parents=True, exist_ok=True)

    queries = [q.strip() for q in args.queries.split(",")] if args.queries else DEFAULT_QUERIES

    entries, seen_ids, next_num = load_existing(faces_dir)
    print(f"Found {len(entries)} existing images. Target total: {args.count}.")

    session = requests.Session()
    pages_per_query = {q: 1 for q in queries}
    exhausted = set()

    while len(entries) < args.count and len(exhausted) < len(queries):
        for query in queries:
            if len(entries) >= args.count or query in exhausted:
                continue

            page = pages_per_query[query]
            print(f"Searching '{query}' page {page}...")
            try:
                data = fetch_page(session, args.api_key, query, page, args.orientation)
            except requests.RequestException as e:
                print(f"  Request failed: {e}")
                exhausted.add(query)
                continue

            photos = data.get("photos", [])
            if not photos:
                exhausted.add(query)
                continue
            pages_per_query[query] += 1

            for photo in photos:
                if len(entries) >= args.count:
                    break
                pid = photo["id"]
                if pid in seen_ids:
                    continue
                if is_grayscale(photo.get("avg_color")):
                    continue
                seen_ids.add(pid)

                src = photo["src"].get(args.size) or photo["src"]["original"]
                filename = f"face_{next_num:04d}.jpg"
                dest = faces_dir / filename
                try:
                    download_photo(session, src, dest)
                except requests.RequestException as e:
                    print(f"  Failed to download photo {pid}: {e}")
                    continue

                photographer = photo.get("photographer", "unknown")
                entries.append({
                    "file": filename,
                    "id": pid,
                    "credit": f"Photo by {photographer} on Pexels",
                    "photographer_url": photo.get("photographer_url", ""),
                    "pexels_url": photo.get("url", ""),
                })
                next_num += 1
                print(f"  Saved {filename} ({len(entries)}/{args.count})")
                time.sleep(args.delay)

            if not data.get("next_page"):
                exhausted.add(query)

    with open(faces_dir / "images.json", "w") as f:
        json.dump(entries, f, indent=2)

    credits_lines = ["# Photo Credits\n", "All photos courtesy of [Pexels](https://www.pexels.com) photographers.\n"]
    for e in entries:
        credits_lines.append(f"- `{e['file']}` — {e['credit']} ({e.get('pexels_url', '')})")
    with open(faces_dir / "CREDITS.md", "w") as f:
        f.write("\n".join(credits_lines) + "\n")

    print(f"\nDone. {len(entries)} images in {faces_dir}/")
    if len(entries) < args.count:
        print("Note: ran out of results before reaching --count. Try adding more --queries or lowering --count.")


if __name__ == "__main__":
    main()
