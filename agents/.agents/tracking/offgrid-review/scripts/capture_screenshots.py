#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Generate the README screenshots with a local Chrome installation."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills" / "offgrid-review"
GENERATOR = SKILL / "scripts" / "review_console.py"
DEFAULT_OUTPUT = ROOT / "docs" / "images"

CHROME_CANDIDATES = (
    Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
    Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files/Chromium/Application/chrome.exe"),
)


def find_chrome(explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit).expanduser()
        if path.is_file():
            return path
        raise SystemExit(f"Chrome executable not found: {path}")

    for command in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        resolved = shutil.which(command)
        if resolved:
            return Path(resolved)

    for candidate in CHROME_CANDIDATES:
        if candidate.is_file():
            return candidate

    raise SystemExit("Chrome or Chromium is required. Pass its path with --chrome.")


def generate(data_name: str, spec_name: str, output: Path) -> None:
    subprocess.run(
        [
            sys.executable,
            str(GENERATOR),
            "--data",
            str(SKILL / "scripts" / data_name),
            "--spec",
            str(SKILL / "scripts" / spec_name),
            "--out",
            str(output),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )


def prepare_page(source: Path, output: Path, theme: str, open_contents: bool = False) -> None:
    text = source.read_text()
    marker = "initializeTheme();"
    if marker not in text:
        raise SystemExit(f"Theme initialization marker missing from {source}")
    text = text.replace(marker, f"setTheme('{theme}');", 1)

    if open_contents:
        script = "<script>document.getElementById('tocLauncher')?.click();</script>"
        text = text.replace("</body>", f"{script}</body>", 1)

    output.write_text(text)


def capture(chrome: Path, page: Path, output: Path, width: int, height: int) -> None:
    result = subprocess.run(
        [
            str(chrome),
            "--headless",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            "--virtual-time-budget=1200",
            f"--window-size={width},{height}",
            f"--screenshot={output}",
            page.resolve().as_uri(),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode:
        raise SystemExit(result.stderr.strip() or f"Chrome exited with {result.returncode}")
    if not output.is_file() or output.stat().st_size < 1024:
        raise SystemExit(f"Screenshot was not created correctly: {output}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chrome", help="Path to Chrome or Chromium")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    chrome = find_chrome(args.chrome)
    output_dir = args.output.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="offgrid-review-screenshots-") as temp:
        work = Path(temp)
        queue = work / "queue.html"
        plan = work / "plan.html"
        generate("review-data.example.json", "review-spec.example.json", queue)
        generate("review-plan-data.example.json", "review-plan-spec.example.json", plan)

        variants = (
            (queue, "queue-light.html", "queue-review-light.png", "light", False, 1440, 900),
            (plan, "plan-dark.html", "planning-review-dark.png", "dark", False, 1440, 900),
            (plan, "mobile-dark.html", "mobile-review-dark.png", "dark", False, 500, 900),
            (plan, "mobile-contents.html", "mobile-contents-dark.png", "dark", True, 500, 900),
        )

        for source, page_name, image_name, theme, contents, width, height in variants:
            page = work / page_name
            prepare_page(source, page, theme, contents)
            destination = output_dir / image_name
            capture(chrome, page, destination, width, height)
            print(destination.relative_to(ROOT) if destination.is_relative_to(ROOT) else destination)


if __name__ == "__main__":
    main()
