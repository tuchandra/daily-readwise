# version.py
# Set the version key of package.json and manifest.json to the script argument.
# Usage: bun version 1.0.0-beta2

import json
import sys
from pathlib import Path

def main(version: str):
    repo_root = Path(__file__).parent.parent
    for f in (repo_root / "manifest.json", repo_root / "package.json"):
        data = {**json.loads(f.read_text()), "version": version}
        f.write_text(json.dumps(data, indent=2))

if __name__ == "__main__":
    main(sys.argv[1])