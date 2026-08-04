# SPDX-License-Identifier: GPL-3.0-or-later
"""Render portable Offgrid Review artifacts from deterministic JSON.

The renderer combines read-only source data with an agent-authored review spec
and returns one offline HTML document. The page captures decisions and
annotations. It never applies them to an external system.
"""

from __future__ import annotations

import datetime as dt
import html
import json
import math
import re
import textwrap
import xml.etree.ElementTree as ET
from typing import Any


REVIEW_CSS = r"""
:root {
  color-scheme: light dark;
  --canvas: #f8f6f7;
  --surface: #ffffff;
  --surface-subtle: #f3eff1;
  --surface-raised: #ffffff;
  --text: #201a1c;
  --muted: #6d6468;
  --border: #d8d0d3;
  --border-strong: #aa9da2;
  --blush: #f4d8e1;
  --blush-strong: #e6b8c8;
  --accent: #7a2e4d;
  --accent-ink: #ffffff;
  --focus: #7a2e4d;
  --good: #176b45;
  --good-surface: #ddf7e9;
  --warning: #7a4d00;
  --warning-surface: #fff3d3;
  --danger: #b42318;
  --danger-surface: #fee4e2;
  --risk: #7c4659;
  --risk-surface: #f7e9ee;
  --risk-border: #c994a7;
  --shadow: 0 16px 42px rgba(58, 35, 44, 0.12);
  --font-ui: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-heading: "Trebuchet MS", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  --font-display: Georgia, "Times New Roman", "DejaVu Serif", serif;
  --header-height: 82px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #171316;
    --surface: #211b1f;
    --surface-subtle: #2a2227;
    --surface-raised: #2d252a;
    --text: #faf5f7;
    --muted: #c9bcc2;
    --border: #453840;
    --border-strong: #76636e;
    --blush: #4a2b36;
    --blush-strong: #704154;
    --accent: #f0a9c0;
    --accent-ink: #2a101a;
    --focus: #f0a9c0;
    --good: #79d6a7;
    --good-surface: #173626;
    --warning: #ffd28a;
    --warning-surface: #392a14;
    --danger: #ffb4ab;
    --danger-surface: #3b1615;
    --risk: #e4a6ba;
    --risk-surface: #38262e;
    --risk-border: #76505f;
    --shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
  }
}

:root[data-theme="light"] {
  color-scheme: light;
  --canvas: #f8f6f7;
  --surface: #ffffff;
  --surface-subtle: #f3eff1;
  --surface-raised: #ffffff;
  --text: #201a1c;
  --muted: #6d6468;
  --border: #d8d0d3;
  --border-strong: #aa9da2;
  --blush: #f4d8e1;
  --blush-strong: #e6b8c8;
  --accent: #7a2e4d;
  --accent-ink: #ffffff;
  --focus: #7a2e4d;
  --good: #176b45;
  --good-surface: #ddf7e9;
  --warning: #7a4d00;
  --warning-surface: #fff3d3;
  --danger: #b42318;
  --danger-surface: #fee4e2;
  --risk: #7c4659;
  --risk-surface: #f7e9ee;
  --risk-border: #c994a7;
  --shadow: 0 16px 42px rgba(58, 35, 44, 0.12);
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --canvas: #171316;
  --surface: #211b1f;
  --surface-subtle: #2a2227;
  --surface-raised: #2d252a;
  --text: #faf5f7;
  --muted: #c9bcc2;
  --border: #453840;
  --border-strong: #76636e;
  --blush: #4a2b36;
  --blush-strong: #704154;
  --accent: #f0a9c0;
  --accent-ink: #2a101a;
  --focus: #f0a9c0;
  --good: #79d6a7;
  --good-surface: #173626;
  --warning: #ffd28a;
  --warning-surface: #392a14;
  --danger: #ffb4ab;
  --danger-surface: #3b1615;
  --risk: #e4a6ba;
  --risk-surface: #38262e;
  --risk-border: #76505f;
  --shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-width: 320px;
  overflow-x: clip;
  background: var(--canvas);
  color: var(--text);
  font-family: var(--font-ui);
  line-height: 1.5;
}

button,
input,
select,
textarea {
  font: inherit;
}

button,
select,
summary,
label[for] {
  -webkit-tap-highlight-color: transparent;
}

button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
summary:focus-visible,
a:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 3px;
}

[hidden] {
  display: none !important;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 30;
  min-height: var(--header-height);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.header-inner {
  width: min(1560px, 100%);
  margin: 0 auto;
  padding: 14px clamp(16px, 3vw, 36px);
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(240px, 420px) auto;
  align-items: center;
  gap: 24px;
}

.header-inner > *,
.review-tools > *,
.queue-head > * {
  min-width: 0;
}

.title-block {
  display: grid;
  gap: 3px;
}

.title-row {
  display: flex;
  align-items: center;
}

.title-block h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.15rem, 2vw, 1.55rem);
  font-weight: 400;
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.about-review {
  position: relative;
  flex: none;
}

.title-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 0.72rem;
}

.review-status {
  color: var(--accent);
  font-weight: 750;
}

.title-meta-separator {
  color: var(--border-strong);
}

.about-trigger {
  width: 24px;
  height: 24px;
  padding: 0;
  display: grid;
  place-items: center;
  color: var(--muted);
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.about-trigger svg {
  width: 17px;
  height: 17px;
}

.about-trigger:hover {
  color: var(--text);
  background: var(--surface-subtle);
}

.about-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 80;
  width: min(340px, calc(100vw - 32px));
  padding: 12px 13px;
  color: var(--text);
  background: var(--surface-raised);
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  box-shadow: var(--shadow);
  font-size: 0.8rem;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity 140ms ease-out, transform 180ms ease-out, visibility 140ms;
}

.about-tooltip p {
  margin: 0;
}

.about-tooltip p + p {
  margin-top: 7px;
  color: var(--muted);
}

.about-review:hover .about-tooltip,
.about-review:focus-within .about-tooltip,
.about-review.pinned .about-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.progress-block {
  min-width: 0;
}

.progress-line {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  color: var(--muted);
  font-size: 0.78rem;
}

.progress-line strong {
  color: var(--text);
}

.progress-track {
  height: 7px;
  margin-top: 8px;
  overflow: hidden;
  background: var(--surface-subtle);
  border: 1px solid var(--border);
  border-radius: 4px;
}

.progress-fill {
  width: 0;
  height: 100%;
  background: var(--accent);
  transition: width 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.header-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.header-actions button {
  white-space: nowrap;
}

.button,
.header-actions button,
.theme-label select,
.review-tools button,
.annotation-toggle,
.summary-actions button,
.mobile-tray button {
  min-height: 38px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font-weight: 700;
}

.header-actions button,
.review-tools button,
.summary-actions button,
.mobile-tray button {
  padding: 7px 11px;
}

.theme-label select {
  width: 100%;
  min-height: 38px;
  padding: 7px 28px 7px 9px;
  color: var(--text);
  background: var(--surface);
}

.header-actions .header-link {
  min-height: 34px;
  padding: 4px 2px;
  color: var(--muted);
  background: transparent;
  border-color: transparent;
  border-radius: 0;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 4px;
}

.header-actions .header-link:hover {
  color: var(--text);
  border-color: transparent;
  text-decoration-color: var(--accent);
}

.button-primary,
.header-actions .button-primary,
.summary-actions .button-primary {
  color: var(--accent-ink);
  background: var(--accent);
  border-color: var(--accent);
}

.header-actions button:not(.header-link):hover,
.review-tools button:hover,
.summary-actions button:hover,
.annotation-toggle:hover,
.mobile-tray button:hover {
  border-color: var(--accent);
}

.workspace {
  width: min(1560px, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(210px, 248px) minmax(0, 1fr);
  align-items: start;
}

.review-rail {
  position: sticky;
  top: var(--header-height);
  max-height: calc(100vh - var(--header-height));
  overflow: auto;
  padding: 26px 20px 40px clamp(16px, 3vw, 36px);
  border-right: 1px solid var(--border);
}

.rail-section + .rail-section {
  margin-top: 30px;
}

.rail-section h2 {
  margin: 0 0 10px;
  font-family: var(--font-heading);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: -0.005em;
}

.queue-nav {
  display: grid;
  gap: 5px;
}

.queue-nav a {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 40px;
  padding: 7px 9px;
  color: var(--muted);
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: 7px;
}

.queue-nav a:hover,
.queue-nav a[aria-current="true"] {
  color: var(--text);
  background: var(--blush);
  border-color: var(--blush-strong);
}

.queue-count {
  min-width: 24px;
  text-align: right;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  font-weight: 800;
}

.toc-launcher,
.toc-drawer {
  display: none;
}

.toc-launcher {
  position: fixed;
  left: 18px;
  bottom: 22px;
  z-index: 54;
  width: 46px;
  height: 46px;
  padding: 0;
  place-items: center;
  color: var(--accent-ink);
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 50%;
  box-shadow: 0 10px 28px rgba(35, 22, 29, 0.22);
  cursor: pointer;
}

.toc-launcher svg,
.toc-drawer-close svg {
  width: 20px;
  height: 20px;
}

.toc-drawer {
  position: fixed;
  left: 18px;
  bottom: 80px;
  z-index: 54;
  width: min(360px, calc(100vw - 36px));
  max-height: min(68vh, 620px);
  padding: 16px;
  overflow: auto;
  color: var(--text);
  background: var(--surface-raised);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(35, 22, 29, 0.24);
}

.toc-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}

.toc-drawer-head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 400;
}

.toc-drawer-close {
  width: 34px;
  height: 34px;
  padding: 0;
  display: grid;
  place-items: center;
  color: var(--muted);
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.toc-drawer-close:hover {
  color: var(--text);
  background: var(--surface-subtle);
}

.toc-nav {
  display: grid;
  gap: 2px;
}

.toc-nav a {
  padding: 4px 0;
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.35;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 3px;
}

.toc-nav a:hover,
.toc-nav a[aria-current="location"] {
  color: var(--text);
  text-decoration-color: var(--accent);
}

.toc-nav a[aria-current="location"] {
  font-weight: 750;
}

.review-tools {
  display: grid;
  gap: 12px;
}

.review-tools label,
.theme-label {
  display: grid;
  gap: 5px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
}

.review-tools input,
.review-tools select {
  width: 100%;
  min-height: 40px;
  padding: 8px 9px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 7px;
}

.review-nav-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.review-nav-buttons button {
  min-width: 0;
  font-size: 0.76rem;
}

.rail-meta > summary {
  min-height: 38px;
  padding: 8px 0;
  color: var(--muted);
  cursor: pointer;
  font-family: var(--font-heading);
  font-size: 0.82rem;
  font-weight: 700;
}

.rail-meta[open] > summary {
  margin-bottom: 10px;
  color: var(--text);
}

.rail-meta .theme-label {
  margin: 14px 0;
}

.meta-list {
  margin: 0;
  display: grid;
  gap: 7px;
  color: var(--muted);
  font-size: 0.75rem;
}

.meta-list div {
  display: grid;
  gap: 2px;
}

.meta-list dt {
  color: var(--text);
  font-weight: 750;
}

.meta-list dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.storage-warning {
  padding: 9px;
  color: var(--warning);
  background: var(--warning-surface);
  border: 1px solid currentColor;
  border-radius: 7px;
}

.review-main {
  min-width: 0;
  padding: 26px clamp(16px, 3vw, 40px) 120px;
}

.agent-note {
  max-width: 76ch;
  margin: 0 0 30px;
  padding: 14px 16px;
  color: var(--muted);
  background: var(--blush);
  border: 1px solid var(--blush-strong);
  border-radius: 10px;
  font-size: 0.86rem;
}

.agent-note strong {
  color: var(--text);
}

.queue {
  scroll-margin-top: calc(var(--header-height) + 20px);
}

.queue + .queue {
  margin-top: 54px;
}

.queue-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  align-items: end;
  margin-bottom: 18px;
}

.queue-head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.35rem, 2.3vw, 2rem);
  font-weight: 400;
  line-height: 1.18;
  letter-spacing: -0.015em;
}

.queue-head p {
  max-width: 70ch;
  margin: 7px 0 0;
  color: var(--muted);
}

.count {
  color: var(--muted);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}

.empty,
.no-results {
  padding: 20px;
  color: var(--good);
  background: var(--good-surface);
  border: 1px solid currentColor;
  border-radius: 10px;
}

.card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(290px, 348px);
  margin: 0 0 18px;
  overflow: clip;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  scroll-margin-top: calc(var(--header-height) + 18px);
  transition: border-color 180ms ease-out, box-shadow 180ms ease-out;
}

.card:hover,
.card:focus-within {
  border-color: var(--border-strong);
}

.card.done {
  border-color: var(--blush-strong);
}

.card.has-conflict {
  border-color: var(--danger);
}

.card-content {
  min-width: 0;
  padding: clamp(18px, 2.6vw, 30px);
}

.card-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: start;
}

.item-position {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 0.74rem;
}

.card-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.08rem, 1.8vw, 1.35rem);
  font-weight: 400;
  line-height: 1.28;
  letter-spacing: -0.01em;
}

.decision-state {
  max-width: 170px;
  padding: 5px 7px;
  color: var(--muted);
  background: var(--surface-subtle);
  border: 1px solid var(--border);
  border-radius: 5px;
  font-size: 0.72rem;
  font-weight: 750;
  text-align: right;
}

.card.done .decision-state {
  color: var(--accent);
  background: var(--blush);
  border-color: var(--blush-strong);
}

.card.has-conflict .decision-state {
  color: var(--danger);
  background: var(--danger-surface);
  border-color: var(--danger);
}

.facts {
  margin: 22px 0 0;
  border-top: 1px solid var(--border);
}

.fact {
  display: grid;
  grid-template-columns: minmax(110px, 0.32fr) minmax(0, 1fr);
  gap: 18px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.fact dt {
  color: var(--muted);
  text-transform: capitalize;
}

.fact dd {
  margin: 0;
  color: var(--text);
  font-family: var(--font-display);
  font-weight: 400;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.evidence-disclosure,
.annotation-panel {
  margin-top: 16px;
  border-top: 1px solid var(--border);
}

.evidence-disclosure summary,
.annotation-panel summary {
  min-height: 42px;
  padding: 11px 2px;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 750;
}

.evidence-disclosure[open] summary,
.annotation-panel[open] summary {
  color: var(--text);
}

.raw-evidence {
  max-height: 320px;
  overflow: auto;
  margin: 0 0 12px;
  padding: 13px;
  color: var(--muted);
  background: var(--surface-subtle);
  border: 1px solid var(--border);
  border-radius: 8px;
  font: 0.76rem/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.document-flow {
  display: grid;
  gap: 0;
}

.document-block {
  padding: clamp(22px, 3vw, 38px) 0;
  border-top: 1px solid var(--border);
  scroll-margin-top: calc(var(--header-height) + 18px);
}

.document-block:first-child {
  border-top: 0;
}

.document-block-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 18px;
}

.document-block-head h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.25rem, 2vw, 1.7rem);
  font-weight: 400;
  letter-spacing: -0.015em;
}

.block-overview {
  margin-bottom: 18px;
  padding: clamp(20px, 3vw, 32px);
  background: var(--blush);
  border: 1px solid var(--blush-strong);
  border-radius: 12px;
}

.document-copy,
.document-lead {
  max-width: 72ch;
  margin-top: 12px;
}

.document-copy p,
.document-lead p,
.text-alternative-copy p {
  margin: 0 0 10px;
}

.document-lead {
  font-family: var(--font-display);
  font-size: clamp(1.04rem, 1.5vw, 1.22rem);
  line-height: 1.55;
}

.document-points {
  max-width: 72ch;
  margin: 16px 0 0;
  padding-left: 22px;
}

.document-points li + li {
  margin-top: 7px;
}

.document-visual,
.custom-svg-frame svg {
  display: block;
  width: 100%;
  height: auto;
  max-height: 440px;
  margin-top: 18px;
  color: var(--accent);
  background: var(--surface-subtle);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.visual-edge,
.chart-axis {
  stroke: var(--border-strong);
  stroke-width: 2;
}

.visual-node-shape {
  fill: var(--surface-raised);
  stroke: var(--accent);
  stroke-width: 1.5;
}

.visual-node-label,
.visual-node-detail,
.chart-label,
.chart-value {
  fill: var(--text);
  font-family: var(--font-ui);
}

.visual-node-label {
  font-size: 13px;
  font-weight: 700;
}

.visual-node-detail,
.chart-label {
  fill: var(--muted);
  font-size: 10px;
}

.chart-value {
  font-family: var(--font-display);
  font-size: 12px;
}

.chart-bar {
  fill: var(--blush-strong);
  stroke: var(--accent);
  stroke-width: 1;
}

.chart-line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 3;
}

.chart-point {
  fill: var(--surface-raised);
  stroke: var(--accent);
  stroke-width: 3;
}

.text-alternative {
  margin-top: 10px;
  border-top: 1px solid var(--border);
}

.text-alternative > summary {
  min-height: 40px;
  padding: 10px 2px;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 700;
}

.text-alternative-body {
  padding: 2px 4px 12px;
  color: var(--muted);
  font-size: 0.82rem;
}

.text-alternative-body .table-wrap {
  color: var(--text);
}

.timeline-list {
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.timeline-list li {
  display: grid;
  grid-template-columns: minmax(90px, 0.22fr) minmax(0, 1fr);
  gap: 18px;
  padding: 14px 0;
  border-top: 1px solid var(--border);
}

.timeline-when {
  color: var(--accent);
  font-family: var(--font-display);
}

.timeline-list strong {
  font-family: var(--font-display);
  font-weight: 400;
}

.timeline-list p {
  margin: 4px 0 0;
  color: var(--muted);
}

.visual-error {
  margin-top: 14px;
  padding: 11px 13px;
  color: var(--danger);
  background: var(--danger-surface);
  border: 1px solid currentColor;
  border-radius: 8px;
}

.custom-svg-frame {
  margin-top: 18px;
}

.custom-svg-frame svg {
  padding: 12px;
}

.document-annotation {
  max-width: 72ch;
}

.document-decision {
  margin-top: 24px;
}

.review-table td {
  font-family: var(--font-display);
}

.plan-sections {
  margin-top: 26px;
  display: grid;
  gap: 22px;
}

.plan-section {
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.plan-section-head {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: start;
}

.plan-section h4 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.005em;
}

.plan-copy {
  max-width: 72ch;
  margin-top: 10px;
  color: var(--text);
}

.plan-copy p {
  margin: 0 0 10px;
}

.table-wrap {
  margin-top: 12px;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.review-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.review-table th,
.review-table td {
  padding: 9px 11px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--border);
}

.review-table th {
  color: var(--muted);
  background: var(--surface-subtle);
  font-weight: 750;
}

.review-table tr:last-child td {
  border-bottom: 0;
}

.diagram-flow {
  margin: 14px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  list-style: none;
}

.diagram-node {
  min-height: 76px;
  padding: 12px;
  background: var(--surface-subtle);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
}

.diagram-node strong,
.diagram-node span {
  display: block;
}

.diagram-node span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 0.76rem;
}

.connection-list {
  margin: 10px 0 0;
  padding-left: 20px;
  color: var(--muted);
  font-size: 0.78rem;
}

.annotation-toggle {
  flex: none;
  min-height: 30px;
  padding: 4px 8px;
  color: var(--accent);
  background: transparent;
  border-color: var(--border);
  font-size: 0.72rem;
}

.annotation-count:not(:empty) {
  margin-left: 4px;
  font-variant-numeric: tabular-nums;
}

.annotation-editor,
.inline-annotation {
  margin-top: 9px;
}

.annotation-editor label,
.inline-annotation label {
  display: grid;
  gap: 5px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
}

textarea {
  width: 100%;
  min-height: 86px;
  padding: 10px 11px;
  resize: vertical;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
}

.decision-column {
  min-width: 0;
  padding: 24px 22px;
  background: var(--surface-subtle);
  border-left: 1px solid var(--border);
}

.decision-sticky {
  position: sticky;
  top: calc(var(--header-height) + 18px);
}

.decision-panel {
  margin: 0;
  padding: 0;
  border: 0;
}

.decision-panel legend {
  width: 100%;
  padding: 0;
  font-family: var(--font-heading);
  font-size: 1rem;
  line-height: 1.35;
  font-weight: 700;
  letter-spacing: -0.005em;
}

.field-hint {
  margin: 6px 0 14px;
  color: var(--muted);
  font-size: 0.78rem;
}

.actions {
  display: grid;
  gap: 8px;
}

.action-option {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 9px;
  align-items: start;
  padding: 11px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 9px;
}

.action-option:hover {
  border-color: var(--border-strong);
}

.action-option.selected {
  background: var(--blush);
  border-color: var(--accent);
}

.action-option.danger {
  color: var(--risk);
  background: var(--risk-surface);
  border-color: var(--risk-border);
}

.action-option input {
  width: 19px;
  height: 19px;
  margin: 2px 0 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.action-option label {
  min-width: 0;
  cursor: pointer;
}

.action-label,
.action-description,
.action-signals {
  display: block;
}

.action-label {
  color: var(--text);
  font-family: var(--font-heading);
  font-size: 0.86rem;
  font-weight: 700;
}

.action-option.danger .action-label {
  color: var(--text);
}

.action-description {
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.74rem;
}

.action-signals {
  margin-top: 6px;
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 750;
}

.action-option.danger .action-signals {
  color: var(--risk);
}

.action-note-toggle {
  min-height: 28px;
  padding: 3px 6px;
  color: var(--accent);
  background: transparent;
  border: 0;
  cursor: pointer;
  font-size: 0.68rem;
  font-weight: 750;
}

.inline-annotation {
  grid-column: 2 / -1;
}

.fallback-group {
  margin-top: 18px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}

.fallback-group > summary {
  min-height: 42px;
  padding: 11px 0;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 750;
}

.fallback-group[open] > summary {
  color: var(--text);
}

.fallback-group > .actions {
  margin-top: 4px;
}

.fallback-label {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 750;
}

.card-conflict {
  margin: 14px 0 0;
  padding: 9px 10px;
  color: var(--danger);
  background: var(--danger-surface);
  border: 1px solid currentColor;
  border-radius: 7px;
  font-size: 0.75rem;
}

.summary-banner {
  margin: 0 0 22px;
  padding: 11px 13px;
  color: var(--warning);
  background: var(--warning-surface);
  border: 1px solid currentColor;
  border-radius: 8px;
  font-size: 0.82rem;
}

.summary-panel {
  position: fixed;
  top: var(--header-height);
  right: 0;
  bottom: 0;
  z-index: 40;
  width: min(390px, 94vw);
  overflow: auto;
  padding: 22px;
  background: var(--surface-raised);
  border-left: 1px solid var(--border);
  box-shadow: -18px 0 44px rgba(35, 22, 29, 0.18);
}

.summary-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-bottom: 18px;
}

.summary-head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 400;
  letter-spacing: -0.01em;
}

.summary-close {
  min-height: 34px;
  padding: 5px 9px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  cursor: pointer;
}

.summary-rows {
  margin: 0;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.summary-row dt {
  color: var(--muted);
}

.summary-row dd {
  margin: 0;
  font-weight: 800;
}

.summary-row.good dd {
  color: var(--good);
}

.summary-row.warning dd {
  color: var(--warning);
}

.summary-row.bad dd {
  color: var(--danger);
}

.summary-panel h3 {
  margin: 28px 0 8px;
  font-family: var(--font-heading);
  font-size: 0.9rem;
  font-weight: 700;
}

.summary-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.summary-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
  font-size: 0.8rem;
}

.summary-list b {
  color: var(--text);
}

.summary-actions {
  display: grid;
  gap: 8px;
  margin-top: 24px;
}

.summary-actions button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

#exportBox {
  width: min(900px, calc(100% - 32px));
  min-height: 220px;
  margin: 0 auto 40px;
  display: none;
}

.toast {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 70;
  max-width: min(360px, calc(100vw - 36px));
  padding: 10px 13px;
  color: var(--accent-ink);
  background: var(--accent);
  border-radius: 8px;
  box-shadow: var(--shadow);
  font-weight: 750;
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
  transition: opacity 160ms ease-out, transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.toast.show {
  opacity: 1;
  transform: translateY(0);
}

.mobile-tray {
  display: none;
}

.card[hidden],
.queue[hidden] {
  display: none;
}

@media (max-width: 1280px) {
  :root {
    --header-height: 126px;
  }

  .header-inner {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .progress-block {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}

@media (max-width: 1120px) {
  .workspace {
    display: block;
  }

  .review-rail {
    position: static;
    max-height: none;
    padding: 18px clamp(16px, 3vw, 36px);
    display: grid;
    grid-template-columns: minmax(200px, 0.8fr) minmax(320px, 1.2fr) minmax(180px, 0.7fr);
    gap: 24px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .rail-section + .rail-section {
    margin-top: 0;
  }

  .document-toc-wide {
    display: none;
  }

  .toc-launcher {
    display: grid;
  }

  .toc-drawer {
    display: block;
  }

  .review-rail.document-only .rail-meta {
    grid-column: 1 / -1;
  }

  .review-tools {
    grid-template-columns: 1fr 1fr;
  }

  .review-tools label:first-child,
  .review-nav-buttons {
    grid-column: 1 / -1;
  }
}

@media (max-width: 820px) {
  :root {
    --header-height: 0px;
  }

  .app-header {
    position: static;
  }

  .header-inner {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .header-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .progress-block {
    grid-column: auto;
    grid-row: auto;
  }

  .review-rail {
    grid-template-columns: 1fr 1fr;
  }

  .rail-meta {
    grid-column: 1 / -1;
  }

  .card {
    grid-template-columns: minmax(0, 1fr) minmax(260px, 310px);
  }

  .decision-column {
    padding: 20px 16px;
  }
}

@media (max-width: 680px) {
  body {
    padding-bottom: 68px;
  }

  .title-row {
    align-items: flex-start;
  }

  .about-tooltip {
    position: fixed;
    top: 68px;
    right: 16px;
    left: 16px;
    width: auto;
  }

  .header-actions {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }

  .header-actions button {
    width: auto;
    min-width: 0;
  }

  .review-rail {
    display: block;
    padding: 14px 16px 18px;
  }

  .review-rail.document-only {
    display: block;
  }

  .toc-launcher {
    bottom: 80px;
  }

  .toc-drawer {
    bottom: 138px;
    max-height: min(58vh, 520px);
  }

  .rail-section + .rail-section {
    margin-top: 18px;
  }

  .queue-nav {
    display: flex;
    overflow-x: auto;
    padding-bottom: 3px;
  }

  .queue-nav a {
    flex: 0 0 min(72vw, 240px);
  }

  .review-tools {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .review-tools input,
  .review-tools select,
  .review-tools button {
    min-width: 0;
  }

  .rail-meta {
    display: block;
  }

  .review-main {
    padding: 22px 12px 90px;
  }

  .agent-note {
    margin: 0 4px 24px;
  }

  .queue-head {
    margin: 0 4px 14px;
  }

  .queue-head h2 {
    font-size: 1.4rem;
  }

  .card {
    display: block;
    overflow: visible;
    border-radius: 11px;
  }

  .card-content {
    padding: 18px 16px;
  }

  .card-top {
    display: block;
  }

  .decision-state {
    width: fit-content;
    max-width: 100%;
    margin-top: 10px;
    text-align: left;
  }

  .fact {
    grid-template-columns: 1fr;
    gap: 2px;
  }

  .decision-column {
    border: 0;
    border-top: 1px solid var(--border);
  }

  .decision-sticky {
    position: static;
  }

  .mobile-tray {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 55;
    display: block;
    background: var(--surface-raised);
    border-top: 1px solid var(--border-strong);
    box-shadow: 0 -14px 34px rgba(35, 22, 29, 0.2);
  }

  .mobile-tray-bar {
    min-height: 60px;
    padding: 8px 12px;
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) 56px 68px;
    gap: 6px;
    align-items: center;
  }

  .mobile-tray-bar button {
    min-width: 0;
    padding: 6px;
    font-size: 0.72rem;
  }

  .mobile-tray-title {
    min-width: 0;
  }

  .mobile-tray-title strong,
  .mobile-tray-title span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-tray-title strong {
    font-size: 0.78rem;
  }

  .mobile-tray-title span {
    color: var(--muted);
    font-size: 0.7rem;
  }

  .mobile-tray-body {
    max-height: min(68vh, 560px);
    overflow: auto;
    padding: 0 12px 14px;
    border-top: 1px solid var(--border);
  }

  .mobile-tray-body .decision-column {
    padding: 16px 4px 4px;
    background: var(--surface-raised);
    border: 0;
  }

  .summary-panel {
    top: 0;
    width: 100%;
  }

  .toast {
    bottom: 78px;
  }
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }

  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
"""


