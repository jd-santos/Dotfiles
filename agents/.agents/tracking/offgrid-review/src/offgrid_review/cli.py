# SPDX-License-Identifier: GPL-3.0-or-later
"""Command-line interface for Offgrid Review."""

from __future__ import annotations

import argparse
import json
import sys
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any, Sequence

from .renderer import default_spec, render_html

DEFAULT_DATA = Path("review-data.json")
DEFAULT_SPEC = Path("review-spec.json")
DEFAULT_OUT = Path("review-console.html")


class CliError(Exception):
    """An expected command-line failure that should not show a traceback."""


def package_version() -> str:
    """Return the installed distribution version."""
    try:
        return version("offgrid-review")
    except PackageNotFoundError:
        return "unknown"


def build_parser() -> argparse.ArgumentParser:
    """Create the public argument parser."""
    parser = argparse.ArgumentParser(
        prog="offgrid-review",
        description="Generate a static Offgrid Review artifact from data and a review spec.",
    )
    parser.add_argument(
        "--data", type=Path, default=DEFAULT_DATA, help="Path to deterministic data JSON."
    )
    parser.add_argument(
        "--spec", type=Path, default=DEFAULT_SPEC, help="Path to the review spec JSON."
    )
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output HTML path.")
    parser.add_argument(
        "--write-default-spec",
        action="store_true",
        help="Write the example spec and exit.",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {package_version()}",
    )
    return parser


def load_json(path: Path, label: str) -> dict[str, Any]:
    """Read one JSON object with a concise user-facing error."""
    try:
        with path.open("r", encoding="utf-8") as file:
            value = json.load(file)
    except OSError as error:
        raise CliError(f"could not read {label} from {path}: {error}") from error
    except json.JSONDecodeError as error:
        raise CliError(f"invalid JSON in {label} file {path}: {error}") from error

    if not isinstance(value, dict):
        raise CliError(f"{label} file must contain a JSON object: {path}")
    return value


def write_default_spec(path: Path) -> None:
    """Write the built-in starter specification to an explicit path."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(default_spec(), indent=2) + "\n", encoding="utf-8")
    except OSError as error:
        raise CliError(f"could not write default spec to {path}: {error}") from error


def generate(data_path: Path, spec_path: Path, output_path: Path) -> None:
    """Load inputs and write one generated review artifact."""
    data = load_json(data_path, "data")
    spec = load_json(spec_path, "spec")
    document = render_html(data, spec)

    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(document, encoding="utf-8")
    except OSError as error:
        raise CliError(f"could not write review artifact to {output_path}: {error}") from error


def main(argv: Sequence[str] | None = None) -> int:
    """Run the CLI and return a process exit code."""
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.write_default_spec:
            write_default_spec(args.spec)
            print(args.spec)
            return 0

        generate(args.data, args.spec, args.out)
        print(args.out)
        return 0
    except CliError as error:
        print(f"{parser.prog}: error: {error}", file=sys.stderr)
        return 2
