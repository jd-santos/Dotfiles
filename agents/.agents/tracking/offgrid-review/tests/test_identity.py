#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Tests for review and export identity."""

from __future__ import annotations

import unittest

from offgrid_review.identity import (
    SCHEMA_VERSION,
    artifact_identity,
    browser_storage_key,
    canonical_json,
    stable_item_id,
)


class ArtifactIdentityTests(unittest.TestCase):
    def test_canonical_json_ignores_object_insertion_order(self) -> None:
        left = {"outer": {"b": 2, "a": 1}, "items": [3, 4]}
        right = {"items": [3, 4], "outer": {"a": 1, "b": 2}}

        self.assertEqual(canonical_json(left), canonical_json(right))

    def test_identity_changes_with_data_or_spec_but_keeps_review_namespace(self) -> None:
        spec = {"title": "Release Review", "queues": []}
        original = artifact_identity({"items": [1]}, spec)
        changed_data = artifact_identity({"items": [2]}, spec)
        changed_spec = artifact_identity(
            {"items": [1]}, {**spec, "subtitle": "Changed"}
        )

        self.assertEqual(original["schema_version"], SCHEMA_VERSION)
        self.assertEqual(original["review_id"], "release-review")
        self.assertNotEqual(
            original["artifact_fingerprint"], changed_data["artifact_fingerprint"]
        )
        self.assertNotEqual(
            original["artifact_fingerprint"], changed_spec["artifact_fingerprint"]
        )
        self.assertEqual(
            browser_storage_key(spec, original), "offgridReview:v1:release-review"
        )

    def test_explicit_review_id_and_storage_namespace_are_preserved(self) -> None:
        spec = {
            "title": "Ignored title",
            "review_id": "release-42",
            "storage_key": "hermesReview",
        }
        identity = artifact_identity({}, spec)

        self.assertEqual(identity["review_id"], "release-42")
        self.assertEqual(
            browser_storage_key(spec, identity), "hermesReview:v1:release-42"
        )

    def test_stable_item_id_requires_explicit_source_identity(self) -> None:
        self.assertEqual(stable_item_id({"id": "item-a", "path": "old"}), "item-a")
        self.assertEqual(
            stable_item_id([{"id": "left"}, {"id": "right"}]), "left::right"
        )
        self.assertIsNone(stable_item_id({"path": "mutable"}))
        self.assertIsNone(stable_item_id([{"id": "left"}, {"title": "right"}]))


if __name__ == "__main__":
    unittest.main()
