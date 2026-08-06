# SPDX-License-Identifier: GPL-3.0-or-later OR Apache-2.0
"""Render queue cards and shared decision controls."""

from __future__ import annotations

import html
import json
from typing import Any

from ..identity import script_json, slugify, stable_item_id


def item_title(item: Any, detail_keys: list[str]) -> str:
    """Pick a human title from an arbitrary review item."""
    if isinstance(item, dict):
        for key in ("title", "name", "content", "path", "id", "label"):
            if item.get(key):
                return str(item[key])
    if isinstance(item, list) and len(item) >= 2 and all(isinstance(x, dict) for x in item):
        left = (
            item[0].get("title")
            or item[0].get("content")
            or item[0].get("name")
            or item[0].get("id")
            or "?"
        )
        right = (
            item[1].get("title")
            or item[1].get("content")
            or item[1].get("name")
            or item[1].get("id")
            or "?"
        )
        return f"{left} compared with {right}"
    return "Review item"


def item_details(
    item: Any,
    detail_keys: list[str],
    side_labels: list[str] | None = None,
) -> list[tuple[str, str]]:
    """Return labeled detail rows for an arbitrary review item."""
    details: list[tuple[str, str]] = []
    if isinstance(item, dict):
        for key in detail_keys:
            val = item.get(key)
            if val in (None, "", []):
                continue
            if isinstance(val, list) and all(isinstance(x, str) for x in val):
                val = " · ".join(val)
            elif isinstance(val, (list, dict)):
                val = json.dumps(val, ensure_ascii=False)
            details.append((key.replace("_", " "), str(val)))
        return details
    if isinstance(item, list) and all(isinstance(x, dict) for x in item):
        for side_index, side in enumerate(item):
            prefix = ""
            if side_labels and side_index < len(side_labels):
                prefix = f"{side_labels[side_index]} "
            for key in detail_keys:
                if key in ("title", "content", "name"):
                    continue
                val = side.get(key)
                if val in (None, "", []):
                    continue
                if isinstance(val, list) and all(isinstance(x, str) for x in val):
                    val = " · ".join(val)
                elif isinstance(val, (list, dict)):
                    val = json.dumps(val, ensure_ascii=False)
                details.append((f"{prefix}{key.replace('_', ' ')}", str(val)))
        return details
    return [("raw", json.dumps(item, ensure_ascii=False))]


def render_fact_list(details: list[tuple[str, str]], class_name: str = "facts") -> str:
    if not details:
        return ""
    chunks = [f"<dl class='{class_name}'>"]
    for label, value in details:
        if len(value) > 1200:
            value = value[:1200] + "…"
        chunks.append(
            f"<div class='fact'><dt>{html.escape(label)}</dt>"
            f"<dd>{html.escape(value)}</dd></div>"
        )
    chunks.append("</dl>")
    return "".join(chunks)


def render_annotation_editor(
    target: str,
    editor_id: str,
    label: str,
    placeholder: str,
    *,
    hidden: bool = True,
) -> str:
    hidden_attr = " hidden" if hidden else ""
    return (
        f"<div class='inline-annotation' id='{html.escape(editor_id)}'{hidden_attr}>"
        f"<label>{html.escape(label)}"
        f"<textarea data-note-target='{html.escape(target)}' "
        f"placeholder='{html.escape(placeholder)}'></textarea></label></div>"
    )


def render_table(section: dict[str, Any]) -> str:
    columns = [str(column) for column in section.get("columns", [])]
    rows = section.get("rows", []) or []
    if not columns and rows and isinstance(rows[0], dict):
        columns = [str(column) for column in rows[0]]
    if not columns:
        return ""
    chunks = ["<div class='table-wrap'><table class='review-table'><thead><tr>"]
    chunks.extend(f"<th scope='col'>{html.escape(column)}</th>" for column in columns)
    chunks.append("</tr></thead><tbody>")
    for row in rows:
        values = [row.get(column, "") for column in columns] if isinstance(row, dict) else list(row)
        chunks.append("<tr>")
        for index in range(len(columns)):
            value = values[index] if index < len(values) else ""
            if isinstance(value, (dict, list)):
                value = json.dumps(value, ensure_ascii=False)
            chunks.append(f"<td>{html.escape(str(value))}</td>")
        chunks.append("</tr>")
    chunks.append("</tbody></table></div>")
    return "".join(chunks)


