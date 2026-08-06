# SPDX-License-Identifier: GPL-3.0-or-later
"""Input validation for Offgrid Review data and specifications."""

from __future__ import annotations

import math
import re
from typing import Any

from .identity import stable_item_id

BLOCK_TYPES = {
    "overview",
    "prose",
    "decision",
    "table",
    "flow",
    "timeline",
    "dependency_graph",
    "chart",
    "svg",
}
RISK_VALUES = {"none", "low", "medium", "high"}
SELECTION_MODES = {"multiple", "single"}
RESERVED_PAYLOAD_FIELDS = {
    "schema_version",
    "generator_version",
    "review_id",
    "data_fingerprint",
    "spec_fingerprint",
    "artifact_fingerprint",
    "console_title",
    "exported_at",
    "complete",
    "valid",
    "warnings",
    "decisions",
    "annotations",
}
ID_PATTERN = re.compile(r"^[^\s].*[^\s]$|^[^\s]$")
MAX_QUEUES = 100
MAX_BLOCKS = 500
MAX_ACTIONS = 100
MAX_ITEMS_PER_QUEUE = 10_000
MAX_BLOCK_VALUES = 5_000


class ReviewValidationError(ValueError):
    """One or more path-aware input contract failures."""

    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        message = "review input is invalid:\n  - " + "\n  - ".join(errors)
        super().__init__(message)


