#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Tests for path-aware review input validation."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from typing import Any

from offgrid_review.validation import MAX_QUEUES, ReviewValidationError, validate_review

ROOT = Path(__file__).parents[1]
EXAMPLES = ROOT / "skills" / "offgrid-review" / "examples"


def load_example(name: str) -> dict[str, object]:
    value = json.loads((EXAMPLES / name).read_text(encoding="utf-8"))
    assert isinstance(value, dict)
    return value


class ReviewValidationTests(unittest.TestCase):
    def assert_invalid(
        self, data: dict[str, Any], spec: dict[str, Any], marker: str
    ) -> None:
        with self.assertRaisesRegex(ReviewValidationError, marker):
            validate_review(data, spec)

    def test_accepts_queue_and_document_examples(self) -> None:
        validate_review(
            load_example("review-data.json"), load_example("review-spec.json")
        )
        validate_review(
            load_example("review-plan-data.json"),
            load_example("review-plan-spec.json"),
        )

    def test_requires_a_queue_or_document_block(self) -> None:
        self.assert_invalid({}, {}, r"spec: requires at least one queue")

    def test_reports_queue_container_and_source_types(self) -> None:
        self.assert_invalid({}, {"queues": "bad"}, r"spec\.queues")
        self.assert_invalid(
            {"items": {}},
            {
                "queues": [
                    {
                        "id": "queue",
                        "source": "items",
                        "actions": [{"id": "keep", "label": "Keep"}],
                    }
                ]
            },
            r"data\.items: expected an array",
        )

    def test_requires_stable_unique_item_ids(self) -> None:
        spec = {
            "queues": [
                {
                    "id": "queue",
                    "source": "items",
                    "actions": [{"id": "keep", "label": "Keep"}],
                }
            ]
        }
        with self.assertRaises(ReviewValidationError) as context:
            validate_review(
                {"items": [{"path": "mutable"}, {"id": "same"}, {"id": "same"}]},
                spec,
            )

        message = str(context.exception)
        self.assertIn("requires a non-empty id", message)
        self.assertIn('duplicate item ID "same"', message)

    def test_rejects_duplicate_ids_and_unknown_conflicts(self) -> None:
        spec = {
            "global_actions": [{"id": "defer", "label": "Defer"}],
            "queues": [
                {
                    "id": "queue",
                    "source": "items",
                    "actions": [
                        {
                            "id": "keep",
                            "label": "Keep",
                            "conflicts_with": ["missing"],
                        },
                        {"id": "keep", "label": "Duplicate"},
                        {"id": "defer", "label": "Collision"},
                    ],
                }
            ],
        }
        with self.assertRaises(ReviewValidationError) as context:
            validate_review({"items": [{"id": "one"}]}, spec)

        message = str(context.exception)
        self.assertIn('duplicate action ID "keep"', message)
        self.assertIn('unknown action ID "missing"', message)
        self.assertIn("collides with a global action", message)

    def test_rejects_invalid_document_sources_and_block_types(self) -> None:
        spec = {
            "blocks": [
                {"id": "missing", "type": "prose", "source": "plan.missing"},
                {"id": "unknown", "type": "dashboard"},
            ]
        }
        with self.assertRaises(ReviewValidationError) as context:
            validate_review({"plan": {}}, spec)

        message = str(context.exception)
        self.assertIn('data path "plan.missing" does not exist', message)
        self.assertIn("spec.blocks[1].type", message)

    def test_rejects_oversized_queue_collections(self) -> None:
        queues = [
            {
                "id": f"queue-{index}",
                "source": f"items-{index}",
                "actions": [{"id": "keep", "label": "Keep"}],
            }
            for index in range(MAX_QUEUES + 1)
        ]
        data = {f"items-{index}": [] for index in range(MAX_QUEUES + 1)}

        self.assert_invalid(
            data,
            {"queues": queues},
            rf"must not contain more than {MAX_QUEUES} entries",
        )

    def test_rejects_reserved_export_metadata(self) -> None:
        self.assert_invalid(
            {"items": [{"id": "one"}]},
            {
                "payload_meta": {"schema_version": 99},
                "queues": [
                    {
                        "id": "queue",
                        "source": "items",
                        "actions": [{"id": "keep", "label": "Keep"}],
                    }
                ],
            },
            r'reserved field "schema_version"',
        )


if __name__ == "__main__":
    unittest.main()
