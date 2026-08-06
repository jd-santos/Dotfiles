# SPDX-License-Identifier: GPL-3.0-or-later OR Apache-2.0
"""Sanitize the constrained custom SVG escape hatch."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

SVG_NAMESPACE = "http://www.w3.org/2000/svg"
SVG_MAX_BYTES = 100_000
SVG_MAX_ELEMENTS = 500
SVG_MAX_PATH_LENGTH = 20_000
SVG_ALLOWED_ELEMENTS = {
    "svg",
    "g",
    "path",
    "line",
    "polyline",
    "polygon",
    "rect",
    "circle",
    "ellipse",
    "text",
    "tspan",
    "title",
    "desc",
}
SVG_ALLOWED_ATTRIBUTES = {
    "id",
    "viewBox",
    "preserveAspectRatio",
    "role",
    "aria-label",
    "aria-labelledby",
    "transform",
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "opacity",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "width",
    "height",
    "points",
    "d",
    "dx",
    "dy",
    "text-anchor",
    "dominant-baseline",
    "font-size",
    "font-weight",
}
SVG_NUMBER_RE = re.compile(r"^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?(?:px|%|em|rem)?$")
SVG_NUMBER_LIST_RE = re.compile(r"^[\d\s,.+\-eE]+$")
SVG_PATH_RE = re.compile(r"^[MmZzLlHhVvCcSsQqTtAa\d\s,.+\-eE]+$")
SVG_TRANSFORM_RE = re.compile(
    r"^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([\d\s,.+\-eE]+\)\s*)+$"
)
SVG_COLOR_RE = re.compile(r"^(?:none|currentColor|#[0-9a-fA-F]{3,8})$")
SVG_ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.:-]{0,79}$")


def _svg_local_name(name: str) -> tuple[str | None, str]:
    if name.startswith("{") and "}" in name:
        namespace, local = name[1:].split("}", 1)
        return namespace, local
    return None, name


def _valid_svg_attribute(name: str, value: str) -> bool:
    if len(value) > SVG_MAX_PATH_LENGTH:
        return False
    if name == "viewBox":
        parts = re.split(r"[\s,]+", value.strip())
        if len(parts) != 4 or not all(SVG_NUMBER_RE.fullmatch(part) for part in parts):
            return False
        try:
            return float(parts[2]) > 0 and float(parts[3]) > 0
        except ValueError:
            return False
    if name == "preserveAspectRatio":
        return bool(re.fullmatch(r"(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?:\s+(?:meet|slice))?", value))
    if name == "role":
        return value == "img"
    if name in {"aria-label", "aria-labelledby"}:
        return len(value) <= 300 and "<" not in value and ">" not in value
    if name == "id":
        return bool(SVG_ID_RE.fullmatch(value))
    if name in {"fill", "stroke"}:
        return bool(SVG_COLOR_RE.fullmatch(value))
    if name in {"fill-opacity", "stroke-opacity", "opacity"}:
        try:
            return 0 <= float(value) <= 1
        except ValueError:
            return False
    if name in {
        "x",
        "y",
        "x1",
        "y1",
        "x2",
        "y2",
        "cx",
        "cy",
        "r",
        "rx",
        "ry",
        "width",
        "height",
        "dx",
        "dy",
        "font-size",
        "stroke-width",
    }:
        return bool(SVG_NUMBER_RE.fullmatch(value))
    if name in {"points", "stroke-dasharray"}:
        return bool(SVG_NUMBER_LIST_RE.fullmatch(value))
    if name == "d":
        return len(value) <= SVG_MAX_PATH_LENGTH and bool(SVG_PATH_RE.fullmatch(value))
    if name == "transform":
        return bool(SVG_TRANSFORM_RE.fullmatch(value))
    if name in {"stroke-linecap"}:
        return value in {"butt", "round", "square"}
    if name in {"stroke-linejoin"}:
        return value in {"miter", "round", "bevel"}
    if name in {"text-anchor"}:
        return value in {"start", "middle", "end"}
    if name in {"dominant-baseline"}:
        return value in {"auto", "middle", "central", "hanging", "text-after-edge"}
    if name == "font-weight":
        return value in {"normal", "bold", "400", "500", "600", "700"}
    return False


def sanitize_svg(svg_source: str) -> tuple[str | None, str | None]:
    """Return a serialized safe SVG subset or a reviewer-facing error."""
    if not isinstance(svg_source, str) or not svg_source.strip():
        return None, "SVG source is empty."
    if len(svg_source.encode("utf-8")) > SVG_MAX_BYTES:
        return None, "SVG exceeds the 100 KB source limit."
    if re.search(r"<!\s*(?:DOCTYPE|ENTITY)", svg_source, flags=re.IGNORECASE):
        return None, "SVG document type and entity declarations are not allowed."
    try:
        root = ET.fromstring(svg_source)
    except ET.ParseError as error:
        return None, f"SVG is not valid XML: {error}."

    elements = list(root.iter())
    if len(elements) > SVG_MAX_ELEMENTS:
        return None, f"SVG exceeds the {SVG_MAX_ELEMENTS} element limit."
    root_namespace, root_name = _svg_local_name(root.tag)
    if root_name != "svg" or root_namespace not in (None, SVG_NAMESPACE):
        return None, "SVG must use the standard SVG namespace and an svg root element."
    if "viewBox" not in root.attrib:
        return None, "SVG requires a valid viewBox."

    title_found = False
    description_found = False

    def copy_element(source: ET.Element) -> ET.Element:
        nonlocal title_found, description_found
        namespace, tag = _svg_local_name(source.tag)
        if namespace not in (None, SVG_NAMESPACE) or tag not in SVG_ALLOWED_ELEMENTS:
            raise ValueError(f"SVG element '{tag}' is not allowed.")
        if tag == "title" and (source.text or "").strip():
            title_found = True
        elif tag == "desc" and (source.text or "").strip():
            description_found = True
        target = ET.Element(tag)
        for raw_name, raw_value in source.attrib.items():
            attr_namespace, name = _svg_local_name(raw_name)
            if attr_namespace is not None or name not in SVG_ALLOWED_ATTRIBUTES:
                raise ValueError(f"SVG attribute '{name}' is not allowed.")
            value = str(raw_value).strip()
            if not _valid_svg_attribute(name, value):
                raise ValueError(f"SVG attribute '{name}' has an invalid value.")
            target.set(name, value)
        text = source.text or ""
        if text.strip() and tag not in {"text", "tspan", "title", "desc"}:
            raise ValueError(f"SVG element '{tag}' cannot contain text.")
        if len(text) > 2_000:
            raise ValueError("SVG text content is too long.")
        target.text = text
        for child in source:
            target.append(copy_element(child))
            if child.tail and child.tail.strip():
                raise ValueError("SVG mixed text content is not allowed.")
        return target

    try:
        sanitized_root = copy_element(root)
    except ValueError as error:
        return None, str(error)
    if not title_found or not description_found:
        return None, "SVG requires non-empty title and desc elements."
    sanitized_root.set("xmlns", SVG_NAMESPACE)
    return ET.tostring(sanitized_root, encoding="unicode", short_empty_elements=True), None
