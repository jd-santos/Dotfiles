# SPDX-License-Identifier: GPL-3.0-or-later OR Apache-2.0
"""Render planning documents and semantic review blocks."""

from __future__ import annotations

import html
import math
import textwrap
from typing import Any

from ..identity import script_json, slugify
from .queue import render_action, render_table
from .svg import sanitize_svg


def resolve_data_path(data: dict[str, Any], path: str) -> Any:
    value: Any = data
    for segment in path.split("."):
        if not isinstance(value, dict) or segment not in value:
            return None
        value = value[segment]
    return value


def materialize_block(data: dict[str, Any], block_spec: dict[str, Any]) -> dict[str, Any]:
    source = block_spec.get("source")
    sourced = resolve_data_path(data, str(source)) if source else None
    if isinstance(sourced, dict):
        block = {**sourced, **block_spec}
    elif sourced is not None:
        block = {"content": sourced, **block_spec}
    else:
        block = dict(block_spec)
    block.pop("source", None)
    return block


def document_block_anchor(document_id: str, block: dict[str, Any], index: int) -> str:
    block_id = str(block.get("id") or f"block-{index + 1}")
    return f"{slugify(document_id)}-{slugify(block_id)}"


def render_document_toc(blocks: list[dict[str, Any]], document_id: str) -> str:
    links = []
    for index, block in enumerate(blocks):
        block_type = str(block.get("type", "prose"))
        title = str(block.get("title") or block_type.replace("_", " ").title())
        anchor = document_block_anchor(document_id, block, index)
        links.append(
            f"<a class='toc-link' href='#{html.escape(anchor)}' "
            f"data-toc-target='{html.escape(anchor)}'>{html.escape(title)}</a>"
        )
    if not links:
        return ""
    nav = f"<nav class='toc-nav' aria-label='Document contents'>{''.join(links)}</nav>"
    list_icon = (
        "<svg viewBox='0 0 20 20' aria-hidden='true' focusable='false'>"
        "<path d='M7 5h9M7 10h9M7 15h9' fill='none' stroke='currentColor' "
        "stroke-width='1.7' stroke-linecap='round'/><circle cx='4' cy='5' r='1' "
        "fill='currentColor'/><circle cx='4' cy='10' r='1' fill='currentColor'/>"
        "<circle cx='4' cy='15' r='1' fill='currentColor'/></svg>"
    )
    close_icon = (
        "<svg viewBox='0 0 20 20' aria-hidden='true' focusable='false'>"
        "<path d='m5 5 10 10M15 5 5 15' fill='none' stroke='currentColor' "
        "stroke-width='1.7' stroke-linecap='round'/></svg>"
    )
    return (
        "<section class='rail-section document-toc document-toc-wide'>"
        f"<h2>On this page</h2>{nav}</section>"
        "<button type='button' class='toc-launcher' id='tocLauncher' "
        "aria-expanded='false' aria-controls='tocDrawer' aria-label='Open document contents'>"
        f"{list_icon}<span class='visually-hidden'>Open document contents</span></button>"
        "<aside class='toc-drawer' id='tocDrawer' aria-labelledby='tocDrawerTitle' hidden>"
        "<div class='toc-drawer-head'><h2 id='tocDrawerTitle'>Contents</h2>"
        "<button type='button' class='toc-drawer-close' id='tocDrawerClose' "
        f"aria-label='Close document contents'>{close_icon}</button></div>{nav}</aside>"
    )


def render_paragraphs(value: Any, class_name: str = "document-copy") -> str:
    if value in (None, ""):
        return ""
    chunks = [f"<div class='{class_name}'>"]
    for paragraph in str(value).split("\n\n"):
        chunks.append(f"<p>{html.escape(paragraph).replace(chr(10), '<br>')}</p>")
    chunks.append("</div>")
    return "".join(chunks)


