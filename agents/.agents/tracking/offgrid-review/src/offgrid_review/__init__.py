# SPDX-License-Identifier: GPL-3.0-or-later
"""Dependency-free tools for generating Offgrid Review artifacts."""

from .rendering import default_spec, render_html, sanitize_svg
from .rendering.svg import SVG_MAX_BYTES, SVG_MAX_ELEMENTS, SVG_MAX_PATH_LENGTH
from .validation import ReviewValidationError, validate_review

__all__ = [
    "ReviewValidationError",
    "SVG_MAX_BYTES",
    "SVG_MAX_ELEMENTS",
    "SVG_MAX_PATH_LENGTH",
    "default_spec",
    "render_html",
    "sanitize_svg",
    "validate_review",
]