class _Validator:
    def __init__(self, data: dict[str, Any], spec: dict[str, Any]) -> None:
        self.data = data
        self.spec = spec
        self.errors: list[str] = []

    def error(self, path: str, message: str) -> None:
        self.errors.append(f"{path}: {message}")

    def string(
        self,
        value: Any,
        path: str,
        *,
        required: bool = False,
        maximum: int = 500,
    ) -> str | None:
        if value is None:
            if required:
                self.error(path, "is required")
            return None
        if not isinstance(value, str):
            self.error(path, f"expected a string, got {type(value).__name__}")
            return None
        if required and not value.strip():
            self.error(path, "must not be empty")
            return None
        if len(value) > maximum:
            self.error(path, f"must not exceed {maximum} characters")
        return value

    def identifier(self, value: Any, path: str) -> str | None:
        text = self.string(value, path, required=True, maximum=200)
        if text is not None and not ID_PATTERN.fullmatch(text):
            self.error(path, "must not start or end with whitespace")
            return None
        return text

    def list_value(
        self,
        value: Any,
        path: str,
        *,
        required: bool = False,
        maximum: int | None = None,
    ) -> list[Any]:
        if value is None:
            if required:
                self.error(path, "is required")
            return []
        if not isinstance(value, list):
            self.error(path, f"expected an array, got {type(value).__name__}")
            return []
        if maximum is not None and len(value) > maximum:
            self.error(path, f"must not contain more than {maximum} entries")
            return value[:maximum]
        return value

    def object_value(self, value: Any, path: str) -> dict[str, Any] | None:
        if not isinstance(value, dict):
            self.error(path, f"expected an object, got {type(value).__name__}")
            return None
        return value

    def boolean(self, value: Any, path: str) -> None:
        if value is not None and not isinstance(value, bool):
            self.error(path, f"expected a boolean, got {type(value).__name__}")

    def resolve_path(self, path: str) -> Any:
        value: Any = self.data
        for segment in path.split("."):
            if not isinstance(value, dict) or segment not in value:
                return None
            value = value[segment]
        return value

    def validate_action_shape(self, value: Any, path: str) -> tuple[str | None, list[str]]:
        action = self.object_value(value, path)
        if action is None:
            return None, []
        action_id = self.identifier(action.get("id"), f"{path}.id")
        self.string(action.get("label"), f"{path}.label", required=True)
        self.string(action.get("description"), f"{path}.description", maximum=2_000)
        risk = action.get("risk")
        if risk is not None and risk not in RISK_VALUES:
            self.error(f"{path}.risk", f"expected one of {sorted(RISK_VALUES)}")
        self.boolean(action.get("reversible"), f"{path}.reversible")
        self.boolean(action.get("requires_note"), f"{path}.requires_note")
        self.boolean(action.get("exclusive"), f"{path}.exclusive")
        conflicts = self.list_value(action.get("conflicts_with"), f"{path}.conflicts_with")
        normalized_conflicts: list[str] = []
        for index, conflict in enumerate(conflicts):
            conflict_id = self.identifier(conflict, f"{path}.conflicts_with[{index}]")
            if conflict_id is not None:
                normalized_conflicts.append(conflict_id)
        return action_id, normalized_conflicts

    def validate_actions(
        self,
        value: Any,
        path: str,
        *,
        global_ids: set[str] | None = None,
        require_choice: bool = False,
    ) -> set[str]:
        actions = self.list_value(value, path, maximum=MAX_ACTIONS)
        identifiers: set[str] = set()
        conflicts: list[tuple[str, str, list[str]]] = []
        for index, action in enumerate(actions):
            action_id, references = self.validate_action_shape(action, f"{path}[{index}]")
            if action_id is None:
                continue
            if action_id in identifiers:
                self.error(f"{path}[{index}].id", f'duplicate action ID "{action_id}"')
            identifiers.add(action_id)
            conflicts.append((f"{path}[{index}]", action_id, references))
        available = identifiers | (global_ids or set())
        if require_choice and not available:
            self.error(path, "requires at least one local or global action")
        for action_path, action_id, references in conflicts:
            for reference in references:
                if reference == action_id:
                    self.error(
                        f"{action_path}.conflicts_with",
                        f'action "{action_id}" cannot conflict with itself',
                    )
                elif reference not in available:
                    self.error(
                        f"{action_path}.conflicts_with",
                        f'unknown action ID "{reference}"',
                    )
        return identifiers

    def validate_item_sections(self, item: dict[str, Any], path: str) -> None:
        if "sections" not in item:
            return
        sections = self.list_value(
            item.get("sections"), f"{path}.sections", maximum=MAX_BLOCKS
        )
        seen: set[str] = set()
        for index, value in enumerate(sections):
            section_path = f"{path}.sections[{index}]"
            section = self.object_value(value, section_path)
            if section is None:
                continue
            section_id = self.identifier(section.get("id"), f"{section_path}.id")
            if section_id in seen:
                self.error(f"{section_path}.id", f'duplicate section ID "{section_id}"')
            if section_id is not None:
                seen.add(section_id)
            kind = section.get("kind")
            if kind is not None and kind not in {"table", "diagram", "graph"}:
                self.error(f"{section_path}.kind", "expected table, diagram, or graph")
            for key in ("columns", "rows", "nodes", "edges"):
                if key in section:
                    self.list_value(section[key], f"{section_path}.{key}")

    def validate_queue_items(self, queue: dict[str, Any], path: str) -> None:
        source = self.string(queue.get("source"), f"{path}.source", required=True)
        if source is None:
            return
        if source not in self.data:
            self.error(f"{path}.source", f'data path "{source}" does not exist')
            return
        items = self.list_value(
            self.data[source], f"data.{source}", maximum=MAX_ITEMS_PER_QUEUE
        )
        seen: set[str] = set()
        for index, item in enumerate(items):
            item_path = f"data.{source}[{index}]"
            item_id = stable_item_id(item)
            if item_id is None:
                self.error(
                    item_path,
                    "requires a non-empty id, or ids on every object in a comparison array",
                )
                continue
            if item_id in seen:
                self.error(item_path, f'duplicate item ID "{item_id}"')
            seen.add(item_id)
            if isinstance(item, dict):
                self.validate_item_sections(item, item_path)

    def validate_queues(self, global_ids: set[str], document_id: str) -> set[str]:
        queues = self.list_value(
            self.spec.get("queues"), "spec.queues", maximum=MAX_QUEUES
        )
        identifiers: set[str] = set()
        for index, value in enumerate(queues):
            path = f"spec.queues[{index}]"
            queue = self.object_value(value, path)
            if queue is None:
                continue
            queue_id = self.identifier(queue.get("id"), f"{path}.id")
            if queue_id is not None:
                if queue_id in identifiers:
                    self.error(f"{path}.id", f'duplicate queue ID "{queue_id}"')
                if queue_id == document_id and self.spec.get("blocks"):
                    self.error(f"{path}.id", "must differ from document_id")
                identifiers.add(queue_id)
            selection_mode = queue.get("selection_mode", "multiple")
            if selection_mode not in SELECTION_MODES:
                self.error(
                    f"{path}.selection_mode",
                    f"expected one of {sorted(SELECTION_MODES)}",
                )
            for key in ("detail_keys", "primary_keys", "side_labels"):
                if key in queue:
                    self.list_value(queue[key], f"{path}.{key}")
            local_ids = self.validate_actions(
                queue.get("actions"),
                f"{path}.actions",
                global_ids=global_ids,
                require_choice=True,
            )
            for collision in sorted(local_ids & global_ids):
                self.error(
                    f"{path}.actions",
                    f'action ID "{collision}" collides with a global action',
                )
            self.validate_queue_items(queue, path)
        return identifiers

    def validate_block_data(self, block: dict[str, Any], path: str) -> dict[str, Any]:
        source = block.get("source")
        if source is None:
            return block
        source_path = self.string(source, f"{path}.source", required=True)
        if source_path is None:
            return block
        sourced = self.resolve_path(source_path)
        if sourced is None:
            self.error(f"{path}.source", f'data path "{source_path}" does not exist')
            return block
        if isinstance(sourced, dict):
            return {**sourced, **block}
        return {"content": sourced, **block}

    def validate_block_shape(
        self,
        block: dict[str, Any],
        path: str,
        block_type: str,
        global_ids: set[str],
    ) -> None:
        if block_type == "decision":
            selection_mode = block.get("selection_mode", "multiple")
            if selection_mode not in SELECTION_MODES:
                self.error(
                    f"{path}.selection_mode",
                    f"expected one of {sorted(SELECTION_MODES)}",
                )
            local_ids = self.validate_actions(
                block.get("actions"),
                f"{path}.actions",
                global_ids=global_ids,
                require_choice=True,
            )
            for collision in sorted(local_ids & global_ids):
                self.error(
                    f"{path}.actions",
                    f'action ID "{collision}" collides with a global action',
                )
            return

        list_fields: dict[str, tuple[str, ...]] = {
            "overview": ("points",),
            "table": ("columns", "rows"),
            "flow": ("nodes", "edges"),
            "timeline": ("events",),
            "dependency_graph": ("nodes", "edges"),
            "chart": ("values",),
        }
        for key in list_fields.get(block_type, ()):
            if key in block:
                self.list_value(
                    block[key], f"{path}.{key}", maximum=MAX_BLOCK_VALUES
                )
        if block_type == "chart":
            chart_type = block.get("chart_type", "bar")
            if chart_type not in {"bar", "line"}:
                self.error(f"{path}.chart_type", "expected bar or line")
            for index, value in enumerate(block.get("values", []) or []):
                value_path = f"{path}.values[{index}]"
                if isinstance(value, dict):
                    number = value.get("value")
                elif isinstance(value, list) and len(value) >= 2:
                    number = value[1]
                else:
                    self.error(value_path, "expected an object or [label, value] pair")
                    continue
                if isinstance(number, bool) or not isinstance(number, (int, float)):
                    self.error(f"{value_path}.value", "expected a number")
                elif not math.isfinite(float(number)) or number < 0:
                    self.error(f"{value_path}.value", "expected a finite non-negative number")
        if block_type == "svg":
            self.string(block.get("svg"), f"{path}.svg", required=True, maximum=100_000)
            fallback = block.get("fallback", block.get("text_fallback"))
            if not isinstance(fallback, (str, list)) or not fallback:
                self.error(f"{path}.fallback", "requires non-empty text or an array")

    def validate_blocks(self, global_ids: set[str]) -> tuple[set[str], str]:
        blocks = self.list_value(
            self.spec.get("blocks"), "spec.blocks", maximum=MAX_BLOCKS
        )
        document_id = self.identifier(
            self.spec.get("document_id", "document-review"), "spec.document_id"
        ) or "document-review"
        identifiers: set[str] = set()
        for index, value in enumerate(blocks):
            path = f"spec.blocks[{index}]"
            block = self.object_value(value, path)
            if block is None:
                continue
            block_id = self.identifier(block.get("id"), f"{path}.id")
            if block_id in identifiers:
                self.error(f"{path}.id", f'duplicate block ID "{block_id}"')
            if block_id is not None:
                identifiers.add(block_id)
            block_type = self.string(block.get("type"), f"{path}.type", required=True)
            if block_type is None:
                continue
            if block_type not in BLOCK_TYPES:
                self.error(f"{path}.type", f"expected one of {sorted(BLOCK_TYPES)}")
                continue
            materialized = self.validate_block_data(block, path)
            self.validate_block_shape(materialized, path, block_type, global_ids)
        return identifiers, document_id

    def run(self) -> None:
        self.string(self.spec.get("title"), "spec.title", maximum=500)
        self.string(self.spec.get("review_id"), "spec.review_id", maximum=200)
        self.string(self.spec.get("storage_key"), "spec.storage_key", maximum=500)
        self.string(self.spec.get("download_prefix"), "spec.download_prefix", maximum=200)
        self.string(self.spec.get("language"), "spec.language", maximum=50)

        counts = self.data.get("counts")
        if counts is not None and not isinstance(counts, dict):
            self.error("data.counts", f"expected an object, got {type(counts).__name__}")

        payload_meta = self.spec.get("payload_meta", {})
        if not isinstance(payload_meta, dict):
            self.error(
                "spec.payload_meta",
                f"expected an object, got {type(payload_meta).__name__}",
            )
        else:
            for field in sorted(RESERVED_PAYLOAD_FIELDS & payload_meta.keys()):
                self.error("spec.payload_meta", f'reserved field "{field}" is not allowed')

        global_ids = self.validate_actions(
            self.spec.get("global_actions"), "spec.global_actions"
        )
        block_ids, document_id = self.validate_blocks(global_ids)
        queue_ids = self.validate_queues(global_ids, document_id)
        if not block_ids and not queue_ids:
            self.error("spec", "requires at least one queue or document block")


def validate_review(data: dict[str, Any], spec: dict[str, Any]) -> None:
    """Raise a path-aware error when inputs cannot produce a stable review."""
    validator = _Validator(data, spec)
    validator.run()
    if validator.errors:
        raise ReviewValidationError(validator.errors)