def render_fallback_content(value: Any) -> str:
    if isinstance(value, list):
        return "<ul>" + "".join(f"<li>{html.escape(str(item))}</li>" for item in value) + "</ul>"
    return render_paragraphs(value, "text-alternative-copy")


def render_text_alternative(content: str, label: str = "Text alternative") -> str:
    return (
        "<details class='text-alternative'><summary>"
        f"{html.escape(label)}</summary><div class='text-alternative-body'>{content}</div></details>"
    )


def render_block_annotation(block_id: str, block: dict[str, Any]) -> str:
    snapshot = block
    if str(block.get("type")) == "svg" and "svg" in block:
        snapshot = {key: value for key, value in block.items() if key != "svg"}
        snapshot["svg_source_omitted"] = True
    raw = script_json(snapshot)
    return (
        "<details class='annotation-panel document-annotation'><summary>Comment on this block "
        "<span class='annotation-count' data-document-count></span></summary>"
        "<div class='annotation-editor'><label>Block comment"
        "<textarea data-document-note placeholder='Add feedback about this block'></textarea>"
        "</label></div></details>"
        f"<script type='application/json' class='block-raw'>{raw}</script>"
    )


def normalized_nodes(block: dict[str, Any]) -> list[dict[str, str]]:
    nodes: list[dict[str, str]] = []
    for index, value in enumerate(block.get("nodes", []) or []):
        if isinstance(value, dict):
            node_id = str(value.get("id") or f"node-{index + 1}")
            label = str(value.get("title") or value.get("label") or node_id)
            description = str(value.get("description") or value.get("detail") or "")
            level = str(value.get("level", index))
        else:
            node_id = f"node-{index + 1}"
            label = str(value)
            description = ""
            level = str(index)
        nodes.append(
            {"id": node_id, "label": label, "description": description, "level": level}
        )
    return nodes


def normalized_edges(block: dict[str, Any]) -> list[dict[str, str]]:
    edges: list[dict[str, str]] = []
    for value in block.get("edges", []) or []:
        if isinstance(value, dict):
            start = str(value.get("from", ""))
            end = str(value.get("to", ""))
            label = str(value.get("label", ""))
        elif isinstance(value, list) and len(value) >= 2:
            start = str(value[0])
            end = str(value[1])
            label = str(value[2]) if len(value) > 2 else ""
        else:
            continue
        edges.append({"from": start, "to": end, "label": label})
    return edges


def render_flow_block(block: dict[str, Any], visual_id: str) -> str:
    nodes = normalized_nodes(block)
    edges = normalized_edges(block)
    if not nodes:
        return "<div class='visual-error'>Flow has no nodes.</div>"
    node_width = 150
    gap = 44
    width = max(560, 36 + len(nodes) * (node_width + gap))
    height = 172
    positions: dict[str, tuple[float, float]] = {}
    chunks = [
        f"<svg class='document-visual flow-visual' viewBox='0 0 {width} {height}' "
        f"role='img' aria-labelledby='{visual_id}-title {visual_id}-desc'>"
        f"<title id='{visual_id}-title'>{html.escape(str(block.get('title', 'Process flow')))}</title>"
        f"<desc id='{visual_id}-desc'>{html.escape(str(block.get('description', 'Connected process steps.')))}</desc>"
    ]
    for index, node in enumerate(nodes):
        x = 24 + index * (node_width + gap)
        y = 44
        positions[node["id"]] = (x, y)
    for edge in edges:
        start = positions.get(edge["from"])
        end = positions.get(edge["to"])
        if not start or not end:
            continue
        chunks.append(
            f"<line class='visual-edge' x1='{start[0] + node_width}' y1='{start[1] + 38}' "
            f"x2='{end[0]}' y2='{end[1] + 38}' />"
        )
    for node in nodes:
        x, y = positions[node["id"]]
        label = node["label"] if len(node["label"]) <= 20 else f"{node['label'][:19].rstrip()}…"
        detail_lines = textwrap.wrap(
            node["description"], width=22, max_lines=2, placeholder="…"
        )
        detail_markup = "".join(
            f"<tspan x='{x + 12}' dy='{'0' if line_index == 0 else '14'}'>"
            f"{html.escape(line)}</tspan>"
            for line_index, line in enumerate(detail_lines)
        )
        chunks.append(
            f"<rect class='visual-node-shape' x='{x}' y='{y}' width='{node_width}' height='76' rx='8' />"
            f"<text class='visual-node-label' x='{x + 12}' y='{y + 25}'>{html.escape(label)}</text>"
            f"<text class='visual-node-detail' x='{x + 12}' y='{y + 47}'>{detail_markup}</text>"
        )
    chunks.append("</svg>")
    fallback = ["<ol>"]
    fallback.extend(
        f"<li><strong>{html.escape(node['label'])}</strong>"
        f"{': ' + html.escape(node['description']) if node['description'] else ''}</li>"
        for node in nodes
    )
    fallback.append("</ol>")
    if edges:
        fallback.append("<ul>")
        fallback.extend(
            f"<li>{html.escape(edge['from'])} to {html.escape(edge['to'])}"
            f"{': ' + html.escape(edge['label']) if edge['label'] else ''}</li>"
            for edge in edges
        )
        fallback.append("</ul>")
    chunks.append(render_text_alternative("".join(fallback)))
    return "".join(chunks)