def render_diagram(section: dict[str, Any]) -> str:
    nodes = section.get("nodes", []) or []
    edges = section.get("edges", []) or []
    chunks = [
        f"<ol class='diagram-flow' aria-label='{html.escape(section.get('title', 'Diagram'))}'>"
    ]
    for node in nodes:
        if isinstance(node, dict):
            title = node.get("title") or node.get("label") or node.get("id") or "Node"
            detail = node.get("description") or node.get("detail") or ""
        else:
            title, detail = str(node), ""
        chunks.append(
            f"<li class='diagram-node'><strong>{html.escape(str(title))}</strong>"
            f"<span>{html.escape(str(detail))}</span></li>"
        )
    chunks.append("</ol>")
    if edges:
        chunks.append("<ul class='connection-list' aria-label='Connections'>")
        for edge in edges:
            if isinstance(edge, dict):
                start = edge.get("from", "")
                end = edge.get("to", "")
                label = edge.get("label")
            elif isinstance(edge, list) and len(edge) >= 2:
                start, end = edge[0], edge[1]
                label = edge[2] if len(edge) > 2 else None
            else:
                start, end, label = str(edge), "", None
            text = f"{start} to {end}"
            if label:
                text += f": {label}"
            chunks.append(f"<li>{html.escape(text)}</li>")
        chunks.append("</ul>")
    return "".join(chunks)


def render_plan_sections(item: Any, owner_key: str) -> str:
    if not isinstance(item, dict) or not isinstance(item.get("sections"), list):
        return ""
    chunks = ["<div class='plan-sections'>"]
    for index, section_value in enumerate(item["sections"]):
        if not isinstance(section_value, dict):
            section: dict[str, Any] = {"title": f"Section {index + 1}", "body": section_value}
        else:
            section = section_value
        section_id = str(section.get("id") or f"section-{index + 1}")
        title = str(section.get("title") or f"Section {index + 1}")
        editor_id = f"annotation-{owner_key}-section-{slugify(section_id)}"
        chunks.append(f"<section class='plan-section' id='{html.escape(owner_key)}-{slugify(section_id)}'>")
        chunks.append(
            f"<div class='plan-section-head'><h4>{html.escape(title)}</h4>"
            f"<button type='button' class='annotation-toggle' aria-expanded='false' "
            f"aria-controls='{html.escape(editor_id)}'>Comment"
            f"<span class='annotation-count' data-count-target='section:{html.escape(section_id)}'></span>"
            "</button></div>"
        )
        body = section.get("body", section.get("content", ""))
        if body:
            chunks.append("<div class='plan-copy'>")
            for paragraph in str(body).split("\n\n"):
                chunks.append(f"<p>{html.escape(paragraph).replace(chr(10), '<br>')}</p>")
            chunks.append("</div>")
        kind = section.get("kind")
        if kind == "table" or section.get("rows"):
            chunks.append(render_table(section))
        if kind in ("diagram", "graph") or section.get("nodes"):
            chunks.append(render_diagram(section))
        chunks.append(
            render_annotation_editor(
                f"section:{section_id}",
                editor_id,
                f"Comment on {title}",
                "Add specific feedback for this section",
            )
        )
        chunks.append("</section>")
    chunks.append("</div>")
    return "".join(chunks)


def action_signals(action: dict[str, Any]) -> str:
    signals: list[str] = []
    risk = action.get("risk")
    reversible = action.get("reversible")
    if risk in ("medium", "high"):
        signals.append(f"{risk.title()} risk")
    if isinstance(reversible, bool) and not reversible:
        signals.append("Irreversible")
    elif isinstance(reversible, bool) and reversible:
        signals.append("Reversible")
    if action.get("requires_note"):
        signals.append("Rationale required")
    return " · ".join(signals)


