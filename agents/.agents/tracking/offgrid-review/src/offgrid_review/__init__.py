# SPDX-License-Identifier: GPL-3.0-or-later
"""Dependency-free tools for generating Offgrid Review artifacts."""

from .renderer import default_spec, render_html, sanitize_svg

__all__ = ["default_spec", "render_html", "sanitize_svg"]