REVIEW_JS = r"""
const STORAGE_KEY = __STORAGE_KEY__;
const THEME_KEY = `${STORAGE_KEY}:theme`;
const DOWNLOAD_NAME = __DOWNLOAD_NAME__;
const CONSOLE_TITLE = __CONSOLE_TITLE__;
const REVIEW_META = __REVIEW_META__;
const ACTION_SPECS = __ACTION_SPECS__;
const RISK_ORDER = { high: 3, medium: 2, low: 1, none: 0 };
const cardIndex = new Map(
  [...document.querySelectorAll('.card')].map(card => [card.dataset.id, card]),
);
const documentBlockIndex = new Map(
  [...document.querySelectorAll('.document-block[data-id]')]
    .map(block => [block.dataset.id, block]),
);
let storageAvailable = false;
let activeMobileCard = null;
let mobileTrayOpen = false;
let mobileRaf = 0;

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function actionSpec(queue, actionId) {
  return ACTION_SPECS[`${queue}.${actionId}`]
    || ACTION_SPECS[`_global.${actionId}`]
    || {};
}

function normalizeNotes(entry) {
  const notes = entry?.notes || {};
  return {
    item: String(notes.item ?? entry?.note ?? ''),
    actions: { ...(notes.actions || {}) },
    sections: { ...(notes.sections || {}) },
  };
}

function normalizeDecision(entry) {
  if (!entry || typeof entry !== 'object') return null;
  let actions = [];
  if (Array.isArray(entry.actions)) {
    actions = entry.actions
      .map(action => typeof action === 'string'
        ? { id: action, label: action }
        : { id: action?.id, label: action?.label || action?.id })
      .filter(action => action.id);
  } else if (entry.action) {
    actions = [{ id: entry.action, label: entry.label || entry.action }];
  }
  return { ...entry, actions, notes: normalizeNotes(entry) };
}

function loadDecisions() {
  try {
    const probe = '__review_console_storage_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    storageAvailable = true;
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return Object.fromEntries(
      Object.entries(stored)
        .map(([id, entry]) => [id, normalizeDecision(entry)])
        .filter(([, entry]) => entry),
    );
  } catch (_) {
    storageAvailable = false;
    return {};
  }
}

let decisions = loadDecisions();
const totalCards = document.querySelectorAll('.card').length;

function updateStorageStatus() {
  const el = document.getElementById('storageStatus');
  el.textContent = storageAvailable
    ? 'Saved in this browser'
    : 'Session only; download before closing';
  el.classList.toggle('storage-warning', !storageAvailable);
}

function persist() {
  if (storageAvailable) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
    } catch (_) {
      storageAvailable = false;
      updateStorageStatus();
    }
  }
  updateProgress();
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(window.reviewToastTimer);
  window.reviewToastTimer = setTimeout(() => el.classList.remove('show'), 1900);
}

function decisionColumn(card) {
  return document.querySelector(
    `.decision-column[data-owner-key="${CSS.escape(card.dataset.ownerKey)}"]`,
  );
}

function controlsForCard(card) {
  return [...(decisionColumn(card)?.querySelectorAll('.action-input') || [])];
}

function textareasForCard(card) {
  return [
    ...card.querySelectorAll('textarea[data-note-target]'),
    ...(decisionColumn(card)?.querySelectorAll('textarea[data-note-target]') || []),
  ];
}

function cardForControl(control) {
  const direct = control.closest('.card');
  if (direct) return direct;
  const owner = control.closest('.decision-column')?.dataset.ownerId;
  return owner ? cardIndex.get(owner) : null;
}

function cardRaw(card) {
  const raw = card.querySelector('.raw-item');
  return raw ? JSON.parse(raw.textContent) : null;
}

function selectedActions(card) {
  return controlsForCard(card)
    .filter(input => input.checked)
    .map(input => ({
      id: input.dataset.action,
      label: input.dataset.label || input.dataset.action,
    }));
}

function readNotes(card) {
  const notes = { item: '', actions: {}, sections: {} };
  textareasForCard(card).forEach(textarea => {
    const target = textarea.dataset.noteTarget || 'item';
    const value = textarea.value;
    if (target === 'item') notes.item = value;
    else if (target.startsWith('action:')) {
      notes.actions[target.slice(7)] = value;
    } else if (target.startsWith('section:')) {
      notes.sections[target.slice(8)] = value;
    }
  });
  return notes;
}

function hasNotes(notes) {
  return Boolean(
    notes.item.trim()
    || Object.values(notes.actions).some(value => String(value).trim())
    || Object.values(notes.sections).some(value => String(value).trim()),
  );
}

function selectedIds(entry) {
  return (entry?.actions || []).map(action => action.id);
}

function conflictPairs(entry) {
  const ids = new Set(selectedIds(entry));
  const pairs = new Set();
  for (const id of ids) {
    const spec = actionSpec(entry.queue, id);
    for (const other of spec.conflicts_with || []) {
      if (ids.has(other)) pairs.add([id, other].sort().join('|'));
    }
  }
  return [...pairs];
}

function updateAnnotationCounts(card, notes) {
  const column = decisionColumn(card);
  const scopes = [card, column].filter(Boolean);
  scopes.forEach(scope => {
    scope.querySelectorAll('[data-count-target]').forEach(el => {
      const target = el.dataset.countTarget;
      let value = '';
      if (target === 'item') value = notes.item;
      else if (target.startsWith('action:')) value = notes.actions[target.slice(7)] || '';
      else if (target.startsWith('section:')) value = notes.sections[target.slice(8)] || '';
      el.textContent = String(value).trim() ? '1' : '';
    });
  });
}

function applyDecisionState(card, entry) {
  const actions = entry?.actions || [];
  const notes = entry?.notes || { item: '', actions: {}, sections: {} };
  const conflicts = entry ? conflictPairs(entry) : [];
  card.classList.toggle('done', actions.length > 0);
  card.classList.toggle('has-conflict', conflicts.length > 0);
  const state = card.querySelector('.decision-state');
  if (conflicts.length) state.textContent = 'Resolve conflicting actions';
  else if (actions.length === 1) state.textContent = actions[0].label;
  else if (actions.length > 1) state.textContent = `${actions.length} actions selected`;
  else state.textContent = 'Unresolved';

  const ids = new Set(actions.map(action => action.id));
  controlsForCard(card).forEach(input => {
    input.checked = ids.has(input.dataset.action);
    input.closest('.action-option')?.classList.toggle('selected', input.checked);
  });

  const conflict = decisionColumn(card)?.querySelector('.card-conflict');
  if (conflict) {
    conflict.hidden = conflicts.length === 0;
    conflict.textContent = conflicts.length
      ? 'These choices conflict. Remove one before export.'
      : '';
  }
  updateAnnotationCounts(card, notes);
  updateMobileTray(card);
}

function fillExistingNotes(card, notes) {
  textareasForCard(card).forEach(textarea => {
    const target = textarea.dataset.noteTarget || 'item';
    if (target === 'item') textarea.value = notes.item || '';
    else if (target.startsWith('action:')) {
      textarea.value = notes.actions[target.slice(7)] || '';
    } else if (target.startsWith('section:')) {
      textarea.value = notes.sections[target.slice(8)] || '';
    }
  });
}

function applyExisting() {
  cardIndex.forEach(card => {
    const entry = decisions[card.dataset.id];
    if (!entry) return;
    fillExistingNotes(card, entry.notes);
    applyDecisionState(card, entry);
  });
}

function documentBlockRaw(block) {
  const raw = block.querySelector('.block-raw');
  return raw ? JSON.parse(raw.textContent) : null;
}

function updateDocumentAnnotationState(block, value) {
  const count = block.querySelector('[data-document-count]');
  if (count) count.textContent = String(value || '').trim() ? '1' : '';
}

function applyExistingDocumentAnnotations() {
  documentBlockIndex.forEach(block => {
    const entry = decisions[block.dataset.id];
    const value = entry?.notes?.item || entry?.note || '';
    const textarea = block.querySelector('textarea[data-document-note]');
    if (textarea) textarea.value = value;
    updateDocumentAnnotationState(block, value);
  });
}

function syncDocumentAnnotation(block) {
  const id = block.dataset.id;
  const textarea = block.querySelector('textarea[data-document-note]');
  const value = textarea?.value || '';
  if (!value.trim()) {
    delete decisions[id];
    updateDocumentAnnotationState(block, '');
    persist();
    return;
  }
  const now = new Date().toISOString();
  decisions[id] = {
    id,
    queue: block.dataset.queue,
    actions: [],
    action: null,
    label: null,
    note: value,
    notes: { item: value, actions: {}, sections: {} },
    item: documentBlockRaw(block),
    decided_at: null,
    updated_at: now,
  };
  updateDocumentAnnotationState(block, value);
  persist();
}

function syncDecision(card) {
  const id = card.dataset.id;
  const previous = decisions[id] || {};
  const actions = selectedActions(card);
  const notes = readNotes(card);
  if (!actions.length && !hasNotes(notes)) {
    delete decisions[id];
    applyDecisionState(card, null);
    persist();
    return;
  }
  const now = new Date().toISOString();
  decisions[id] = {
    ...previous,
    id,
    queue: card.dataset.queue,
    actions,
    action: actions.length === 1 ? actions[0].id : null,
    label: actions.length === 1 ? actions[0].label : null,
    note: notes.item,
    notes,
    item: cardRaw(card),
    decided_at: previous.decided_at || (actions.length ? now : null),
    updated_at: now,
  };
  applyDecisionState(card, decisions[id]);
  persist();
}

function handleActionChange(input) {
  const card = cardForControl(input);
  if (!card) return;
  const controls = controlsForCard(card);
  if (input.checked) {
    const single = card.dataset.selectionMode === 'single';
    const exclusive = input.dataset.exclusive === 'true';
    if (single || exclusive) {
      controls.forEach(other => { if (other !== input) other.checked = false; });
    } else {
      controls.forEach(other => {
        if (other !== input && other.dataset.exclusive === 'true') other.checked = false;
      });
    }
  }
  syncDecision(card);
  applyFilters();
}

document.querySelectorAll('.action-input').forEach(input => {
  input.addEventListener('change', () => handleActionChange(input));
});

document.querySelectorAll('textarea[data-note-target]').forEach(textarea => {
  textarea.addEventListener('input', () => {
    const card = cardForControl(textarea);
    if (card) syncDecision(card);
  });
});

document.querySelectorAll('textarea[data-document-note]').forEach(textarea => {
  textarea.addEventListener('input', () => {
    const block = textarea.closest('.document-block');
    if (block) syncDocumentAnnotation(block);
  });
});

document.querySelectorAll('.annotation-toggle').forEach(button => {
  button.addEventListener('click', () => {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    if (!panel) return;
    const opening = panel.hidden;
    panel.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    if (opening) panel.querySelector('textarea')?.focus();
  });
});

function actionNote(entry, actionId) {
  return entry.notes?.actions?.[actionId] || entry.notes?.item || '';
}

function reviewSummary() {
  const entries = Object.values(decisions);
  const decided = entries.filter(entry => selectedIds(entry).length > 0).length;
  const undecided = Math.max(0, totalCards - decided);
  const byAction = {};
  let highRisk = 0;
  let irreversible = 0;
  let missingRequiredNotes = 0;
  let conflicts = 0;
  let annotationCount = 0;

  entries.forEach(entry => {
    if (hasNotes(entry.notes || normalizeNotes(entry))) annotationCount += 1;
    if (conflictPairs(entry).length) conflicts += 1;
    for (const action of entry.actions || []) {
      const spec = actionSpec(entry.queue, action.id);
      const label = action.label || spec.label || action.id;
      byAction[label] = (byAction[label] || 0) + 1;
      if (RISK_ORDER[spec.risk || 'none'] >= RISK_ORDER.high) highRisk += 1;
      if (spec.reversible === false) irreversible += 1;
      if ((spec.requires_note || spec.reversible === false)
          && !String(actionNote(entry, action.id)).trim()) {
        missingRequiredNotes += 1;
      }
    }
  });

  const incomplete = undecided > 0;
  const warnings = [];
  if (incomplete) warnings.push(`${undecided} item(s) still unresolved`);
  if (highRisk) warnings.push(`${highRisk} high-risk action(s)`);
  if (missingRequiredNotes) {
    warnings.push(`${missingRequiredNotes} required rationale note(s) missing`);
  }
  if (conflicts) warnings.push(`${conflicts} item(s) contain conflicting actions`);
  return {
    decided,
    undecided,
    total: totalCards,
    incomplete,
    byAction: Object.entries(byAction).sort((a, b) => b[1] - a[1]),
    highRisk,
    irreversible,
    missingRequiredNotes,
    conflicts,
    annotationCount,
    warnings,
  };
}

function updateProgress() {
  const summary = reviewSummary();
  document.getElementById('progressLabel').innerHTML =
    `<strong>${summary.decided} of ${summary.total}</strong> items resolved`;
  document.getElementById('progressPercent').textContent = summary.total
    ? `${Math.round((summary.decided / summary.total) * 100)}%`
    : '100%';
  document.getElementById('progressFill').style.width = summary.total
    ? `${(summary.decided / summary.total) * 100}%`
    : '100%';

  document.querySelectorAll('[data-queue-progress]').forEach(el => {
    const queue = el.dataset.queueProgress;
    const cards = [...document.querySelectorAll(`.card[data-queue="${CSS.escape(queue)}"]`)];
    el.textContent = `${cards.filter(card => card.classList.contains('done')).length}/${cards.length}`;
  });

  const warning = document.getElementById('summaryWarning');
  const activeWarnings = summary.highRisk
    || summary.conflicts
    || summary.missingRequiredNotes;
  warning.hidden = !activeWarnings;
  if (activeWarnings) {
    warning.innerHTML = `<strong>Review check:</strong> ${escapeHTML(summary.warnings
      .filter(message => !message.includes('unresolved')).join('; '))}.`;
  }
}

function summaryRow(label, value, state = '') {
  return `<div class="summary-row ${state}"><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`;
}

function openSummary() {
  const summary = reviewSummary();
  const body = document.getElementById('summaryBody');
  const actionList = summary.byAction.length
    ? `<ul class="summary-list">${summary.byAction.map(([label, count]) =>
        `<li><span>${escapeHTML(label)}</span><b>${count}</b></li>`).join('')}</ul>`
    : '<p class="field-hint">No actions selected yet.</p>';
  const warning = summary.warnings.length
    ? `<div class="summary-banner"><strong>Before export:</strong> ${escapeHTML(summary.warnings.join('; '))}.</div>`
    : '<div class="empty"><strong>Review complete.</strong> The decision file is ready to export.</div>';
  body.innerHTML = `
    ${warning}
    <dl class="summary-rows">
      ${summaryRow('Resolved', `${summary.decided} of ${summary.total}`, summary.incomplete ? '' : 'good')}
      ${summaryRow('Unresolved', summary.undecided, summary.undecided ? 'warning' : 'good')}
      ${summaryRow('High-risk actions', summary.highRisk, summary.highRisk ? 'bad' : '')}
      ${summaryRow('Conflicts', summary.conflicts, summary.conflicts ? 'bad' : '')}
      ${summaryRow('Missing rationale', summary.missingRequiredNotes, summary.missingRequiredNotes ? 'bad' : '')}
      ${summaryRow('Items with notes', summary.annotationCount)}
    </dl>
    <h3>Selected actions</h3>
    ${actionList}
    <div class="summary-actions">
      <button type="button" class="button-primary" onclick="exportDecisions('download', true)">Download decision JSON</button>
      <button type="button" onclick="exportDecisions('copy', true)">Copy decision JSON</button>
      <button type="button" ${summary.incomplete ? '' : 'disabled'} onclick="jumpToUnresolved()">Go to first unresolved item</button>
    </div>`;
  const panel = document.getElementById('summaryPanel');
  panel.hidden = false;
  panel.querySelector('.summary-close').focus();
}

function closeSummary() {
  document.getElementById('summaryPanel').hidden = true;
}

function jumpToUnresolved() {
  closeSummary();
  const card = [...document.querySelectorAll('.card:not(.done)')]
    .find(candidate => !candidate.hidden && !candidate.closest('.queue').hidden);
  if (!card) {
    toast('No visible unresolved items');
    return;
  }
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  controlsForCard(card)[0]?.focus({ preventScroll: true });
}

function canonicalDecision(entry) {
  const actions = (entry.actions || []).map(action => ({
    id: action.id,
    label: action.label || action.id,
  }));
  return {
    ...entry,
    actions,
    action: actions.length === 1 ? actions[0].id : null,
    label: actions.length === 1 ? actions[0].label : null,
    note: entry.notes?.item || entry.note || '',
  };
}

function decisionPayload() {
  const summary = reviewSummary();
  const entries = Object.values(decisions).map(canonicalDecision);
  return {
    ...REVIEW_META,
    console_title: CONSOLE_TITLE,
    exported_at: new Date().toISOString(),
    complete: !summary.incomplete,
    valid: summary.conflicts === 0 && summary.missingRequiredNotes === 0,
    warnings: summary.warnings,
    decisions: entries.filter(entry => entry.actions.length > 0),
    annotations: entries
      .filter(entry => entry.actions.length === 0 && hasNotes(entry.notes))
      .map(entry => ({
        id: entry.id,
        queue: entry.queue,
        notes: entry.notes,
        item: entry.item,
        updated_at: entry.updated_at,
      })),
  };
}

function showExportPreview(text, message) {
  const box = document.getElementById('exportBox');
  box.value = text;
  box.style.display = 'block';
  box.focus();
  box.select();
  toast(message);
}

function exportDecisions(mode, fromSummary = false) {
  const summary = reviewSummary();
  const needsGate = summary.warnings.length > 0 && !fromSummary;
  if (needsGate) {
    openSummary();
    return;
  }
  const text = JSON.stringify(decisionPayload(), null, 2);
  if (mode === 'preview') {
    showExportPreview(text, 'Decision JSON opened below');
    return;
  }
  if (mode === 'copy') {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => toast('Decision JSON copied'))
        .catch(() => showExportPreview(text, 'Clipboard unavailable; copy the JSON below'));
    } else {
      showExportPreview(text, 'Clipboard unavailable; copy the JSON below');
    }
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${DOWNLOAD_NAME}${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast('Decision JSON downloaded');
}

function clearDecisions() {
  if (!confirm('Clear all decisions and notes saved in this browser?')) return;
  decisions = {};
  cardIndex.forEach(card => {
    controlsForCard(card).forEach(input => { input.checked = false; });
    textareasForCard(card).forEach(textarea => { textarea.value = ''; });
    applyDecisionState(card, null);
  });
  documentBlockIndex.forEach(block => {
    const textarea = block.querySelector('textarea[data-document-note]');
    if (textarea) textarea.value = '';
    updateDocumentAnnotationState(block, '');
  });
  persist();
  applyFilters();
  toast('Decisions and notes cleared');
}

const searchInput = document.getElementById('reviewSearch');
const queueFilter = document.getElementById('queueFilter');
const stateFilter = document.getElementById('stateFilter');

function applyFilters() {
  const query = searchInput?.value.trim().toLowerCase() || '';
  const queueId = queueFilter?.value || '';
  const state = stateFilter?.value || 'all';
  let visibleCards = 0;
  document.querySelectorAll('.queue').forEach(queue => {
    let queueVisible = 0;
    queue.querySelectorAll('.card').forEach(card => {
      const queueMatch = !queueId || card.dataset.queue === queueId;
      const decided = card.classList.contains('done');
      const stateMatch = state === 'all'
        || (state === 'decided' ? decided : !decided);
      const searchMatch = !query || (card.dataset.search || '').includes(query);
      card.hidden = !(queueMatch && stateMatch && searchMatch);
      if (!card.hidden) {
        queueVisible += 1;
        visibleCards += 1;
      }
    });
    const hasCards = queue.querySelectorAll('.card').length > 0;
    queue.hidden = (queueId && queue.id !== queueId) || (hasCards && queueVisible === 0);
  });
  const filterStatus = document.getElementById('filterStatus');
  if (filterStatus) filterStatus.textContent = `${visibleCards} item(s) shown`;
  scheduleMobileCardUpdate();
}

function moveToUnresolved(direction) {
  const cards = [...document.querySelectorAll('.card:not(.done)')]
    .filter(card => !card.hidden && !card.closest('.queue').hidden);
  if (!cards.length) {
    toast('No visible unresolved items');
    return;
  }
  const focused = document.activeElement?.closest?.('.card');
  const mobileOwner = document.activeElement?.closest?.('.decision-column')?.dataset.ownerId;
  const current = focused || (mobileOwner ? cardIndex.get(mobileOwner) : activeMobileCard);
  let index = cards.indexOf(current);
  index = index < 0
    ? (direction > 0 ? 0 : cards.length - 1)
    : (index + direction + cards.length) % cards.length;
  cards[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
  setActiveMobileCard(cards[index]);
  controlsForCard(cards[index])[0]?.focus({ preventScroll: true });
}

function initializeQueueFilter() {
  if (!queueFilter) return;
  document.querySelectorAll('.queue').forEach(queue => {
    const option = document.createElement('option');
    option.value = queue.id;
    option.textContent = queue.querySelector('h2')?.textContent || queue.id;
    queueFilter.appendChild(option);
  });
}

function setTheme(value) {
  const theme = ['light', 'dark'].includes(value) ? value : 'system';
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
  document.getElementById('themeSelect').value = theme;
  if (storageAvailable) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* no-op */ }
  }
}

function initializeTheme() {
  let theme = 'system';
  try { theme = localStorage.getItem(THEME_KEY) || 'system'; } catch (_) { /* no-op */ }
  setTheme(theme);
}

function restoreMobileColumn() {
  if (!activeMobileCard) return;
  const column = decisionColumn(activeMobileCard);
  if (column && column.parentElement?.id === 'mobileTrayBody') {
    activeMobileCard.appendChild(column);
  }
}

function updateMobileTray(card) {
  if (!card || card !== activeMobileCard) return;
  const entry = decisions[card.dataset.id];
  const count = entry?.actions?.length || 0;
  document.getElementById('mobileTrayState').textContent = count
    ? `${count} selected`
    : 'Unresolved';
}

function setActiveMobileCard(card) {
  if (!window.matchMedia('(max-width: 680px)').matches || !card || card.hidden) return;
  if (activeMobileCard === card) {
    updateMobileTray(card);
    return;
  }
  restoreMobileColumn();
  activeMobileCard = card;
  const column = decisionColumn(card);
  if (column) document.getElementById('mobileTrayBody').appendChild(column);
  document.getElementById('mobileTrayItem').textContent =
    card.querySelector('.card-title')?.textContent || 'Review item';
  updateMobileTray(card);
}

function nearestVisibleCard() {
  const cards = [...document.querySelectorAll('.card')]
    .filter(card => !card.hidden && !card.closest('.queue').hidden);
  if (!cards.length) return null;
  const targetY = window.innerHeight * 0.42;
  return cards.reduce((nearest, card) => {
    const rect = card.getBoundingClientRect();
    const distance = Math.abs((rect.top + Math.min(rect.height, window.innerHeight) / 2) - targetY);
    return !nearest || distance < nearest.distance ? { card, distance } : nearest;
  }, null)?.card;
}

function scheduleMobileCardUpdate() {
  if (!window.matchMedia('(max-width: 680px)').matches) return;
  cancelAnimationFrame(mobileRaf);
  mobileRaf = requestAnimationFrame(() => setActiveMobileCard(nearestVisibleCard()));
}

function toggleMobileTray() {
  mobileTrayOpen = !mobileTrayOpen;
  document.getElementById('mobileTrayBody').hidden = !mobileTrayOpen;
  const button = document.getElementById('mobileTrayToggle');
  button.setAttribute('aria-expanded', String(mobileTrayOpen));
  button.textContent = mobileTrayOpen ? 'Close actions' : 'Actions';
}

function handleViewportChange() {
  if (!window.matchMedia('(max-width: 1120px)').matches) closeContentsDrawer();
  if (window.matchMedia('(max-width: 680px)').matches) {
    setActiveMobileCard(nearestVisibleCard());
  } else {
    restoreMobileColumn();
    activeMobileCard = null;
    mobileTrayOpen = false;
    document.getElementById('mobileTrayBody').hidden = true;
    document.getElementById('mobileTrayToggle').setAttribute('aria-expanded', 'false');
    document.getElementById('mobileTrayToggle').textContent = 'Actions';
  }
}

searchInput?.addEventListener('input', applyFilters);
queueFilter?.addEventListener('change', applyFilters);
stateFilter?.addEventListener('change', applyFilters);
document.getElementById('prevUndecided')?.addEventListener('click', () => moveToUnresolved(-1));
document.getElementById('nextUndecided')?.addEventListener('click', () => moveToUnresolved(1));
document.getElementById('mobilePrevious').addEventListener('click', () => moveToUnresolved(-1));
document.getElementById('mobileNext').addEventListener('click', () => moveToUnresolved(1));
document.getElementById('mobileTrayToggle').addEventListener('click', toggleMobileTray);
document.getElementById('themeSelect').addEventListener('change', event => setTheme(event.target.value));
const aboutReview = document.getElementById('aboutReview');
const aboutTrigger = document.getElementById('aboutTrigger');
const tocLauncher = document.getElementById('tocLauncher');
const tocDrawer = document.getElementById('tocDrawer');
const tocDrawerClose = document.getElementById('tocDrawerClose');
aboutTrigger.addEventListener('click', event => {
  event.stopPropagation();
  const pinned = aboutReview.classList.toggle('pinned');
  aboutTrigger.setAttribute('aria-expanded', String(pinned));
});
document.addEventListener('click', event => {
  if (!aboutReview.contains(event.target)) {
    aboutReview.classList.remove('pinned');
    aboutTrigger.setAttribute('aria-expanded', 'false');
  }
  if (tocDrawer && !tocDrawer.hidden
    && !tocDrawer.contains(event.target)
    && !tocLauncher?.contains(event.target)) {
    closeContentsDrawer();
  }
});
const tocLinks = [...document.querySelectorAll('.toc-link')];
const tocTargets = [...new Set(tocLinks.map(link => link.dataset.tocTarget))]
  .map(id => document.getElementById(id))
  .filter(Boolean);
let tocRaf = 0;

function openContentsDrawer() {
  if (!tocDrawer || !tocLauncher) return;
  tocDrawer.hidden = false;
  tocLauncher.setAttribute('aria-expanded', 'true');
  tocDrawerClose?.focus();
}

function closeContentsDrawer(returnFocus = false) {
  if (!tocDrawer || !tocLauncher) return;
  tocDrawer.hidden = true;
  tocLauncher.setAttribute('aria-expanded', 'false');
  if (returnFocus) tocLauncher.focus();
}

function toggleContentsDrawer() {
  if (tocDrawer?.hidden) openContentsDrawer();
  else closeContentsDrawer();
}

tocLauncher?.addEventListener('click', toggleContentsDrawer);
tocDrawerClose?.addEventListener('click', () => closeContentsDrawer(true));

function updateDocumentToc() {
  if (!tocTargets.length) return;
  const headerOffset = (document.querySelector('.app-header')?.getBoundingClientRect().height || 0) + 28;
  let active = tocTargets[0];
  tocTargets.forEach(target => {
    if (target.getBoundingClientRect().top <= headerOffset) active = target;
  });
  tocLinks.forEach(link => {
    if (link.dataset.tocTarget === active.id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

function scheduleDocumentTocUpdate() {
  cancelAnimationFrame(tocRaf);
  tocRaf = requestAnimationFrame(updateDocumentToc);
}

tocLinks.forEach(link => {
  link.addEventListener('click', () => {
    if (tocDrawer?.contains(link)) closeContentsDrawer();
    const target = document.getElementById(link.dataset.tocTarget);
    setTimeout(() => target?.focus({ preventScroll: true }), 0);
  });
});

window.addEventListener('scroll', () => {
  scheduleMobileCardUpdate();
  scheduleDocumentTocUpdate();
}, { passive: true });
window.addEventListener('resize', () => {
  handleViewportChange();
  scheduleDocumentTocUpdate();
});

document.addEventListener('keydown', event => {
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (event.key === 'Escape' && !document.getElementById('summaryPanel').hidden) {
    closeSummary();
  }
  if (event.key === 'Escape' && aboutReview.classList.contains('pinned')) {
    aboutReview.classList.remove('pinned');
    aboutTrigger.setAttribute('aria-expanded', 'false');
    aboutTrigger.focus();
  }
  if (event.key === 'Escape' && tocDrawer && !tocDrawer.hidden) {
    closeContentsDrawer(true);
  }
  if (event.key === '/' && !editing && searchInput) {
    event.preventDefault();
    searchInput.focus();
  }
  if (!editing && event.key.toLowerCase() === 'j') {
    event.preventDefault();
    moveToUnresolved(1);
  }
  if (!editing && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    moveToUnresolved(-1);
  }
});

initializeQueueFilter();
initializeTheme();
applyExisting();
applyExistingDocumentAnnotations();
updateStorageStatus();
updateProgress();
applyFilters();
handleViewportChange();
updateDocumentToc();
"""


