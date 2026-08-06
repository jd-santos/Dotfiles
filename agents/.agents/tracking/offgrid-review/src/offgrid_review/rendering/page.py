# SPDX-License-Identifier: GPL-3.0-or-later OR Apache-2.0
"""Assemble one licensed, offline review artifact."""

from __future__ import annotations

import datetime as dt
import html
import re
from importlib import resources
from typing import Any

from ..identity import artifact_identity, browser_storage_key, script_json, slugify
from ..validation import validate_review
from .document import (
    materialize_block,
    render_document_blocks,
    render_document_toc,
)
from .queue import render_cards

_PAGE_TOKEN_RE = re.compile(r"@@([A-Z_]+)@@")
_SCRIPT_TOKEN_RE = re.compile(r"__([A-Z_]+)__")


def _resource_text(name: str) -> str:
    return resources.files("offgrid_review.resources").joinpath(name).read_text(
        encoding="utf-8"
    )


def _substitute(template: str, pattern: re.Pattern[str], values: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in values:
            raise ValueError(f"template token {key} has no value")
        return values[key]

    return pattern.sub(replace, template)


def _output_license() -> str:
    return _resource_text("output-license.txt").rstrip().replace("--", "- -")


def default_spec() -> dict[str, Any]:
    """Return a starter queue specification."""
    return {
        "title": "Offgrid Review",
        "subtitle": (
            "Review the evidence, select every compatible action, and export "
            "decision JSON. Nothing is changed from this page."
        ),
        "global_actions": [
            {
                "id": "defer",
                "label": "Defer for later",
                "description": "Leave the item unresolved for a future review.",
                "exclusive": True,
            },
            {
                "id": "needs_human",
                "label": "Needs another reviewer",
                "description": "Route the item to a person with more context.",
                "exclusive": True,
            },
            {
                "id": "ignore",
                "label": "No action needed",
                "description": "Record that the item was reviewed without follow-up.",
                "exclusive": True,
            },
        ],
        "queues": [
            {
                "id": "example_queue",
                "title": "Example queue",
                "description": "Describe what is being decided and why it matters.",
                "source": "example_items",
                "empty": "Nothing to review in this queue.",
                "question": "Which actions should be taken?",
                "selection_mode": "multiple",
                "detail_keys": [
                    "status",
                    "priority",
                    "due",
                    "labels",
                    "path",
                    "description",
                ],
                "primary_keys": ["status", "priority", "due"],
                "actions": [
                    {
                        "id": "approve",
                        "label": "Approve the proposal",
                        "description": "Carry this proposal into the apply pass.",
                        "risk": "low",
                        "reversible": True,
                    },
                    {
                        "id": "needs_fix",
                        "label": "Request changes",
                        "description": "Keep the item open and describe the required edits.",
                        "risk": "low",
                        "reversible": True,
                        "requires_note": True,
                        "conflicts_with": ["approve"],
                    },
                ],
            }
        ],
    }


def _action_specs(
    spec: dict[str, Any], document_id: str, document_blocks: list[dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    keys = (
        "id",
        "label",
        "description",
        "risk",
        "reversible",
        "requires_note",
        "exclusive",
        "conflicts_with",
    )
    result: dict[str, dict[str, Any]] = {}
    for queue in spec.get("queues", []) or []:
        for action in queue.get("actions", []) or []:
            result[f"{queue['id']}.{action['id']}"] = {
                key: action.get(key) for key in keys
            }
    for block in document_blocks:
        if block.get("type") != "decision":
            continue
        for action in block.get("actions", []) or []:
            result[f"{document_id}.{action['id']}"] = {
                key: action.get(key) for key in keys
            }
    for action in spec.get("global_actions", []) or []:
        metadata = {key: action.get(key) for key in keys}
        if metadata.get("exclusive") is None:
            metadata["exclusive"] = True
        result[f"_global.{action['id']}"] = metadata
    return result


def _navigation(
    data: dict[str, Any],
    spec: dict[str, Any],
    document_blocks: list[dict[str, Any]],
    document_id: str,
) -> tuple[list[str], int, dict[str, int]]:
    links: list[str] = []
    total_cards = 0
    represented_counts: dict[str, int] = {}
    if document_blocks:
        document_count = sum(
            1 for block in document_blocks if block.get("type") == "decision"
        )
        total_cards += document_count
        links.append(
            f"<a href='#{html.escape(document_id)}'><span>"
            f"{html.escape(str(spec.get('document_title', 'Planning document')))}</span>"
            f"<b class='queue-count' data-queue-progress='{html.escape(document_id)}'>"
            f"0/{document_count}</b></a>"
        )
    for queue in spec.get("queues", []) or []:
        queue_id = str(queue["id"])
        source = str(queue["source"])
        count = len(data[source])
        represented_counts[source] = count
        total_cards += count
        links.append(
            f"<a href='#{html.escape(queue_id)}'><span>"
            f"{html.escape(str(queue.get('title', queue_id)))}</span>"
            f"<b class='queue-count' data-queue-progress='{html.escape(queue_id)}'>"
            f"0/{count}</b></a>"
        )
    return links, total_cards, represented_counts


def _tools_section(has_queues: bool) -> str:
    if not has_queues:
        return ""
    return """
    <section class="rail-section">
      <h2>Find an item</h2>
      <div class="review-tools">
        <label for="reviewSearch">Search<input id="reviewSearch" type="search" placeholder="Title or evidence" autocomplete="off"></label>
        <label for="queueFilter">Queue<select id="queueFilter"><option value="">All queues</option></select></label>
        <label for="stateFilter">State<select id="stateFilter"><option value="all">All states</option><option value="undecided">Unresolved</option><option value="decided">Resolved</option></select></label>
        <div class="review-nav-buttons"><button type="button" id="prevUndecided" title="Keyboard shortcut: K">Previous unresolved</button><button type="button" id="nextUndecided" title="Keyboard shortcut: J">Next unresolved</button></div>
        <span id="filterStatus" role="status" aria-live="polite"></span>
      </div>
    </section>"""


def render_html(data: dict[str, Any], spec: dict[str, Any]) -> str:
    """Validate inputs and return one self-contained review document."""
    validate_review(data, spec)
    generated_at = (
        dt.datetime.now(dt.timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )
    identity = artifact_identity(data, spec)
    storage_key = browser_storage_key(spec, identity)
    download_prefix = str(
        spec.get("download_prefix")
        or (slugify(str(spec.get("title", "review"))) + "-decisions")
    )
    payload_meta = spec.get("payload_meta") or {}
    item_queues = spec.get("queues", []) or []
    document_id = str(spec.get("document_id", "document-review"))
    document_blocks = [
        materialize_block(data, block) for block in (spec.get("blocks", []) or [])
    ]
    action_specs = _action_specs(spec, document_id, document_blocks)
    queue_links, total_cards, represented_counts = _navigation(
        data, spec, document_blocks, document_id
    )

    help_sentence = spec.get("agent_help") or (
        "Review the evidence, select every compatible action, add notes where "
        "context matters, then download the decisions and send them back to the agent."
    )
    count_rows = "".join(
        f"<div><dt>{html.escape(str(key).replace('_', ' '))}</dt>"
        f"<dd>{html.escape(str(value))}</dd></div>"
        for key, value in (data.get("counts", {}) or {}).items()
        if represented_counts.get(str(key)) != value
    )
    cards = render_document_blocks(data, spec) + render_cards(data, spec)
    document_only = bool(document_blocks) and not item_queues
    queue_section = ""
    if queue_links and not document_only:
        queue_section = (
            "<section class='rail-section'><h2>Queues</h2>"
            f"<nav class='queue-nav'>{''.join(queue_links)}</nav></section>"
        )
    toc_section = render_document_toc(document_blocks, document_id)

    javascript = _substitute(
        _resource_text("review.js"),
        _SCRIPT_TOKEN_RE,
        {
            "STORAGE_KEY": script_json(storage_key),
            "DOWNLOAD_NAME": script_json(download_prefix + "-"),
            "CONSOLE_TITLE": script_json(spec.get("title", "Offgrid Review")),
            "REVIEW_META": script_json(payload_meta),
            "ACTION_SPECS": script_json(action_specs),
            "ARTIFACT_IDENTITY": script_json(identity),
        },
    )
    page_values = {
        "OUTPUT_LICENSE": _output_license(),
        "LANGUAGE": html.escape(str(spec.get("language", "en"))),
        "TITLE": html.escape(str(spec.get("title", "Offgrid Review"))),
        "SUBTITLE": html.escape(
            str(
                spec.get(
                    "subtitle",
                    "About this review and what the exported decisions mean.",
                )
            )
        ),
        "TOTAL_CARDS": str(total_cards),
        "RAIL_CLASS": "review-rail document-only" if document_only else "review-rail",
        "QUEUE_SECTION": queue_section,
        "TOC_SECTION": toc_section,
        "TOOLS_SECTION": _tools_section(bool(item_queues)),
        "GENERATED_AT": html.escape(generated_at),
        "GENERATOR_VERSION": html.escape(str(identity["generator_version"])),
        "REVIEW_ID": html.escape(str(identity["review_id"])),
        "COUNT_ROWS": count_rows,
        "HELP_SENTENCE": html.escape(str(help_sentence)),
        "CARDS": cards,
        "REVIEW_CSS": _resource_text("review.css"),
        "REVIEW_JS": javascript,
    }
    return _substitute(_resource_text("page.html"), _PAGE_TOKEN_RE, page_values)