def render_dependency_block(block: dict[str, Any], visual_id: str) -> str:
    nodes = normalized_nodes(block)
    edges = normalized_edges(block)
    if not nodes:
        return "<div class='visual-error'>Dependency graph has no nodes.</div>"
    levels: dict[int, list[dict[str, str]]] = {}
    for index, node in enumerate(nodes):
        try:
            level = max(0, int(node["level"]))
        except ValueError:
            level = index
        levels.setdefault(level, []).append(node)
    max_level = max(levels)
    width = max(620, 210 + max_level * 190)
    height = max(240, 80 + max(len(group) for group in levels.values()) * 104)
    positions: dict[str, tuple[float, float]] = {}
    for level, group in levels.items():
        for row, node in enumerate(group):
            positions[node["id"]] = (28 + level * 190, 38 + row * 104)
    chunks = [
        f"<svg class='document-visual dependency-visual' viewBox='0 0 {width} {height}' "
        f"role='img' aria-labelledby='{visual_id}-title {visual_id}-desc'>"
        f"<title id='{visual_id}-title'>{html.escape(str(block.get('title', 'Dependency graph')))}</title>"
        f"<desc id='{visual_id}-desc'>{html.escape(str(block.get('description', 'Directed dependencies between plan components.')))}</desc>"
    ]
    for edge in edges:
        start = positions.get(edge["from"])
        end = positions.get(edge["to"])
        if not start or not end:
            continue
        chunks.append(
            f"<line class='visual-edge' x1='{start[0] + 140}' y1='{start[1] + 32}' "
            f"x2='{end[0]}' y2='{end[1] + 32}' />"
        )
    by_id = {node["id"]: node for node in nodes}
    for node_id, (x, y) in positions.items():
        node = by_id[node_id]
        chunks.append(
            f"<rect class='visual-node-shape' x='{x}' y='{y}' width='140' height='64' rx='8' />"
            f"<text class='visual-node-label' x='{x + 10}' y='{y + 27}'>{html.escape(node['label'][:24])}</text>"
            f"<text class='visual-node-detail' x='{x + 10}' y='{y + 47}'>{html.escape(node['description'][:30])}</text>"
        )
    chunks.append("</svg>")
    fallback = ["<ul>"]
    fallback.extend(
        f"<li><strong>{html.escape(node['label'])}</strong>"
        f"{': ' + html.escape(node['description']) if node['description'] else ''}</li>"
        for node in nodes
    )
    fallback.extend(
        f"<li>{html.escape(edge['from'])} depends on {html.escape(edge['to'])}"
        f"{': ' + html.escape(edge['label']) if edge['label'] else ''}</li>"
        for edge in edges
    )
    fallback.append("</ul>")
    chunks.append(render_text_alternative("".join(fallback)))
    return "".join(chunks)


