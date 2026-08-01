#!/usr/bin/env python3
"""Generate a portable, static HTML "AI Review Console" from deterministic data.

This is the generalized, domain-agnostic version of the original
Project/Todoist review console. It is NOT tied to Obsidian, Todoist, or any
specific system. It takes two inputs and produces one static HTML file:

  deterministic data (JSON)  +  agent-authored spec (JSON)  ->  console HTML

The console is intentionally read-only: it lets a human move through review
cards, pick a decision per card, optionally add a note, and export/download
decision JSON. It never mutates any underlying system. A separate, verified
"apply pass" (done by an agent or script, with the exported JSON as an
approval artifact) is what actually makes changes.

Agent flexibility comes from the JSON spec file. An agent writes/rewrites the
spec for each review to frame *what should be asked this time*; the generator
turns spec + data into the card UI.

Usage:
  review_console.py --data review-data.json --spec review-spec.json \
                    --out Review.html
  review_console.py --write-default-spec   # write a generic example spec
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_SPEC = SCRIPT_DIR / "review-spec.json"
DEFAULT_DATA = Path("review-data.json")
DEFAULT_OUT = Path("review-console.html")


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_default_spec(path: Path) -> None:
    if path.exists():
        return
    path.write_text(json.dumps(default_spec(), indent=2), encoding="utf-8")


def default_spec() -> dict[str, Any]:
    return {
        "title": "AI Review Console",
        "subtitle": "Static decision console. Review cards, choose an action per card, export decision JSON. Nothing is changed from this page.",
        "agent_note": "Agents may rewrite this spec before generating the console. Keep actions concrete and review-safe.",
        "global_actions": [
            {"id": "defer", "label": "Defer / ask later"},
            {"id": "needs_human", "label": "Needs human decision"},
            {"id": "ignore", "label": "Ignore"},
        ],
        "queues": [
            {
                "id": "example_queue",
                "title": "Example queue",
                "description": "Describe what is being decided here and why it matters.",
                "source": "example_items",
                "empty": "Nothing to review in this queue.",
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
                    {"id": "approve", "label": "Approve"},
                    {"id": "needs_fix", "label": "Needs changes"},
                ],
            }
        ],
    }


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "review"


def item_title(item: Any, detail_keys: list[str]) -> str:
    """Pick a human title from an arbitrary review item."""
    if isinstance(item, dict):
        for key in ("title", "name", "content", "path", "id", "label"):
            if item.get(key):
                return str(item[key])
    if isinstance(item, list) and len(item) >= 2 and all(isinstance(x, dict) for x in item):
        left = item[0].get("title") or item[0].get("content") or item[0].get("name") or item[0].get("id") or "?"
        right = item[1].get("title") or item[1].get("content") or item[1].get("name") or item[1].get("id") or "?"
        return f"{left} \u2194 {right}"
    return "Review item"


def item_details(
    item: Any,
    detail_keys: list[str],
    side_labels: list[str] | None = None,
) -> list[tuple[str, str]]:
    """Return labeled detail rows for an arbitrary review item.

    ``side_labels`` optionally prefixes the detail label for each side of a
    two-dict list item (e.g. ``["Todoist", "Obsidian"]`` for a task-block
    compared against a source-block), so the human can tell which side a
    property came from.
    """
    details: list[tuple[str, str]] = []
    if isinstance(item, dict):
        for key in detail_keys:
            val = item.get(key)
            if val in (None, "", []):
                continue
            if isinstance(val, (list, dict)):
                val = json.dumps(val, ensure_ascii=False)
            details.append((key.replace("_", " "), str(val)))
        return details
    if isinstance(item, list) and all(isinstance(x, dict) for x in item):
        for side_i, side in enumerate(item):
            prefix = ""
            if side_labels and side_i < len(side_labels):
                prefix = f"{side_labels[side_i]} "
            for key in detail_keys:
                if key in ("title", "content", "name"):
                    continue
                val = side.get(key)
                if val in (None, "", []):
                    continue
                if isinstance(val, (list, dict)):
                    val = json.dumps(val, ensure_ascii=False)
                details.append((f"{prefix}{key.replace('_', ' ')}", str(val)))
        return details
    return [("raw", json.dumps(item, ensure_ascii=False))]


def render_cards(data: dict[str, Any], spec: dict[str, Any]) -> str:
    global_actions = spec.get("global_actions", [])
    note_label = spec.get("note_label", "Note / rationale")
    chunks: list[str] = []
    for queue in spec.get("queues", []):
        qid = queue["id"]
        items = data.get(queue.get("source", qid), []) or []
        detail_keys = queue.get("detail_keys", ["status", "priority", "due", "path", "description"])
        primary_keys = set(queue.get("primary_keys", ["status", "priority", "due"]))
        side_labels = queue.get("side_labels")
        chunks.append(f"<section class='queue' id='{html.escape(qid)}' data-count='{len(items)}'>")
        chunks.append(
            f"<div class='queue-head'><div><div class='eyebrow'>Review queue</div>"
            f"<h2>{html.escape(queue.get('title', qid))}</h2>"
            f"<p>{html.escape(queue.get('description', ''))}</p></div>"
            f"<span class='count'>{len(items)}</span></div>"
        )
        if not items:
            chunks.append(f"<div class='empty'>{html.escape(queue.get('empty', 'Nothing to review.'))}</div>")
        for idx, item in enumerate(items):
            iid = f"{qid}:{idx}"
            if isinstance(item, dict):
                for key in ("path", "id", "title", "name", "content"):
                    if item.get(key):
                        iid = f"{qid}:{item[key]}"
                        break
            title = item_title(item, detail_keys)
            details = item_details(item, detail_keys, side_labels)
            # Script raw-text content (application/json) does not decode HTML
            # entities; keep it literal JSON and only neutralize a closing
            # script sequence so JSON.parse() always succeeds.
            raw = json.dumps(item, ensure_ascii=False).replace("</", "<\\/")
            chunks.append(
                f"<article class='card' data-id='{html.escape(iid)}' data-queue='{html.escape(qid)}'>"
            )
            chunks.append("<div class='card-top'>")
            chunks.append(
                f"<div><div class='card-kicker'>Item {idx + 1} of {len(items)}</div>"
                f"<div class='card-title'>{html.escape(title)}</div></div>"
            )
            chunks.append("<span class='decision-state'>Awaiting decision</span></div>")
            chunks.append("<div class='property-strip'>")
            for k, v in details:
                if len(v) > 500:
                    v = v[:500] + "\u2026"
                key_class = " property-primary" if any(k.endswith(pk) for pk in primary_keys) else ""
                chunks.append(
                    f"<div class='property{key_class}'><span>{html.escape(k)}</span>"
                    f"<strong>{html.escape(v)}</strong></div>"
                )
            chunks.append("</div>")
            queue_actions = queue.get("actions", [])
            chunks.append(
                "<fieldset class='decision-panel'><legend>Choose one action</legend>"
                "<div class='actions primary-actions'>"
            )
            for action in queue_actions:
                chunks.append(
                    f"<button type='button' data-action='{html.escape(action['id'])}'>"
                    f"<span class='choice-dot'></span><span>{html.escape(action['label'])}</span></button>"
                )
            chunks.append("</div>")
            if global_actions:
                chunks.append(
                    "<div class='fallback-label'>Or classify this another way</div>"
                    "<div class='actions fallback-actions'>"
                )
                for action in global_actions:
                    chunks.append(
                        f"<button type='button' data-action='{html.escape(action['id'])}'>"
                        f"<span class='choice-dot'></span><span>{html.escape(action['label'])}</span></button>"
                    )
                chunks.append("</div>")
            chunks.append("</fieldset>")
            chunks.append(
                f"<label class='note-label'>{html.escape(note_label)}<textarea placeholder='Optional note for the apply pass'></textarea></label>"
            )
            chunks.append(f"<script type='application/json' class='raw-item'>{raw}</script>")
            chunks.append("</article>")
        chunks.append("</section>")
    return "\n".join(chunks)


def render_html(data: dict[str, Any], spec: dict[str, Any]) -> str:
    now = dt.datetime.now().isoformat(timespec="seconds")
    counts_html = "".join(
        f"<span><b>{html.escape(str(k).replace('_', ' '))}</b>: {html.escape(str(v))}</span>"
        for k, v in (data.get("counts", {}) or {}).items()
    )
    queue_links: list[str] = []
    total_cards = 0
    storage_key = spec.get("storage_key") or ("reviewConsole:" + slugify(spec.get("title", "review")) + ":v1")
    download_prefix = spec.get("download_prefix") or (slugify(spec.get("title", "review")) + "-decisions")
    download_name = download_prefix + "-"
    payload_meta = spec.get("payload_meta") or {}
    help_sentence = spec.get("agent_help") or (
        "choose one action per card, add a note only when context is needed, "
        "then download the decision JSON and send it back to the agent."
    )
    for queue in spec.get("queues", []):
        qid = queue["id"]
        item_count = len(data.get(queue.get("source", qid), []) or [])
        total_cards += item_count
        queue_links.append(
            f"<a href='#{html.escape(qid)}'>{html.escape(queue.get('title', qid))}<b>{item_count}</b></a>"
        )
    queue_nav = "".join(queue_links)
    payload = html.escape(
        json.dumps(
            {"generated_at": now, "review_date": data.get("date"), "spec_title": spec.get("title")},
            ensure_ascii=False,
        )
    )
    cards = render_cards(data, spec)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(spec.get('title', 'AI Review Console'))}</title>
<style>
:root {{ --bg:#0b0e14; --panel:#141923; --panel2:#1b2230; --text:#f4f7fb; --muted:#98a4b6; --accent:#77d0ff; --accent2:#a78bfa; --good:#76d985; --warn:#f7c65d; --bad:#ff7474; --line:#293345; --shadow:0 18px 60px rgba(0,0,0,.28); }}
* {{ box-sizing: border-box; }}
html {{ scroll-behavior:smooth; }}
body {{ margin:0; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:radial-gradient(circle at 85% 0%,rgba(119,208,255,.08),transparent 28rem),var(--bg); color:var(--text); }}
header {{ position:sticky; top:0; z-index:20; padding:16px clamp(16px,4vw,48px); background:rgba(11,14,20,.92); border-bottom:1px solid var(--line); backdrop-filter:blur(18px); }}
.header-row {{ display:flex; justify-content:space-between; align-items:flex-start; gap:24px; }}
.eyebrow,.card-kicker {{ color:var(--accent); font-size:11px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }}
h1 {{ margin:3px 0 5px; font-size:clamp(24px,3.2vw,38px); letter-spacing:-.035em; }}
.subtitle {{ color:var(--muted); margin:0; max-width:760px; font-size:14px; }}
.progress-wrap {{ min-width:220px; text-align:right; }}
.progress-label {{ color:var(--muted); font-size:12px; margin-bottom:7px; }}
.progress-track {{ height:8px; border-radius:999px; background:var(--panel2); overflow:hidden; border:1px solid var(--line); }}
.progress-fill {{ height:100%; width:0; background:linear-gradient(90deg,var(--accent),var(--accent2)); transition:width .25s ease; }}
.meta,.toolbar,.queue-nav {{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; }}
.meta {{ margin-top:12px; }}
.meta span {{ background:var(--panel2); color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:5px 9px; font-size:12px; }}
.meta span.storage-warning {{ color:#1b1200; background:var(--warn); border-color:var(--warn); font-weight:850; }}
.toolbar {{ margin-top:10px; }}
button {{ font:inherit; }}
.toolbar button {{ background:var(--accent); color:#071018; border:0; border-radius:9px; padding:8px 11px; font-weight:800; cursor:pointer; }}
.toolbar button.secondary {{ background:var(--panel2); color:var(--text); border:1px solid var(--line); }}
.toolbar button.danger {{ color:#ffb1b1; }}
.queue-nav {{ position:sticky; top:145px; z-index:15; padding:10px clamp(16px,4vw,48px); background:rgba(11,14,20,.9); border-bottom:1px solid var(--line); backdrop-filter:blur(14px); }}
.queue-nav a {{ color:var(--muted); text-decoration:none; background:var(--panel); border:1px solid var(--line); border-radius:999px; padding:7px 10px; font-size:12px; }}
.queue-nav a:hover {{ color:var(--text); border-color:var(--accent); }}
.queue-nav b {{ color:var(--accent); margin-left:4px; }}
.filter-toggle {{ margin-left:auto; color:var(--muted); font-size:12px; display:flex; gap:7px; align-items:center; }}
main {{ max-width:1180px; margin:0 auto; padding:26px clamp(16px,4vw,42px) 100px; }}
.agent-note {{ color:var(--muted); background:linear-gradient(135deg,rgba(119,208,255,.07),rgba(167,139,250,.05)); border:1px solid var(--line); padding:12px 14px; border-radius:14px; margin-bottom:28px; font-size:13px; }}
.agent-note code {{ display:none; }}
.queue {{ margin:0 0 42px; scroll-margin-top:210px; }}
.queue-head {{ display:flex; justify-content:space-between; align-items:end; gap:16px; margin-bottom:14px; }}
h2 {{ margin:3px 0 0; font-size:clamp(20px,2.2vw,27px); letter-spacing:-.02em; }}
.queue p {{ margin:5px 0 0; color:var(--muted); max-width:780px; }}
.count {{ background:var(--panel2); color:var(--accent); border:1px solid var(--line); border-radius:999px; padding:6px 10px; font-weight:800; }}
.empty {{ color:var(--good); background:rgba(118,217,133,.07); border:1px solid rgba(118,217,133,.25); padding:13px 15px; border-radius:14px; }}
.card {{ background:linear-gradient(145deg,rgba(24,30,42,.98),rgba(18,23,33,.98)); border:1px solid var(--line); border-radius:18px; padding:18px; margin:12px 0; box-shadow:var(--shadow); transition:opacity .2s,border-color .2s,transform .2s; }}
.card:hover {{ border-color:#3b4a62; transform:translateY(-1px); }}
.card.done {{ border-color:rgba(118,217,133,.55); }}
.hide-decided .card.done {{ display:none; }}
.card-top {{ display:flex; justify-content:space-between; align-items:flex-start; gap:18px; margin-bottom:12px; }}
.card-title {{ font-weight:850; font-size:18px; margin-top:3px; line-height:1.3; }}
.decision-state {{ flex:none; color:var(--muted); background:var(--panel2); border:1px solid var(--line); border-radius:999px; padding:5px 8px; font-size:11px; font-weight:750; }}
.card.done .decision-state {{ color:#071108; background:var(--good); border-color:var(--good); }}
.property-strip {{ display:flex; flex-wrap:wrap; gap:8px; margin:0 0 17px; padding:12px; background:rgba(7,10,15,.38); border:1px solid rgba(255,255,255,.04); border-radius:12px; }}
.property {{ min-width:145px; flex:1 1 210px; padding:8px 10px; background:rgba(255,255,255,.025); border-radius:9px; overflow:hidden; }}
.property span {{ display:block; color:var(--muted); font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; margin-bottom:3px; }}
.property strong {{ display:block; font-size:13px; font-weight:650; white-space:pre-wrap; overflow-wrap:anywhere; }}
.property-primary {{ flex:0 1 auto; min-width:105px; border:1px solid rgba(119,208,255,.18); background:rgba(119,208,255,.07); }}
.property-primary strong {{ color:var(--accent); font-weight:850; }}
.decision-panel {{ margin:16px 0 14px; padding:14px; border:2px solid rgba(119,208,255,.55); border-radius:14px; background:linear-gradient(135deg,rgba(119,208,255,.10),rgba(167,139,250,.06)); }}
.decision-panel legend {{ padding:0 8px; color:#dff5ff; font-size:13px; font-weight:900; letter-spacing:.03em; text-transform:uppercase; }}
.actions {{ display:flex; flex-wrap:wrap; gap:9px; margin:3px 0; }}
.actions button {{ display:flex; align-items:center; gap:8px; flex:1 1 190px; max-width:360px; min-height:44px; background:#243148; color:var(--text); border:2px solid #41516c; border-radius:11px; padding:9px 12px; cursor:pointer; font-size:13px; font-weight:760; text-align:left; box-shadow:0 3px 10px rgba(0,0,0,.18); }}
.actions button:hover {{ border-color:var(--accent); background:#2b3a55; transform:translateY(-1px); }}
.choice-dot {{ flex:none; width:15px; height:15px; border:2px solid #8290a7; border-radius:50%; background:#111722; box-shadow:inset 0 0 0 3px #111722; }}
.actions button.selected {{ background:var(--good); color:#071108; border-color:#b2f2ba; font-weight:900; box-shadow:0 0 0 3px rgba(118,217,133,.18); }}
.actions button.selected .choice-dot {{ border-color:#071108; background:#071108; box-shadow:inset 0 0 0 3px var(--good); }}
.fallback-label {{ color:var(--muted); font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; margin:14px 0 7px; padding-top:11px; border-top:1px solid rgba(119,208,255,.2); }}
.fallback-actions button {{ min-height:38px; flex:0 1 auto; background:rgba(11,15,22,.55); border-width:1px; color:var(--muted); font-weight:650; box-shadow:none; }}
.fallback-actions .choice-dot {{ width:13px; height:13px; }}
.note-label {{ color:var(--muted); font-size:12px; display:block; }}
textarea {{ width:100%; min-height:50px; margin-top:5px; border-radius:11px; border:1px solid var(--line); background:#090d13; color:var(--text); padding:9px; resize:vertical; }}
#exportBox {{ min-height:180px; margin-top:12px; display:none; }}
.toast {{ position:fixed; right:18px; bottom:18px; z-index:40; color:#071108; background:var(--good); padding:10px 14px; border-radius:10px; font-weight:800; box-shadow:var(--shadow); opacity:0; transform:translateY(12px); pointer-events:none; transition:.2s; }}
.toast.show {{ opacity:1; transform:none; }}
@media (max-width:760px) {{ header {{ position:relative; }} .header-row {{ display:block; }} .progress-wrap {{ margin-top:14px; text-align:left; }} .queue-nav {{ top:0; overflow-x:auto; flex-wrap:nowrap; }} .queue-nav a {{ flex:none; }} .filter-toggle {{ flex:none; }} .property {{ flex-basis:100%; min-width:0; }} .property-primary {{ flex:1 1 95px; }} .card-top {{ display:block; }} .decision-state {{ display:inline-block; margin-top:8px; }} .actions button {{ flex:1 1 100%; max-width:none; }} .fallback-actions button {{ flex:1 1 calc(50% - 9px); }} .toolbar button {{ flex:1 1 145px; }} }}</style>
</head>
<body>
<header>
  <div class="header-row">
    <div><div class="eyebrow">Decision workspace · read-only</div><h1>{html.escape(spec.get('title', 'AI Review Console'))}</h1><p class="subtitle">{html.escape(spec.get('subtitle', ''))}</p></div>
    <div class="progress-wrap"><div class="progress-label" id="progressLabel">0 of {total_cards} decisions captured</div><div class="progress-track"><div class="progress-fill" id="progressFill"></div></div></div>
  </div>
  <div class="meta"><span>Generated {html.escape(now)}</span><span id="storageStatus">Checking decision storage…</span>{counts_html}</div>
  <div class="toolbar">
    <button onclick="downloadDecisions()">Download JSON</button>
    <button class="secondary" onclick="copyDecisions()">Copy JSON</button>
    <button class="secondary" onclick="exportDecisions()">Preview JSON</button>
    <button class="secondary danger" onclick="clearDecisions()">Reset decisions</button>
  </div>
  <textarea id="exportBox" readonly></textarea>
</header>
<nav class="queue-nav" aria-label="Review queues">{queue_nav}<label class="filter-toggle"><input id="hideDecided" type="checkbox"> Hide decided</label></nav>
<main>
  <div class="agent-note"><b>How this works:</b> {html.escape(help_sentence)} <code>{payload}</code></div>
  {cards}
</main>
<div class="toast" id="toast" role="status"></div>
<script>
const STORAGE_KEY = '{storage_key}';
const DOWNLOAD_NAME = '{download_name}';
const REVIEW_META = {json.dumps(payload_meta, ensure_ascii=False)};
let storageAvailable = false;
function loadDecisions() {{
  try {{
    const probe = '__review_console_storage_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    storageAvailable = true;
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{{}}');
  }} catch (_) {{
    storageAvailable = false;
    return {{}};
  }}
}}
let decisions = loadDecisions();
const totalCards = document.querySelectorAll('.card').length;
function updateStorageStatus() {{
  const el = document.getElementById('storageStatus');
  el.textContent = storageAvailable ? 'Decisions saved in this browser' : 'Session-only decisions — download JSON before closing';
  el.classList.toggle('storage-warning', !storageAvailable);
}}
function persist() {{
  if (storageAvailable) {{
    try {{ localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions)); }}
    catch (_) {{ storageAvailable = false; updateStorageStatus(); }}
  }}
  updateProgress();
}}
function toast(message) {{ const el=document.getElementById('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>el.classList.remove('show'),1800); }}
function updateProgress() {{
  const decided = document.querySelectorAll('.card.done').length;
  document.getElementById('progressLabel').textContent = `${{decided}} of ${{totalCards}} decisions captured`;
  document.getElementById('progressFill').style.width = `${{totalCards ? (decided/totalCards)*100 : 100}}%`;
}}
function cardRaw(card) {{
  const el = card.querySelector('.raw-item');
  return el ? JSON.parse(el.textContent) : null;
}}
function applyExisting() {{
  document.querySelectorAll('.card').forEach(card => {{
    const id = card.dataset.id;
    const d = decisions[id];
    if (!d) return;
    card.classList.add('done');
    card.querySelector('.decision-state').textContent = d.label || 'Decided';
    card.querySelectorAll('button').forEach(b => b.classList.toggle('selected', b.dataset.action === d.action));
    const ta = card.querySelector('textarea');
    if (ta) ta.value = d.note || '';
  }});
}}
document.querySelectorAll('.card button').forEach(btn => {{
  btn.addEventListener('click', () => {{
    const card = btn.closest('.card');
    const id = card.dataset.id;
    const note = card.querySelector('textarea')?.value || '';
    decisions[id] = {{ id, queue: card.dataset.queue, action: btn.dataset.action, label: btn.textContent, note, item: cardRaw(card), decided_at: new Date().toISOString() }};
    card.classList.add('done');
    card.querySelector('.decision-state').textContent = btn.textContent;
    card.querySelectorAll('button').forEach(b => b.classList.toggle('selected', b === btn));
    persist();
  }});
}});
document.querySelectorAll('.card textarea').forEach(ta => {{
  ta.addEventListener('input', () => {{
    const card = ta.closest('.card');
    const d = decisions[card.dataset.id];
    if (d) {{ d.note = ta.value; d.updated_at = new Date().toISOString(); persist(); }}
  }});
}});
function decisionPayload() {{
  return {{ ...REVIEW_META, console_title: {json.dumps(spec.get('title', 'AI Review Console'))}, exported_at: new Date().toISOString(), decisions: Object.values(decisions) }};
}}
function exportDecisions() {{
  const box = document.getElementById('exportBox');
  box.value = JSON.stringify(decisionPayload(), null, 2);
  box.style.display = 'block';
  box.focus(); box.select();
}}
async function copyDecisions() {{
  const text = JSON.stringify(decisionPayload(), null, 2);
  try {{ await navigator.clipboard.writeText(text); toast('Decision JSON copied'); }}
  catch (_) {{ exportDecisions(); toast('Clipboard unavailable — JSON opened below'); }}
}}
function downloadDecisions() {{
  const text = JSON.stringify(decisionPayload(), null, 2);
  const date = new Date().toISOString().slice(0,10);
  const blob = new Blob([text], {{ type: 'application/json' }});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = DOWNLOAD_NAME + date + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Decision JSON downloaded');
}}
function clearDecisions() {{
  if (!confirm('Clear decisions stored in this browser?')) return;
  decisions = {{}};
  document.querySelectorAll('.card').forEach(card => {{ card.classList.remove('done'); card.querySelector('.decision-state').textContent='Awaiting decision'; card.querySelectorAll('button').forEach(b => b.classList.remove('selected')); card.querySelector('textarea').value=''; }});
  persist();
  toast('Local decisions cleared');
}}
document.getElementById('hideDecided').addEventListener('change', e => document.body.classList.toggle('hide-decided', e.target.checked));
applyExisting();
updateStorageStatus();
updateProgress();
</script>
</body>
</html>
"""


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate a static AI Review Console from data + spec.")
    ap.add_argument("--data", type=Path, default=DEFAULT_DATA, help="Path to deterministic data JSON.")
    ap.add_argument("--spec", type=Path, default=DEFAULT_SPEC, help="Path to agent-authored review spec JSON.")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output HTML path.")
    ap.add_argument("--write-default-spec", action="store_true", help="Write the generic example spec and exit.")
    args = ap.parse_args()

    if args.write_default_spec:
        args.spec.write_text(json.dumps(default_spec(), indent=2), encoding="utf-8")
        print(args.spec)
        return 0

    save_default_spec(args.spec)
    data = load_json(args.data)
    spec = load_json(args.spec)
    html_text = render_html(data, spec)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(html_text, encoding="utf-8")
    print(args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
