# SPDX-License-Identifier: GPL-3.0-or-later OR Apache-2.0
"""Render one portable Offgrid Review artifact."""

from .page import default_spec, render_html
from .svg import sanitize_svg

__all__ = ["default_spec", "render_html", "sanitize_svg"]