def chart_values(block: dict[str, Any]) -> list[tuple[str, float]]:
    values: list[tuple[str, float]] = []
    for index, item in enumerate(block.get("values", []) or []):
        if isinstance(item, dict):
            label = str(item.get("label") or item.get("name") or f"Value {index + 1}")
            raw_value = item.get("value")
        elif isinstance(item, list) and len(item) >= 2:
            label, raw_value = str(item[0]), item[1]
        else:
            continue
        if isinstance(raw_value, bool) or not isinstance(raw_value, (int, float, str)):
            continue
        try:
            number = float(raw_value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number) and number >= 0:
            values.append((label, number))
    return values


def render_chart_block(block: dict[str, Any], visual_id: str) -> str:
    values = chart_values(block)
    if not values:
        return "<div class='visual-error'>Chart has no non-negative numeric values.</div>"
    chart_type = str(block.get("chart_type", "bar"))
    unit = str(block.get("unit", ""))
    width, height = 640, 300
    plot_left, plot_top, plot_width, plot_height = 52, 30, 558, 205
    maximum = max(value for _, value in values) or 1
    chunks = [
        f"<svg class='document-visual chart-visual' viewBox='0 0 {width} {height}' "
        f"role='img' aria-labelledby='{visual_id}-title {visual_id}-desc'>"
        f"<title id='{visual_id}-title'>{html.escape(str(block.get('title', 'Chart')))}</title>"
        f"<desc id='{visual_id}-desc'>{html.escape(str(block.get('description', 'Quantitative values shown with a data table.')))}</desc>"
        f"<line class='chart-axis' x1='{plot_left}' y1='{plot_top + plot_height}' "
        f"x2='{plot_left + plot_width}' y2='{plot_top + plot_height}' />"
    ]
    if chart_type == "line" and len(values) > 1:
        step = plot_width / (len(values) - 1)
        points: list[tuple[float, float]] = []
        for index, (_, value) in enumerate(values):
            x = plot_left + index * step
            y = plot_top + plot_height - (value / maximum) * plot_height
            points.append((x, y))
        point_text = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
        chunks.append(f"<polyline class='chart-line' points='{point_text}' />")
        for (label, value), (x, y) in zip(values, points, strict=True):
            chunks.append(
                f"<circle class='chart-point' cx='{x:.1f}' cy='{y:.1f}' r='5' />"
                f"<text class='chart-label' x='{x:.1f}' y='{plot_top + plot_height + 24}' "
                f"text-anchor='middle'>{html.escape(label[:14])}</text>"
                f"<text class='chart-value' x='{x:.1f}' y='{y - 10:.1f}' "
                f"text-anchor='middle'>{html.escape(f'{value:g}{unit}')}</text>"
            )
    else:
        slot = plot_width / len(values)
        bar_width = min(70, slot * 0.62)
        for index, (label, value) in enumerate(values):
            bar_height = (value / maximum) * plot_height
            x = plot_left + index * slot + (slot - bar_width) / 2
            y = plot_top + plot_height - bar_height
            chunks.append(
                f"<rect class='chart-bar' x='{x:.1f}' y='{y:.1f}' width='{bar_width:.1f}' "
                f"height='{bar_height:.1f}' rx='5' />"
                f"<text class='chart-label' x='{x + bar_width / 2:.1f}' "
                f"y='{plot_top + plot_height + 24}' text-anchor='middle'>{html.escape(label[:14])}</text>"
                f"<text class='chart-value' x='{x + bar_width / 2:.1f}' y='{max(plot_top + 14, y - 9):.1f}' "
                f"text-anchor='middle'>{html.escape(f'{value:g}{unit}')}</text>"
            )
    chunks.append("</svg>")
    table_block = {
        "columns": ["Label", f"Value{f' ({unit})' if unit else ''}"],
        "rows": [[label, f"{value:g}"] for label, value in values],
    }
    chunks.append(render_text_alternative(render_table(table_block), "Data table"))
    return "".join(chunks)