def default_spec() -> dict[str, Any]:
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


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "review"


def script_json(value: Any) -> str:
    """Encode JSON for a raw-text script block without closing the block."""
    return json.dumps(value, ensure_ascii=False).replace("</", "<\\/")


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
            item_id = f"{queue_id}:{index}"
            if isinstance(item, dict):
                for key in ("path", "id", "title", "name", "content"):
                    if item.get(key):
                        item_id = f"{queue_id}:{item[key]}"
                        break
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


def render_html(data: dict[str, Any], spec: dict[str, Any]) -> str:
    generated_at = dt.datetime.now().isoformat(timespec="seconds")
    queue_links: list[str] = []
    total_cards = 0
    storage_key = spec.get("storage_key") or (
        "reviewConsole:" + slugify(spec.get("title", "review")) + ":v1"
    )
    download_prefix = spec.get("download_prefix") or (
        slugify(spec.get("title", "review")) + "-decisions"
    )
    payload_meta = spec.get("payload_meta") or {}
    action_meta_keys = (
        "id",
        "label",
        "description",
        "risk",
        "reversible",
        "requires_note",
        "exclusive",
        "conflicts_with",
    )
    item_queues = spec.get("queues", []) or []
    action_specs: dict[str, dict[str, Any]] = {}
    for queue in item_queues:
        for action in queue.get("actions", []):
            action_specs[f"{queue['id']}.{action['id']}"] = {
                key: action.get(key) for key in action_meta_keys
            }
    document_id = str(spec.get("document_id", "document-review"))
    document_blocks = [
        materialize_block(data, block)
        for block in (spec.get("blocks", []) or [])
        if isinstance(block, dict)
    ]
    document_decisions = [block for block in document_blocks if block.get("type") == "decision"]
    for block in document_decisions:
        for action in block.get("actions", []):
            action_specs[f"{document_id}.{action['id']}"] = {
                key: action.get(key) for key in action_meta_keys
            }
    for action in spec.get("global_actions", []):
        metadata = {key: action.get(key) for key in action_meta_keys}
        if metadata.get("exclusive") is None:
            metadata["exclusive"] = True
        action_specs[f"_global.{action['id']}"] = metadata

    help_sentence = spec.get("agent_help") or (
        "Review the evidence, select every compatible action, add notes where context matters, "
        "then download the decision JSON and send it back to the agent."
    )
    represented_counts: dict[str, int] = {}
    if document_blocks:
        document_count = len(document_decisions)
        total_cards += document_count
        queue_links.append(
            f"<a href='#{html.escape(document_id)}'><span>"
            f"{html.escape(str(spec.get('document_title', 'Planning document')))}</span>"
            f"<b class='queue-count' data-queue-progress='{html.escape(document_id)}'>0/{document_count}</b></a>"
        )
    for queue in item_queues:
        queue_id = str(queue["id"])
        source = str(queue.get("source", queue_id))
        count = len(data.get(source, []) or [])
        represented_counts[source] = count
        total_cards += count
        queue_links.append(
            f"<a href='#{html.escape(queue_id)}'><span>{html.escape(str(queue.get('title', queue_id)))}</span>"
            f"<b class='queue-count' data-queue-progress='{html.escape(queue_id)}'>0/{count}</b></a>"
        )

    count_rows = "".join(
        f"<div><dt>{html.escape(str(key).replace('_', ' '))}</dt><dd>{html.escape(str(value))}</dd></div>"
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
    tools_section = ""
    if item_queues:
        tools_section = """
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
    rail_class = "review-rail document-only" if document_only else "review-rail"
    js = (
        REVIEW_JS.replace("__STORAGE_KEY__", script_json(storage_key))
        .replace("__DOWNLOAD_NAME__", script_json(download_prefix + "-"))
        .replace("__CONSOLE_TITLE__", script_json(spec.get("title", "Offgrid Review")))
        .replace("__REVIEW_META__", script_json(payload_meta))
        .replace("__ACTION_SPECS__", script_json(action_specs))
    )
    language = html.escape(str(spec.get("language", "en")))
    title = html.escape(str(spec.get("title", "Offgrid Review")))
    subtitle = html.escape(str(spec.get("subtitle", "About this review and what the exported decisions mean.")))
    return f"""<!doctype html>
<html lang="{language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>{title}</title>
<style>{REVIEW_CSS}</style>
</head>
<body>
<!--
THESIS: Review is one continuous workbench, not a dashboard of decorative cards. Evidence, decisions, and annotations remain visibly related.
OWN-WORLD: Neutral work surfaces, blush selection fields, deep berry controls, fine rules, compact native form controls, and equal light and dark themes.
STORY: The reviewer sees what needs judgment, inspects the evidence, selects every compatible action, adds targeted context, checks the review, and exports JSON.
FIRST VIEWPORT: A queue rail anchors the left, the active evidence fills the center, and its decision inspector holds the right. Export stays in the top work bar.
FORM: User-pinned Review Workbench from the seventh grounded position; seed key shape-pinned-review-workbench-v1.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->
<header class="app-header">
  <div class="header-inner">
    <div class="title-block">
      <div class="title-row"><h1>{title}</h1></div>
      <div class="title-meta"><span class="review-status">Review only</span><span class="title-meta-separator" aria-hidden="true">·</span>
        <div class="about-review" id="aboutReview">
          <button type="button" class="about-trigger" id="aboutTrigger" aria-label="About this review" aria-expanded="false" aria-describedby="aboutTooltip"><svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><circle cx="9" cy="9" r="7.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6.8 6.7a2.3 2.3 0 0 1 4.5.7c0 1.8-2.3 2-2.3 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="9" cy="13.1" r=".8" fill="currentColor"/></svg></button>
          <div class="about-tooltip" id="aboutTooltip" role="tooltip"><p>{subtitle}</p><p>This file records review decisions and notes. It does not apply changes.</p></div>
        </div>
      </div>
    </div>
    <div class="progress-block" aria-label="Review progress">
      <div class="progress-line"><span id="progressLabel"><strong>0 of {total_cards}</strong> items resolved</span><span id="progressPercent">0%</span></div>
      <div class="progress-track" aria-hidden="true"><div class="progress-fill" id="progressFill"></div></div>
    </div>
    <div class="header-actions">
      <button type="button" class="header-link" onclick="openSummary()">Review summary</button>
      <button type="button" class="button-primary" onclick="exportDecisions('download')">Download JSON</button>
    </div>
  </div>
</header>
<div class="workspace">
  <aside class="{rail_class}" aria-label="Review navigation">
    {queue_section}
    {toc_section}
    {tools_section}
    <details class="rail-section rail-meta">
      <summary>Review file details</summary>
      <dl class="meta-list">
        <div><dt>Generated</dt><dd>{html.escape(generated_at)}</dd></div>
        <div><dt>Decision storage</dt><dd id="storageStatus">Checking storage</dd></div>
        {count_rows}
      </dl>
      <label class="theme-label" for="themeSelect">Theme
        <select id="themeSelect" aria-label="Theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>
      </label>
      <div class="review-nav-buttons" style="margin-top:12px"><button type="button" onclick="exportDecisions('copy')">Copy JSON</button><button type="button" onclick="exportDecisions('preview')">Preview JSON</button></div>
      <button type="button" class="button" style="width:100%;margin-top:8px;color:var(--danger)" onclick="clearDecisions()">Reset review</button>
    </details>
  </aside>
  <main class="review-main">
    <div class="agent-note"><strong>How this works:</strong> {html.escape(str(help_sentence))}</div>
    <div id="summaryWarning" class="summary-banner" hidden></div>
    {cards}
  </main>
</div>
<textarea id="exportBox" readonly aria-label="Decision JSON preview"></textarea>
<aside class="summary-panel" id="summaryPanel" aria-labelledby="summaryTitle" hidden>
  <div class="summary-head"><h2 id="summaryTitle">Review summary</h2><button type="button" class="summary-close" onclick="closeSummary()">Close</button></div>
  <div id="summaryBody"></div>
</aside>
<div class="mobile-tray" id="mobileTray">
  <div class="mobile-tray-bar">
    <button type="button" id="mobilePrevious" aria-label="Previous unresolved item">Prev</button>
    <div class="mobile-tray-title"><strong id="mobileTrayItem">Review item</strong><span id="mobileTrayState">Unresolved</span></div>
    <button type="button" id="mobileNext" aria-label="Next unresolved item">Next</button>
    <button type="button" id="mobileTrayToggle" aria-expanded="false" aria-controls="mobileTrayBody">Actions</button>
  </div>
  <div class="mobile-tray-body" id="mobileTrayBody" hidden></div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>{js}</script>
</body>
</html>
"""
