#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Generate the examples and ask Node.js to parse the embedded runtime."""

from __future__ import annotations

import json
import subprocess
import tempfile
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from offgrid_review import render_html

ROOT = Path(__file__).parents[1]
EXAMPLES = ROOT / "skills" / "offgrid-review" / "examples"


class _RuntimeScriptParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_runtime = False
        self.scripts: list[str] = []
        self._parts: list[str] = []

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        if tag != "script":
            return
        attributes = dict(attrs)
        self.in_runtime = attributes.get("type") is None
        self._parts = []

    def handle_data(self, data: str) -> None:
        if self.in_runtime:
            self._parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self.in_runtime:
            self.scripts.append("".join(self._parts))
            self.in_runtime = False


def load_json(name: str) -> dict[str, Any]:
    path = EXAMPLES / name
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"could not load {path}: {error}") from error
    if not isinstance(value, dict):
        raise TypeError(f"{name} must contain a JSON object")
    return value


def runtime_script(data_name: str, spec_name: str) -> str:
    parser = _RuntimeScriptParser()
    parser.feed(render_html(load_json(data_name), load_json(spec_name)))
    if len(parser.scripts) != 1:
        raise RuntimeError(f"expected one runtime script, found {len(parser.scripts)}")
    return parser.scripts[0]


def main() -> int:
    cases = (
        ("review-data.json", "review-spec.json"),
        ("review-plan-data.json", "review-plan-spec.json"),
    )
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        for index, (data_name, spec_name) in enumerate(cases):
            path = root / f"runtime-{index}.js"
            path.write_text(runtime_script(data_name, spec_name), encoding="utf-8")
            subprocess.run(["node", "--check", str(path)], check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