def render_timeline_block(block: dict[str, Any]) -> str:
    events = block.get("events", []) or []
    chunks = ["<ol class='timeline-list'>"]
    for index, value in enumerate(events):
        if isinstance(value, dict):
            when = str(value.get("date") or value.get("when") or value.get("step") or index + 1)
            title = str(value.get("title") or value.get("label") or f"Event {index + 1}")
            description = str(value.get("description") or value.get("body") or "")
        else:
            when, title, description = str(index + 1), str(value), ""
        chunks.append(
            "<li><span class='timeline-when'>"
            f"{html.escape(when)}</span><div><strong>{html.escape(title)}</strong>"
            f"<p>{html.escape(description)}</p></div></li>"
        )
    chunks.append("</ol>")
    return "".join(chunks)


def render_custom_svg_block(block: dict[str, Any]) -> str:
    fallback = block.get("fallback") or block.get("text_fallback")
    fallback_html = render_fallback_content(fallback or "No text alternative was supplied.")
    sanitized, error = sanitize_svg(str(block.get("svg", "")))
    chunks: list[str] = []
    if error:
        chunks.append(
            "<div class='visual-error' role='alert'><strong>SVG could not be rendered.</strong> "
            f"{html.escape(error)}</div>"
        )
    else:
        chunks.append(f"<div class='custom-svg-frame'>{sanitized}</div>")
    chunks.append(render_text_alternative(fallback_html))
    return "".join(chunks)


def render_document_decision(
    block: dict[str, Any], document_id: str, global_actions: list[dict[str, Any]], index: int
) -> str:
    block_id = str(block.get("id") or f"decision-{index + 1}")
    item_id = f"{document_id}:{block_id}"
    anchor = document_block_anchor(document_id, block, index)
    owner_key = f"{slugify(item_id)}-{index}"
    selection_mode = str(block.get("selection_mode", "multiple"))
    if selection_mode not in ("multiple", "single"):
        selection_mode = "multiple"
    title = str(block.get("title") or "Decision")
    body = block.get("body") or block.get("content") or ""
    raw_script = script_json(block)
    chunks = [
        f"<article class='card document-decision' id='{html.escape(anchor)}' tabindex='-1' "
        f"data-id='{html.escape(item_id)}' data-owner-key='{html.escape(owner_key)}' "
        f"data-queue='{html.escape(document_id)}' "
        f"data-selection-mode='{selection_mode}' data-search='{html.escape((title + ' ' + str(body)).lower())}'>",
        "<div class='card-content'>",
        f"<div class='card-top'><div><p class='item-position'>Plan decision</p>"
        f"<h3 class='card-title'>{html.escape(title)}</h3></div>"
        "<span class='decision-state'>Unresolved</span></div>",
        render_paragraphs(body),
    ]
    evidence = block.get("evidence", []) or []
    if evidence:
        chunks.append("<ul class='document-points'>")
        chunks.extend(f"<li>{html.escape(str(item))}</li>" for item in evidence)
        chunks.append("</ul>")
    chunks.append(
        "<details class='annotation-panel'><summary>Decision note "
        "<span class='annotation-count' data-count-target='item'></span></summary>"
        "<div class='annotation-editor'><label>General note"
        "<textarea data-note-target='item' placeholder='Add context for the reviewer or apply pass'>"
        "</textarea></label></div></details>"
    )
    chunks.append(f"<script type='application/json' class='raw-item'>{raw_script}</script></div>")
    chunks.append(
        f"<aside class='decision-column' data-owner-id='{html.escape(item_id)}' "
        f"data-owner-key='{html.escape(owner_key)}'><div class='decision-sticky'>"
        f"<fieldset class='decision-panel'><legend>{html.escape(str(block.get('question') or 'What should happen next?'))}</legend>"
        f"<p class='field-hint'>{html.escape(str(block.get('selection_hint') or ('Choose one option.' if selection_mode == 'single' else 'Select every compatible action.')))}</p>"
        "<div class='actions'>"
    )
    for action_index, action in enumerate(block.get("actions", [])):
        chunks.append(
            render_action(
                action,
                owner_key=owner_key,
                queue_id=document_id,
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
                    queue_id=document_id,
                    index=action_index,
                    selection_mode=selection_mode,
                    scope="global",
                )
            )
        chunks.append("</div></details>")
    chunks.append("</fieldset><div class='card-conflict' role='alert' hidden></div></div></aside></article>")
    return "".join(chunks)


