# SPDX-License-Identifier: GPL-3.0-or-later
"""Artifact identity and safe JSON serialization."""

from __future__ import annotations

import hashlib
import json
import re
from importlib.metadata import PackageNotFoundError, version
from typing import Any

SCHEMA_VERSION = 1
DISTRIBUTION_NAME = "offgrid-review"


def package_version() -> str:
    """Return the installed generator version."""
    try:
        return version(DISTRIBUTION_NAME)
    except PackageNotFoundError:
        return "unknown"


def slugify(text: str) -> str:
    """Return a stable lowercase slug."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "review"


def canonical_json(value: Any) -> str:
    """Serialize JSON deterministically for identity calculations."""
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def fingerprint(value: Any) -> str:
    """Return a labeled SHA-256 fingerprint for a JSON-compatible value."""
    digest = hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def artifact_identity(data: dict[str, Any], spec: dict[str, Any]) -> dict[str, Any]:
    """Build the identity shared by HTML, browser state, and exports."""
    data_fingerprint = fingerprint(data)
    spec_fingerprint = fingerprint(spec)
    artifact_fingerprint = fingerprint(
        {
            "schema_version": SCHEMA_VERSION,
            "data_fingerprint": data_fingerprint,
            "spec_fingerprint": spec_fingerprint,
        }
    )
    review_id = str(spec.get("review_id") or slugify(str(spec.get("title", "review"))))
    return {
        "schema_version": SCHEMA_VERSION,
        "generator_version": package_version(),
        "review_id": review_id,
        "data_fingerprint": data_fingerprint,
        "spec_fingerprint": spec_fingerprint,
        "artifact_fingerprint": artifact_fingerprint,
    }


def browser_storage_key(spec: dict[str, Any], identity: dict[str, Any]) -> str:
    """Return a stable namespace whose envelope detects changed artifacts."""
    namespace = str(spec.get("storage_key") or "offgridReview")
    return f"{namespace}:v{SCHEMA_VERSION}:{identity['review_id']}"


def script_json(value: Any) -> str:
    """Encode JSON safely inside an HTML script raw-text element."""
    return (
        json.dumps(value, ensure_ascii=False)
        .replace("&", "\\u0026")
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


def stable_item_id(item: Any) -> str | None:
    """Return the explicit source identity used for persistence and export."""
    if isinstance(item, dict):
        value = item.get("id")
        return str(value).strip() if value is not None and str(value).strip() else None
    if isinstance(item, list) and len(item) >= 2 and all(isinstance(part, dict) for part in item):
        identifiers = [str(part.get("id", "")).strip() for part in item]
        if all(identifiers):
            return "::".join(identifiers)
    return None