def render_action(
    action: dict[str, Any],
    *,
    owner_key: str,
    queue_id: str,
    index: int,
    selection_mode: str,
    scope: str,
) -> str:
    action_id = str(action["id"])
    control_id = f"action-{owner_key}-{scope}-{index}-{slugify(action_id)}"
    note_id = f"note-{control_id}"
    reversible = action.get("reversible")
    dangerous = action.get("risk") == "high" or (
        isinstance(reversible, bool) and not reversible
    )
    danger_class = " danger" if dangerous else ""
    input_type = "radio" if selection_mode == "single" else "checkbox"
    exclusive = action.get("exclusive", scope == "global")
    description = action.get("description") or ""
    signals = action_signals(action)
    chunks = [f"<div class='action-option{danger_class}'>"]
    chunks.append(
        f"<input class='action-input' type='{input_type}' id='{html.escape(control_id)}' "
        f"name='decision-{html.escape(owner_key)}' data-action='{html.escape(action_id)}' "
        f"data-label='{html.escape(str(action.get('label', action_id)))}' "
        f"data-scope='{scope}' data-exclusive='{str(bool(exclusive)).lower()}'>"
    )
    chunks.append(
        f"<label for='{html.escape(control_id)}'><span class='action-label'>"
        f"{html.escape(str(action.get('label', action_id)))}</span>"
    )
    if description:
        chunks.append(f"<span class='action-description'>{html.escape(str(description))}</span>")
    if signals:
        chunks.append(f"<span class='action-signals'>{html.escape(signals)}</span>")
    chunks.append("</label>")
    chunks.append(
        f"<button type='button' class='action-note-toggle annotation-toggle' "
        f"aria-expanded='false' aria-controls='{html.escape(note_id)}'>Note"
        f"<span class='annotation-count' data-count-target='action:{html.escape(action_id)}'></span>"
        "</button>"
    )
    chunks.append(
        render_annotation_editor(
            f"action:{action_id}",
            note_id,
            f"Note for {action.get('label', action_id)}",
            "Explain this selection if context will help the apply pass",
        )
    )
    chunks.append("</div>")
    return "".join(chunks)