def render_document_blocks(data: dict[str, Any], spec: dict[str, Any]) -> str:
    block_specs = spec.get("blocks", []) or []
    if not block_specs:
        return ""
    document_id = str(spec.get("document_id", "document-review"))
    title = str(spec.get("document_title", "Planning document"))
    description = str(spec.get("document_description", "Review the proposal and return structured feedback."))
    blocks = [materialize_block(data, block) for block in block_specs if isinstance(block, dict)]
    decision_count = sum(1 for block in blocks if block.get("type") == "decision")
    chunks = [
        f"<section class='queue document-review' id='{html.escape(document_id)}' data-count='{decision_count}'>",
        f"<div class='queue-head'><div><h2>{html.escape(title)}</h2><p>{html.escape(description)}</p></div>"
        f"<span class='count'>{decision_count} decision{'s' if decision_count != 1 else ''}</span></div>",
        "<div class='document-flow'>",
    ]
    global_actions = spec.get("global_actions", [])
    for index, block in enumerate(blocks):
        block_type = str(block.get("type", "prose"))
        block_id = str(block.get("id") or f"block-{index + 1}")
        title = str(block.get("title") or block_type.replace("_", " ").title())
        if block_type == "decision":
            chunks.append(render_document_decision(block, document_id, global_actions, index))
            continue
        visual_id = f"visual-{slugify(document_id)}-{slugify(block_id)}-{index}"
        item_id = f"{document_id}:{block_id}"
        anchor = document_block_anchor(document_id, block, index)
        chunks.append(
            f"<section class='document-block block-{html.escape(block_type)}' "
            f"id='{html.escape(anchor)}' tabindex='-1' data-id='{html.escape(item_id)}' "
            f"data-queue='{html.escape(document_id)}'>"
            f"<header class='document-block-head'><h3>{html.escape(title)}</h3></header>"
        )
        if block_type == "overview":
            chunks.append(render_paragraphs(block.get("body") or block.get("content"), "document-lead"))
            points = block.get("points", []) or []
            if points:
                chunks.append("<ul class='document-points'>")
                chunks.extend(f"<li>{html.escape(str(point))}</li>" for point in points)
                chunks.append("</ul>")
        elif block_type == "prose":
            chunks.append(render_paragraphs(block.get("body") or block.get("content")))
        elif block_type == "table":
            chunks.append(render_table(block))
        elif block_type == "flow":
            chunks.append(render_flow_block(block, visual_id))
        elif block_type == "timeline":
            chunks.append(render_timeline_block(block))
        elif block_type == "dependency_graph":
            chunks.append(render_dependency_block(block, visual_id))
        elif block_type == "chart":
            chunks.append(render_chart_block(block, visual_id))
        elif block_type == "svg":
            chunks.append(render_custom_svg_block(block))
        else:
            chunks.append(
                f"<div class='visual-error'>Unknown document block type: {html.escape(block_type)}.</div>"
            )
            chunks.append(render_fallback_content(block.get("fallback") or block.get("content")))
        chunks.append(render_block_annotation(item_id, block))
        chunks.append("</section>")
    chunks.append("</div></section>")
    return "".join(chunks)
