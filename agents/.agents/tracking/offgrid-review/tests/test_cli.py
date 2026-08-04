#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Tests for the Offgrid Review command-line interface."""

from __future__ import annotations

import io
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from offgrid_review import cli


ROOT = Path(__file__).parents[1]
EXAMPLES = ROOT / "skills" / "offgrid-review" / "examples"


class OffgridReviewCliTests(unittest.TestCase):
    def test_generates_review_and_prints_output_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "nested" / "review.html"
            stdout = io.StringIO()

            with redirect_stdout(stdout):
                exit_code = cli.main(
                    [
                        "--data",
                        str(EXAMPLES / "review-data.json"),
                        "--spec",
                        str(EXAMPLES / "review-spec.json"),
                        "--out",
                        str(output),
                    ]
                )

            self.assertEqual(exit_code, 0)
            self.assertEqual(stdout.getvalue().strip(), str(output))
            self.assertIn("Offgrid Review", output.read_text())

    def test_writes_default_spec_to_explicit_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            spec_path = Path(directory) / "nested" / "review-spec.json"
            stdout = io.StringIO()

            with redirect_stdout(stdout):
                exit_code = cli.main(
                    ["--write-default-spec", "--spec", str(spec_path)]
                )

            self.assertEqual(exit_code, 0)
            self.assertEqual(stdout.getvalue().strip(), str(spec_path))
            self.assertIn('"queues"', spec_path.read_text())

    def test_missing_input_returns_error_without_traceback(self) -> None:
        stderr = io.StringIO()

        with redirect_stderr(stderr):
            exit_code = cli.main(
                ["--data", "missing-data.json", "--spec", "missing-spec.json"]
            )

        self.assertEqual(exit_code, 2)
        self.assertIn("could not read data", stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())

    def test_invalid_json_returns_error_without_writing_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data_path = root / "data.json"
            spec_path = root / "spec.json"
            output = root / "review.html"
            data_path.write_text("{not json}")
            spec_path.write_text("{}")
            stderr = io.StringIO()

            with redirect_stderr(stderr):
                exit_code = cli.main(
                    [
                        "--data",
                        str(data_path),
                        "--spec",
                        str(spec_path),
                        "--out",
                        str(output),
                    ]
                )

            self.assertEqual(exit_code, 2)
            self.assertIn("invalid JSON", stderr.getvalue())
            self.assertFalse(output.exists())

    def test_json_root_must_be_an_object(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data_path = root / "data.json"
            spec_path = root / "spec.json"
            data_path.write_text("[]")
            spec_path.write_text("{}")
            stderr = io.StringIO()

            with redirect_stderr(stderr):
                exit_code = cli.main(
                    ["--data", str(data_path), "--spec", str(spec_path)]
                )

            self.assertEqual(exit_code, 2)
            self.assertIn("must contain a JSON object", stderr.getvalue())

    def test_version_comes_from_installed_distribution(self) -> None:
        self.assertEqual(cli.package_version(), "0.1.0")


if __name__ == "__main__":
    unittest.main()