def render_cards(data: dict[str, Any], spec: dict[str, Any]) -> str:
    global_actions = spec.get("global_actions", [])
    note_label = spec.get("note_label", "Review note")
    chunks: list[str] = []
    for queue in spec.get("queues", []):
        queue_id = str(queue["id"])
        items = data.get(queue.get("source", queue_id), []) or []
        detail_keys = queue.get(
            "detail_keys", ["status", "priority", "due", "path", "description"]
        )
        primary_keys = set(queue.get("primary_keys", ["status", "priority", "due"]))
        side_labels = queue.get("side_labels")
        selection_mode = queue.get("selection_mode", "multiple")
        if selection_mode not in ("multiple", "single"):
            selection_mode = "multiple"
        chunks.append(
            f"<section class='queue' id='{html.escape(queue_id)}' data-count='{len(items)}'>"
        )
        chunks.append(
            f"<div class='queue-head'><div><h2>{html.escape(str(queue.get('title', queue_id)))}</h2>"
            f"<p>{html.escape(str(queue.get('description', '')))}</p></div>"
            f"<span class='count'>{len(items)} item{'s' if len(items) != 1 else ''}</span></div>"
        )
        if not items:
            chunks.append(
                f"<div class='empty'>{html.escape(str(queue.get('empty', 'Nothing to review.')))}</div>"
            )
        for index, item in enumerate(items):
            source_id = stable_item_id(item)
            if source_id is None:
                raise ValueError("validated review item has no stable ID")
            item_id = f"{queue_id}:{source_id}"
            owner_key = f"{slugify(item_id)}-{index}"
            title = item_title(item, detail_keys)
            details = item_details(item, detail_keys, side_labels)
            primary_details = [
                detail
                for detail in details
                if any(detail[0].lower().endswith(key.lower()) for key in primary_keys)
            ]
            if not primary_details:
                primary_details = details[: min(3, len(details))]
            secondary_details = [detail for detail in details if detail not in primary_details]
            raw_json = json.dumps(item, ensure_ascii=False, indent=2)
            raw_script = script_json(item)
            search_text = " ".join(
                [title]
                + [f"{label} {value}" for label, value in details]
                + [str(action.get("label", "")) for action in queue.get("actions", [])]
            ).lower()[:4000]
            chunks.append(
                f"<article class='card' data-id='{html.escape(item_id)}' "
                f"data-owner-key='{html.escape(owner_key)}' data-queue='{html.escape(queue_id)}' "
                f"data-selection-mode='{selection_mode}' data-search='{html.escape(search_text)}'>"
            )
            chunks.append("<div class='card-content'>")
            chunks.append(
                f"<div class='card-top'><div><p class='item-position'>Item {index + 1} of {len(items)}</p>"
                f"<h3 class='card-title'>{html.escape(title)}</h3></div>"
                "<span class='decision-state'>Unresolved</span></div>"
            )
            chunks.append(render_fact_list(primary_details))
            chunks.append(render_plan_sections(item, owner_key))
            if secondary_details:
                chunks.append(
                    "<details class='evidence-disclosure'><summary>Supporting details "
                    f"({len(secondary_details)})</summary>"
                    f"{render_fact_list(secondary_details, 'facts supporting-facts')}</details>"
                )
            chunks.append(
                "<details class='evidence-disclosure'><summary>Raw source item</summary>"
                f"<pre class='raw-evidence'>{html.escape(raw_json)}</pre></details>"
            )
            chunks.append(
                "<details class='annotation-panel'><summary>"
                f"{html.escape(note_label)} <span class='annotation-count' "
                "data-count-target='item'></span></summary>"
                "<div class='annotation-editor'><label>General note"
                "<textarea data-note-target='item' placeholder='Add context for the reviewer or apply pass'>"
                "</textarea></label></div></details>"
            )
            chunks.append(f"<script type='application/json' class='raw-item'>{raw_script}</script>")
            chunks.append("</div>")
            chunks.append(
                f"<aside class='decision-column' data-owner-id='{html.escape(item_id)}' "
                f"data-owner-key='{html.escape(owner_key)}'><div class='decision-sticky'>"
            )
            question = queue.get("question") or (
                "Choose one outcome" if selection_mode == "single" else "Which actions should be taken?"
            )
            hint = queue.get("selection_hint") or (
                "Choose one option." if selection_mode == "single" else "Select every compatible action."
            )
            chunks.append(
                f"<fieldset class='decision-panel'><legend>{html.escape(str(question))}</legend>"
                f"<p class='field-hint'>{html.escape(str(hint))}</p><div class='actions'>"
            )
            for action_index, action in enumerate(queue.get("actions", [])):
                chunks.append(
                    render_action(
                        action,
                        owner_key=owner_key,
                        queue_id=queue_id,
                        index=action_index,
                        selection_mode=selection_mode,
                        scope="queue",
                    )
                )
            chunks.append("</div>")
            if global_actions:
                chunks.append(
                    "<details class='fallback-group'><summary>Other review outcomes</summary>"
                    "<div class='actions'>"
                )
                for action_index, action in enumerate(global_actions):
                    chunks.append(
                        render_action(
                            action,
                            owner_key=owner_key,
                            queue_id=queue_id,
                            index=action_index,
                            selection_mode=selection_mode,
                            scope="global",
                        )
                    )
                chunks.append("</div></details>")
            chunks.append(
                "</fieldset><div class='card-conflict' role='alert' hidden></div></div></aside>"
            )
            chunks.append("</article>")
        chunks.append("</section>")
    return "\n".join(chunks)
