# SPDX-License-Identifier: GPL-3.0-or-later
"""Command-line interface for Offgrid Review."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Sequence

from .identity import package_version
from .rendering import default_spec, render_html
from .validation import ReviewValidationError

DEFAULT_DATA = Path("review-data.json")
DEFAULT_SPEC = Path("review-spec.json")
DEFAULT_OUT = Path("review-console.html")
MAX_JSON_BYTES = 25 * 1024 * 1024


class CliError(Exception):
    """An expected command-line failure that should not show a traceback."""


def reject_json_constant(value: str) -> None:
    """Reject non-standard NaN and infinity constants accepted by json.load."""
    raise ValueError(f"non-standard numeric constant {value}")


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
        "--force",
        action="store_true",
        help="Replace an existing file when writing the default spec.",
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
        size = path.stat().st_size
        if size > MAX_JSON_BYTES:
            raise CliError(
                f"{label} file exceeds the {MAX_JSON_BYTES:,}-byte limit: {path}"
            )
        with path.open("r", encoding="utf-8") as file:
            value = json.load(file, parse_constant=reject_json_constant)
    except OSError as error:
        raise CliError(f"could not read {label} from {path}: {error}") from error
    except (json.JSONDecodeError, ValueError) as error:
        raise CliError(f"invalid JSON in {label} file {path}: {error}") from error
    except RecursionError as error:
        raise CliError(f"{label} JSON is nested too deeply: {path}") from error

    if not isinstance(value, dict):
        raise CliError(f"{label} file must contain a JSON object: {path}")
    return value


def write_default_spec(path: Path, *, force: bool = False) -> None:
    """Write the built-in starter specification without accidental replacement."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        mode = "w" if force else "x"
        with path.open(mode, encoding="utf-8") as file:
            file.write(json.dumps(default_spec(), indent=2) + "\n")
    except FileExistsError as error:
        raise CliError(
            f"default spec already exists: {path}; pass --force to replace it"
        ) from error
    except OSError as error:
        raise CliError(f"could not write default spec to {path}: {error}") from error


def generate(data_path: Path, spec_path: Path, output_path: Path) -> None:
    """Load inputs and write one generated review artifact."""
    data = load_json(data_path, "data")
    spec = load_json(spec_path, "spec")
    try:
        document = render_html(data, spec)
    except ReviewValidationError as error:
        raise CliError(str(error)) from error

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
            write_default_spec(args.spec, force=args.force)
            print(args.spec)
            return 0
        if args.force:
            raise CliError("--force is only valid with --write-default-spec")

        generate(args.data, args.spec, args.out)
        print(args.out)
        return 0
    except CliError as error:
        print(f"{parser.prog}: error: {error}", file=sys.stderr)
        return 2
