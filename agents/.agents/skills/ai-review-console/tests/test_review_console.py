#!/usr/bin/env python3
"""Regression tests for the static AI Review Console renderer."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "review_console.py"
SPEC = importlib.util.spec_from_file_location("review_console", SCRIPT)
assert SPEC and SPEC.loader
review_console = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(review_console)


class ReviewConsoleRenderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.spec = review_console.default_spec()
        self.data = {
            "date": "2026-08-01",
            "counts": {"pending": 1},
            "example_items": [
                {
                    "id": "item-1",
                    "title": "Review navigation",
                    "status": "pending",
                    "priority": "high",
                }
            ],
        }

    def test_renders_review_navigation_and_accessibility_states(self) -> None:
        output = review_console.render_html(self.data, self.spec)

        for marker in (
            'id="reviewSearch"',
            'id="queueFilter"',
            'id="stateFilter"',
            'id="prevUndecided"',
            'id="nextUndecided"',
            "aria-pressed='false'",
            'aria-live="polite"',
            "prefers-reduced-motion",
            "function applyFilters()",
            "function moveToUndecided(direction)",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, output)

    def test_action_state_updates_aria_pressed(self) -> None:
        output = review_console.render_html(self.data, self.spec)

        self.assertIn("b.setAttribute('aria-pressed', String(selected))", output)
        self.assertIn("b.setAttribute('aria-pressed','false')", output)

    def test_embeds_action_specs_with_risk_metadata(self) -> None:
        self.data["example_items"] = [
            {"id": "item-1", "title": "Review navigation", "status": "pending"}
        ]
        spec = review_console.default_spec()
        spec["queues"][0]["actions"].append(
            {"id": "close", "label": "Close", "risk": "high", "reversible": False, "requires_note": True}
        )
        output = review_console.render_html(self.data, spec)

        self.assertIn('"example_queue.close"', output)
        self.assertIn('"risk": "high"', output)
        self.assertIn('"reversible": false', output)
        self.assertIn('"requires_note": true', output)

    def test_renders_review_summary_and_pre_export_validation(self) -> None:
        spec = review_console.default_spec()
        spec["queues"][0]["actions"].append(
            {"id": "close", "label": "Close", "risk": "high", "reversible": False, "requires_note": True}
        )
        output = review_console.render_html(self.data, spec)

        for marker in (
            'onclick="openSummary()"',
            'onclick="exportDecisions(\'download\')"',
            'id="summaryModal"',
            'id="summaryBody"',
            'id="summaryWarning"',
            "function reviewSummary()",
            "function openSummary()",
            "function closeSummary()",
            "function jumpTo(which)",
            "complete: !(forceExport ? false : s.incomplete)",
            "warnings: s.incomplete || s.highRisk || s.irreversibleNoNote ? s.warnings : []",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, output)

    def test_card_uses_detail_list_and_action_classes(self) -> None:
        """Information is a quiet key/value list; actions are explicit buttons,
        and high-risk/irreversible actions get a distinct danger treatment."""
        spec = review_console.default_spec()
        spec["queues"][0]["actions"].append(
            {"id": "close", "label": "Close", "risk": "high", "reversible": False, "requires_note": True}
        )
        output = review_console.render_html(self.data, spec)

        self.assertIn("<dl class='details'>", output)
        self.assertIn("<div class='detail", output)
        self.assertIn("class='action primary'", output)
        self.assertIn("class='action primary danger'", output)
        self.assertIn("class='action ghost'", output)
        # old chip/circle affordances are gone from rendered markup
        self.assertNotIn("class='property'", output)
        self.assertNotIn("class='property-strip'", output)
        self.assertNotIn("class='property-primary'", output)
        self.assertNotIn("class='choice-dot'", output)


if __name__ == "__main__":
    unittest.main()
