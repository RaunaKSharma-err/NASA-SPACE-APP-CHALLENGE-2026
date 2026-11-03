"""Stdlib CLI.  python -m app.cli build-package REGION_ID --version 1 [--processed-dir DIR]"""
import argparse
import json
import sys
from pathlib import Path

from app.services.offline import build_manifest, verify_manifest


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build-package", help="write manifest.json (SHA-256 per file) for a region folder")
    b.add_argument("region_id")
    b.add_argument("--version", required=True)
    b.add_argument("--processed-dir", default="../data/processed")
    v = sub.add_parser("verify-package")
    v.add_argument("region_id")
    v.add_argument("--processed-dir", default="../data/processed")
    a = p.parse_args(argv)
    folder = Path(a.processed_dir) / a.region_id
    if not folder.is_dir():
        print(f"error: {folder} does not exist", file=sys.stderr)
        return 2
    if a.cmd == "build-package":
        files = [f.name for f in folder.iterdir() if f.is_file() and f.name != "manifest.json"]
        if not files:
            print("error: no files to package", file=sys.stderr)
            return 2
        m = build_manifest(a.region_id, a.version, folder, files)
        (folder / "manifest.json").write_text(json.dumps(m, indent=2))
        print(f"wrote manifest for {len(files)} file(s)")
        return 0
    problems = verify_manifest(json.loads((folder / "manifest.json").read_text()), folder)
    print("OK" if not problems else "\n".join(problems))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
