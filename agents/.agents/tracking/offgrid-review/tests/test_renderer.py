#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Regression tests for the static Offgrid Review renderer."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from offgrid_review import renderer as review_console


ROOT = Path(__file__).parents[1]
EXAMPLES = ROOT / "skills" / "offgrid-review" / "examples"


def load_example(name: str) -> dict[str, object]:
    try:
        value = json.loads((EXAMPLES / name).read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise AssertionError(f"Could not load example {name}: {error}") from error
    assert isinstance(value, dict)
    return value


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
                    "description": "Check the workbench behavior.",
                }
            ],
        }

    def render(self) -> str:
        return review_console.render_html(self.data, self.spec)

    def test_renders_workbench_navigation_and_accessibility_structure(self) -> None:
        output = self.render()

        for marker in (
            'class="workspace"',
            'class="review-rail"',
            'class="review-main"',
            "class='decision-column'",
            'id="reviewSearch"',
            'id="queueFilter"',
            'id="stateFilter"',
            'id="prevUndecided"',
            'id="nextUndecided"',
            'id="themeSelect"',
            'aria-live="polite"',
            "<fieldset class='decision-panel'>",
            "prefers-reduced-motion",
            "function applyFilters()",
            "function moveToUnresolved(direction)",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, output)

    def test_uses_multi_select_by_default_and_single_select_only_when_declared(self) -> None:
        output = self.render()

        self.assertIn("data-selection-mode='multiple'", output)
        self.assertIn("class='action-input' type='checkbox'", output)
        self.assertIn("Select every compatible action.", output)

        self.spec["queues"][0]["selection_mode"] = "single"
        single_output = self.render()
        self.assertIn("data-selection-mode='single'", single_output)
        self.assertIn("class='action-input' type='radio'", single_output)
        self.assertIn("Choose one option.", single_output)

    def test_exports_multi_action_decisions_with_legacy_single_action_aliases(self) -> None:
        output = self.render()

        for marker in (
            "function normalizeDecision(entry)",
            "Array.isArray(entry.actions)",
            "action: actions.length === 1 ? actions[0].id : null",
            "label: actions.length === 1 ? actions[0].label : null",
            "decisions: entries.filter(entry => entry.actions.length > 0)",
            "annotations: entries",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, output)

    def test_embeds_risk_conflict_and_note_metadata(self) -> None:
        self.spec["queues"][0]["actions"].append(
            {
                "id": "close",
                "label": "Close",
                "risk": "high",
                "reversible": False,
                "requires_note": True,
                "conflicts_with": ["approve"],
            }
        )
        output = self.render()

        self.assertIn('"example_queue.close"', output)
        self.assertIn('"risk": "high"', output)
        self.assertIn('"reversible": false', output)
        self.assertIn('"requires_note": true', output)
        self.assertIn('"conflicts_with": ["approve"]', output)
        self.assertIn("class='action-option danger'", output)
        self.assertIn("function conflictPairs(entry)", output)

    def test_renders_granular_item_action_and_plan_section_notes(self) -> None:
        self.spec["queues"][0]["presentation"] = "plan"
        self.data["example_items"][0]["sections"] = [
            {
                "id": "flow",
                "title": "Review flow",
                "body": "Inspect evidence before selecting actions.",
                "kind": "diagram",
                "nodes": [
                    {"id": "inspect", "title": "Inspect"},
                    {"id": "decide", "title": "Decide"},
                ],
                "edges": [{"from": "Inspect", "to": "Decide"}],
            },
            {
                "id": "checks",
                "title": "Checks",
                "kind": "table",
                "columns": ["State", "Response"],
                "rows": [["Conflict", "Resolve before export"]],
            },
        ]
        output = self.render()

        for marker in (
            "class='plan-section'",
            "class='diagram-flow'",
            "class='review-table'",
            "data-note-target='item'",
            "data-note-target='action:approve'",
            "data-note-target='section:flow'",
            "data-count-target='section:flow'",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, output)

    def test_renders_nonmodal_summary_and_pre_export_validation(self) -> None:
        output = self.render()

        for marker in (
            'onclick="openSummary()"',
            'onclick="exportDecisions(\'download\')"',
            'id="summaryPanel"',
            'id="summaryBody"',
            'id="summaryWarning"',
            "function reviewSummary()",
            "function openSummary()",
            "function closeSummary()",
            "complete: !summary.incomplete",
            "valid: summary.conflicts === 0 && summary.missingRequiredNotes === 0",
            "warnings: summary.warnings",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, output)
        self.assertNotIn('aria-modal="true"', output)

    def test_applies_confirmed_palette_and_surviving_direction_contract(self) -> None:
        output = self.render()

        for marker in (
            "--canvas: #f8f6f7",
            "--blush: #f4d8e1",
            "--accent: #7a2e4d",
            "--canvas: #171316",
            "--accent: #f0a9c0",
            '--font-heading: "Trebuchet MS"',
            "--font-display: Georgia",
            "font-weight: 700",
            'data-theme="light"',
            'data-theme="dark"',
            "shape-pinned-review-workbench-v1",
            "unreviewed and undocumented is unfinished",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, output)

    def test_keeps_embedded_json_literal_and_neutralizes_script_closers(self) -> None:
        self.data["example_items"][0]["description"] = "</script><b>unsafe</b>"
        output = self.render()

        self.assertIn(r"<\/script><b>unsafe<\/b>", output)
        self.assertNotIn("</script><b>unsafe</b>", output)
        self.assertIn("JSON.parse(raw.textContent)", output)

    def test_sanitizes_the_allowed_svg_subset(self) -> None:
        source = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
          <title>Release path</title><desc>Three connected stages</desc>
          <g transform="translate(2 2)">
            <rect x="1" y="1" width="40" height="20" fill="none" stroke="currentColor" />
            <path d="M 42 11 L 80 11" fill="none" stroke="#7a2e4d" />
            <text x="4" y="15" fill="currentColor">Draft</text>
          </g>
        </svg>"""

        sanitized, error = review_console.sanitize_svg(source)

        self.assertIsNone(error)
        self.assertIsNotNone(sanitized)
        assert sanitized is not None
        self.assertIn("<title>Release path</title>", sanitized)
        self.assertIn('viewBox="0 0 120 60"', sanitized)
        self.assertNotIn("<script", sanitized)

    def test_rejects_unsafe_or_incomplete_svg(self) -> None:
        cases = {
            "script": '<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc><script /></svg>',
            "event": '<svg viewBox="0 0 1 1" onload="alert(1)"><title>T</title><desc>D</desc></svg>',
            "presentational role": '<svg viewBox="0 0 1 1" role="presentation"><title>T</title><desc>D</desc></svg>',
            "external image": '<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc><image href="https://example.com/a.png" /></svg>',
            "link": '<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc><a href="https://example.com" /></svg>',
            "animation": '<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc><animate attributeName="x" /></svg>',
            "filter": '<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc><filter /></svg>',
            "mask": '<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc><mask /></svg>',
            "pattern": '<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc><pattern /></svg>',
            "embedded html": '<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc><foreignObject /></svg>',
            "style": '<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc><path style="fill:url(http://x)" d="M0 0" /></svg>',
            "css url": '<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc><path fill="url(#paint)" d="M0 0" /></svg>',
            "namespace": '<svg viewBox="0 0 1 1" xmlns:x="https://example.com"><title>T</title><desc>D</desc><rect x:href="bad" /></svg>',
            "doctype": '<!DOCTYPE svg><svg viewBox="0 0 1 1"><title>T</title><desc>D</desc></svg>',
            "entity": '<!ENTITY x "bad"><svg viewBox="0 0 1 1"><title>T</title><desc>D</desc></svg>',
            "viewbox": '<svg><title>T</title><desc>D</desc></svg>',
            "title": '<svg viewBox="0 0 1 1"><desc>D</desc></svg>',
            "empty title": '<svg viewBox="0 0 1 1"><title></title><desc>D</desc></svg>',
            "description": '<svg viewBox="0 0 1 1"><title>T</title></svg>',
            "empty description": '<svg viewBox="0 0 1 1"><title>T</title><desc /></svg>',
        }

        for label, source in cases.items():
            with self.subTest(label=label):
                sanitized, error = review_console.sanitize_svg(source)
                self.assertIsNone(sanitized)
                self.assertIsNotNone(error)

    def test_enforces_svg_resource_limits(self) -> None:
        oversized_source = " " * (review_console.SVG_MAX_BYTES + 1)
        too_many_elements = (
            '<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc>'
            + "<g />" * review_console.SVG_MAX_ELEMENTS
            + "</svg>"
        )
        long_path = (
            '<svg viewBox="0 0 1 1"><title>T</title><desc>D</desc><path d="'
            + "M" * (review_console.SVG_MAX_PATH_LENGTH + 1)
            + '" /></svg>'
        )

        for label, source in {
            "source bytes": oversized_source,
            "element count": too_many_elements,
            "path data": long_path,
        }.items():
            with self.subTest(label=label):
                sanitized, error = review_console.sanitize_svg(source)
                self.assertIsNone(sanitized)
                self.assertIsNotNone(error)

    def test_renders_semantic_document_blocks_and_shared_decisions(self) -> None:
        self.data["plan"] = {
            "overview": {
                "title": "Proposal overview",
                "body": "Review the rollout plan.",
                "points": ["Offline", "Review before apply"],
            },
            "flow": {
                "title": "Delivery flow",
                "nodes": [
                    {"id": "draft", "title": "Draft"},
                    {"id": "review", "title": "Review"},
                ],
                "edges": [{"from": "draft", "to": "review"}],
            },
            "chart": {
                "title": "Review volume",
                "chart_type": "bar",
                "unit": " items",
                "values": [{"label": "Week 1", "value": 12}],
            },
        }
        self.spec["document_title"] = "Planning proposal"
        self.spec["blocks"] = [
            {"type": "overview", "id": "overview", "source": "plan.overview"},
            {"type": "flow", "id": "flow", "source": "plan.flow"},
            {"type": "chart", "id": "chart", "source": "plan.chart"},
            {
                "type": "decision",
                "id": "ship",
                "title": "Release decision",
                "actions": [{"id": "approve", "label": "Approve release"}],
            },
        ]
        output = self.render()

        for marker in (
            "class='queue document-review'",
            "class='document-block block-overview'",
            "class='document-visual flow-visual'",
            "class='document-visual chart-visual'",
            "<summary>Data table</summary>",
            "class='card document-decision'",
            '"document-review.approve"',
            "data-document-note",
            "function syncDocumentAnnotation(block)",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, output)

    def test_planning_demo_covers_every_semantic_block_type(self) -> None:
        data = load_example("review-plan-data.json")
        spec = load_example("review-plan-spec.json")

        output = review_console.render_html(data, spec)

        for marker in (
            "block-overview",
            "block-prose",
            "block-table",
            "flow-visual",
            "timeline-list",
            "dependency-visual",
            "chart-visual",
            "custom-svg-frame",
            "document-decision",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, output)

    def test_renders_sanitized_custom_svg_and_preserves_fallback(self) -> None:
        self.spec["blocks"] = [
            {
                "type": "svg",
                "id": "custom",
                "title": "Custom model",
                "svg": (
                    '<svg viewBox="0 0 100 40"><title>Model</title><desc>Two boxes</desc>'
                    '<rect x="1" y="1" width="98" height="38" fill="none" stroke="currentColor" />'
                    "</svg>"
                ),
                "fallback": "A bordered model region containing two conceptual stages.",
            }
        ]
        output = self.render()

        self.assertIn("class='custom-svg-frame'", output)
        self.assertIn("<summary>Text alternative</summary>", output)
        self.assertIn("A bordered model region", output)
        self.assertIn('"svg_source_omitted": true', output)
        self.assertNotIn("SVG could not be rendered", output)

    def test_rejected_svg_source_is_not_embedded_in_the_console(self) -> None:
        unsafe_url = "https://evil.invalid/payload.svg"
        self.spec["blocks"] = [
            {
                "type": "svg",
                "id": "unsafe",
                "title": "Unsafe model",
                "svg": (
                    '<svg viewBox="0 0 100 40"><title>Model</title><desc>Unsafe</desc>'
                    f'<image href="{unsafe_url}" /></svg>'
                ),
                "fallback": "A text-only explanation remains available.",
            }
        ]

        output = self.render()

        self.assertIn("SVG could not be rendered", output)
        self.assertIn("A text-only explanation remains available.", output)
        self.assertNotIn(unsafe_url, output)

    def test_refines_header_help_sidebar_metadata_and_risk_tone(self) -> None:
        self.data["counts"] = {"example_items": 1, "custom_metric": 3}
        self.spec["queues"][0]["actions"].append(
            {"id": "close", "label": "Close permanently", "risk": "high"}
        )
        output = self.render()

        self.assertIn('id="aboutTrigger"', output)
        self.assertIn('aria-label="About this review"', output)
        self.assertIn('role="tooltip"', output)
        self.assertIn('class="review-status">Review only</span>', output)
        self.assertIn('class="header-link"', output)
        self.assertNotIn('class="read-only-mark"', output)
        self.assertNotIn('<p class="subtitle">', output)
        self.assertIn("@media (max-width: 1280px)", output)
        self.assertIn("<summary>Review file details</summary>", output)
        header = output[output.index('<header class="app-header">') : output.index("</header>")]
        self.assertNotIn('id="themeSelect"', header)
        self.assertNotIn("<dt>example items</dt>", output)
        self.assertIn("<dt>custom metric</dt>", output)
        self.assertIn("background: var(--risk-surface)", output)
        self.assertIn("border-color: var(--risk-border)", output)

    def test_document_only_review_replaces_item_tools_with_a_responsive_toc(self) -> None:
        data = load_example("review-plan-data.json")
        spec = load_example("review-plan-spec.json")

        output = review_console.render_html(data, spec)

        for marker in (
            'class="review-rail document-only"',
            "<h2>On this page</h2>",
            "id='tocLauncher'",
            "aria-label='Open document contents'",
            "id='tocDrawer'",
            "href='#plan-review-overview'",
            "data-toc-target='plan-review-direction'",
            "aria-label='Document contents'",
            "function openContentsDrawer()",
            "function closeContentsDrawer(returnFocus = false)",
            "function updateDocumentToc()",
            "scheduleDocumentTocUpdate();",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, output)
        self.assertNotIn('<h2>Queues</h2>', output)
        self.assertNotIn('aria-modal="true"', output)
        self.assertNotIn('id="reviewSearch"', output)
        self.assertIn('id="themeSelect"', output)


if __name__ == "__main__":
    unittest.main()
