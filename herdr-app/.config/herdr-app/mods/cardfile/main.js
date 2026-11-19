// Card file: spaces stacked over agent cards in the sidebar, plugin cards (todo,
// Jira, ...) in a side panel next to Files and Changes, and a board of agents by lane.
// One mod in several roles, chosen by props: { column: "spaces" | "agents" | "todo" |
// "panel-tabs" | "tab-button" | "board" }, and { view: card } for the dialog that opens a
// card's file.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, TextView, TextareaState, Textarea, InputState, Input } from "gpui-base";
import { agents, terminals, spaces, focused, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, exec, readTextFile, appHome, home, checking, layout } from "herdr";

// ── Card sources: programs that print cards as JSON (README.md has the contract) ──

const expand = (p) => (typeof p === "string" && (p === "~" || p.startsWith("~/")) ? home() + p.slice(1) : p);

async function readJson(name) {
  try {
    const text = await readTextFile(`${appHome()}/${name}`);
    return text ? JSON.parse(text) : {};
  } catch (e) {
    return { error: `${name}: ${e?.message ?? e}` };
  }
}

// cardfile.json is shared (stowed); cardfile.local.json is this machine's. A local source
// with the same id changes that source's fields, and `"enabled": false` turns it off.
function mergeById(base, local) {
  const byId = new Map();
  for (const s of [...(Array.isArray(base) ? base : []), ...(Array.isArray(local) ? local : [])]) {
    if (s && typeof s.id === "string") byId.set(s.id, { ...(byId.get(s.id) ?? {}), ...s });
  }
  return [...byId.values()].filter((s) => s.enabled !== false && Array.isArray(s.run) && s.run.length > 0);
}

async function loadConfig() {
  const base = await readJson("cardfile.json");
  const local = await readJson("cardfile.local.json");
  return {
    agent: local.agent ?? base.agent ?? ["claude"],
    sources: mergeById(base.sources, local.sources),
    boards: mergeById(base.boards, local.boards).filter((b) => b.id !== "agents"),
    lanes: cleanLanes(local.board) ?? cleanLanes(base.board) ?? DEFAULT_LANES,
    errors: [base.error, local.error].filter(Boolean),
  };
}

const TONES = new Set(["blocked", "working", "done", "idle", "accent", "muted"]);

// ── Board lanes ─────────────────────────────────────────────────────────────
// A lane can fill itself from Herdr's statuses (`auto`): "working", "blocked", "new" (idle,
// never given a turn) and "finished" (idle or done, with no lane of its own). Otherwise an
// agent is in a lane because its terminal has the label cardfile.lane=<id>. The label
// cardfile.turn=<n> records the agent's turn when it was moved: once the agent starts
// another turn the move is out of date, unless the lane is `sticky`. Live "working" and
// "blocked" always win.

const LANE_LABEL = "cardfile.lane";
const TURN_LABEL = "cardfile.turn";
const AUTO = new Set(["working", "blocked", "new", "finished"]);
const DEFAULT_LANES = [
  { id: "in-progress", label: "In Progress", auto: ["working"], tone: "working" },
  { id: "blocked", label: "Blocked", auto: ["blocked"], tone: "blocked" },
  { id: "review", label: "Review", auto: ["finished"], tone: "accent" },
  { id: "done", label: "Done", tone: "done" },
].map((l) => ({ sticky: false, ...l }));

function cleanLanes(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const lanes = [];
  for (const l of list) {
    if (!l || typeof l.id !== "string" || !l.id.trim() || seen.has(l.id)) continue;
    seen.add(l.id);
    lanes.push({
      id: l.id,
      label: typeof l.label === "string" && l.label.trim() ? l.label.trim() : l.id,
      auto: (Array.isArray(l.auto) ? l.auto : l.auto ? [l.auto] : []).filter((a) => AUTO.has(a)),
      sticky: l.sticky === true,
      tone: TONES.has(l.tone) ? l.tone : null,
    });
  }
  return lanes.length ? lanes : null;
}

// The lane an agent is in. `moved` is a move not yet visible in the labels: { lane, turn }.
function laneOf(a, term, lanes, moved) {
  const auto = (k) => lanes.find((l) => l.auto.includes(k));
  if (a.status === "working" || a.status === "blocked") {
    const live = auto(a.status);
    if (live) return live;
  }
  const turn = Number(term?.turn) || 0;
  const labels = term?.labels ?? {};
  const id = moved ? moved.lane : labels[LANE_LABEL];
  const at = moved ? moved.turn : Number(labels[TURN_LABEL] ?? NaN); // no turn: holds until changed
  const lane = id ? lanes.find((l) => l.id === id) : null;
  if (lane && (lane.sticky || !Number.isFinite(at) || turn <= at)) return lane;
  return auto(turn ? "finished" : "new") ?? auto("finished") ?? lanes[0];
}

// Herdr sets labels through herdr-core's `hc`, which a GUI app may not find on PATH.
async function hc(args) {
  const r = await exec("hc", args).catch(() => null);
  if (r && r.code === 0) return r;
  return exec(`${home()}/.local/bin/hc`, args);
}

function cleanCard(c, i) {
  if (!c || typeof c.title !== "string" || !c.title.trim()) return null;
  const progress = Array.isArray(c.progress) && c.progress.length === 2 && c.progress.every(Number.isFinite) && c.progress[1] > 0
    ? [Math.max(0, Math.min(c.progress[0], c.progress[1])), c.progress[1]]
    : null;
  return {
    id: str(c.id) ?? String(i),
    title: c.title.trim(),
    lines: (Array.isArray(c.lines) ? c.lines : []).filter((l) => typeof l === "string" && l.trim()).slice(0, 3),
    tag: str(c.tag),
    tone: TONES.has(c.tone) ? c.tone : null,
    progress,
    url: str(c.url),
    file: str(c.file),
    task: str(c.task),
  };
}

// Runs a source's program in `ctx.folder` with `extra` arguments and environment, and
// returns what it printed as JSON. Throws with a one-line reason when it fails.
async function runProgram(src, ctx, extra = [], env = []) {
  const [cmd, ...args] = src.run.map(expand);
  const vars = [`CARDFILE_SOURCE=${src.id}`, `CARDFILE_SPACE=${ctx.space ?? ""}`, `CARDFILE_FOLDER=${ctx.folder ?? ""}`, ...env];
  const r = await exec("env", [...vars, cmd, ...args, ...extra], {
    cwd: ctx.folder || home(),
    timeout: Math.min(Math.max(src.timeout ?? 20, 1), 120) * 1000,
  });
  if (r.code !== 0) {
    const why = (r.stderr || r.stdout || "").trim().split("\n").at(-1);
    throw new Error(why ? `exit ${r.code}: ${why}` : `exit ${r.code}`);
  }
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error("printed something other than JSON");
  }
}

// Runs one source and returns { title?, empty?, cards }.
async function runSource(src, ctx) {
  const out = await runProgram(src, ctx);
  if (!out || !Array.isArray(out.cards)) throw new Error('JSON has no "cards" list');
  return {
    title: typeof out.title === "string" ? out.title : null,
    empty: typeof out.empty === "string" ? out.empty : null,
    cards: out.cards.map(cleanCard).filter(Boolean).slice(0, Math.max(1, src.max ?? 50)),
  };
}

// ── Board sources: programs that print lanes and cards, and move cards ──────────
// `run` printing { title?, empty?, lanes, views?, view?, cards }, `run moves <card>` printing
// { lanes: [ids] }, and `run move <card> <lane>`. CARDFILE_VIEW carries the chosen view.

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function runBoard(src, ctx, view) {
  const out = await runProgram(src, ctx, [], [`CARDFILE_VIEW=${view ?? ""}`]);
  if (!out || !Array.isArray(out.lanes) || !Array.isArray(out.cards)) throw new Error('JSON needs "lanes" and "cards" lists');
  const lanes = [];
  for (const l of out.lanes) {
    if (!l || !str(l.id) || lanes.some((x) => x.id === l.id)) continue;
    lanes.push({ id: l.id, label: str(l.label) ?? l.id, tone: TONES.has(l.tone) ? l.tone : null, note: str(l.note) });
  }
  if (!lanes.length) throw new Error("no lanes");
  const views = (Array.isArray(out.views) ? out.views : []).filter((v) => v && str(v.id)).map((v) => ({ id: v.id, label: str(v.label) ?? v.id }));
  const cards = out.cards.slice(0, Math.max(1, src.max ?? 500)).map((c, i) => {
    const card = cleanCard(c, i);
    if (!card) return null;
    card.lane = lanes.some((l) => l.id === c.lane) ? c.lane : lanes[0].id;
    card.meta = str(c.meta);
    return card;
  }).filter(Boolean);
  return { title: str(out.title), empty: str(out.empty), lanes, views, view: str(out.view), show: out.show === true, cards };
}

// ── The mod ───────────────────────────────────────────────────────────────────

const ICONS = "mods/workspace-chrome";
// Adds alpha to a #rrggbb color; a color that already has alpha stays as it is.
const fade = (c, a) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c + a : c);
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const SCOPE_KEY = "cardfile.scope";
const BOARD_KEY = "cardfile.board-opened"; // when the board was last opened
const SOURCE_KEY = "cardfile.board-source"; // "agents" or a board source's id
const viewKey = (id) => `cardfile.board-view.${id}`;
const DETAIL_KEY = "cardfile.board-detail"; // { src, id }: the card open in the board's drawer
const PANELS = [
  { id: "files", label: "Files" },
  { id: "changes", label: "Changes" },
  { id: "todo", label: "Todo" }, // optional, so last: Files and Changes are on every space
];

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The side panel's open child, or null when it's hidden.
function openPanel() {
  const root = layout();
  const panel = find(root, "panel");
  return panel && !panel.hidden ? find(root, "panel-body")?.active ?? null : null;
}

function showPanel(id) {
  if (openPanel() === id) return run("layout.hide", { id: "panel" });
  run("layout.select", { stack: "panel-body", child: id });
  run("layout.show", { id: "panel" });
}

// The middle of the window is a stack: the terminals ("main") or the board.
const boardShown = () => find(layout(), "center")?.active === "board";
const showBoard = (on) => run("layout.select", { stack: "center", child: on ? "board" : "main" });

// Drops a status glyph or spinner an agent puts before its title ("✦  Working").
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").trim();
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function statusMark(t, status) {
  if (status === "working") return svg(`${ICONS}/spinner.svg`).size(12).flex_none().text_color(t.working).spin(900);
  if (status === "blocked") {
    return div().flex_none().px(6).h(18).rounded(5).bg(fade(t.blocked, "26")).text_size(10.5).font_semibold()
      .text_color(t.blocked).flex().items_center().child("Needs you");
  }
  if (status === "idle") return div().size(7).mx(2).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
  if (status === "done") return div().size(7).mx(2).flex_none().rounded(4).bg(t.done);
  return null;
}

export default class CardFile extends View {
  init(_p, cx) {
    const p = props() ?? {};
    this.role = p.view ? "view" : p.ticket ? "ticket" : ["spaces", "todo", "panel-tabs", "tab-button", "board"].includes(p.column) ? p.column : "agents";
    this.width = 300;
    this.folded = new Set();
    if (this.role === "view") return this.initView(p.view, cx);
    if (this.role === "agents") {
      this.changed = {}; // agent address -> { s, at }: when its status last changed
      cx.timer.every(30000, (cx) => cx.notify()); // keeps the "4m" durations honest
      return;
    }
    if (this.role === "board") return this.initBoard(cx);
    if (this.role === "ticket") return this.initTicket(p.ticket, cx);
    if (this.role !== "todo") return;
    // Keep "todo" out of the tab bar's panel list: other layouts' tab bars would try to
    // reopen a Todo panel they don't have. (An earlier version added it.)
    const enabled = shared("workspace.panels");
    if (Array.isArray(enabled) && enabled.includes("todo")) setShared("workspace.panels", enabled.filter((x) => x !== "todo"));
    this.results = new Map(); // key -> { at, data?, error? }
    this.running = new Set();
    this.config = { agent: ["claude"], sources: [], errors: [] };
    this.configAt = 0;
    if (checking()) return;
    cx.spawn(async (cx) => {
      await this.reloadConfig();
      this.tick(cx);
      cx.notify();
    });
    cx.timer.every(5000, (cx) => this.tick(cx));
  }

  // ── Sources ────────────────────────────────────────────────────────────────

  async reloadConfig() {
    this.config = await loadConfig();
    this.configAt = Date.now();
  }

  context() {
    const space = spaces().find((s) => s.active);
    const f = focused();
    const folder = (f?.space === space?.id && f?.cwd) || space?.folder || "";
    return { space: space?.name ?? "", spaceId: space?.id ?? "", folder };
  }

  keyFor(src, ctx) {
    return src.where === "home" ? `${src.id}|~` : `${src.id}|${ctx.folder}`;
  }

  tick(cx) {
    if (Date.now() - this.configAt > 30000) cx.spawn(async (cx) => { await this.reloadConfig(); cx.notify(); });
    const ctx = this.context();
    for (const src of this.config.sources) {
      const key = this.keyFor(src, ctx);
      const last = this.results.get(key);
      const every = Math.max(src.every ?? 120, 15) * 1000;
      if (this.running.has(key) || (last && Date.now() - last.at < every)) continue;
      this.running.add(key);
      cx.spawn(async (cx) => {
        try {
          const data = await runSource(src, src.where === "home" ? { ...ctx, folder: "" } : ctx);
          this.results.set(key, { at: Date.now(), data });
        } catch (e) {
          this.results.set(key, { at: Date.now(), error: e?.message ?? String(e), data: last?.data });
        }
        this.running.delete(key);
        cx.notify();
      });
    }
  }

  refresh(src, cx) {
    this.results.delete(this.keyFor(src, this.context()));
    this.tick(cx);
    cx.notify();
  }

  // ── Card actions ───────────────────────────────────────────────────────────

  openCard(card) {
    if (card.file) {
      openOverlay({ mod: "cardfile", kind: "dialog", width: 680, height: 600, props: { view: { title: card.title, file: card.file, url: card.url } } });
    } else if (card.url) {
      exec("open", [card.url]);
    }
  }

  startAgent(card) {
    const ctx = this.context();
    run("tab.new", { name: clip(card.title, 32), argv: this.config.agent, task: card.task, folder: ctx.folder || undefined });
  }

  // ── The card ───────────────────────────────────────────────────────────────

  // An index card: a title line, a ruled line under it in the card's color, a few
  // lines of text, and a small footer. `rule` is a theme color. `top` aligns the
  // title line's items to the top, for a title that wraps.
  card(t, { id, rule, head, top, lines, foot, selected, onClick, after }) {
    const chars = Math.max(40, Math.floor(((this.width - 40) / 6.4) * 2));
    return v_flex()
      .id(id)
      .flex_none()
      .w_full()
      .rounded(6)
      .bg(this.role === "todo" ? t.surface : t.background)
      .border(1)
      .border_color(selected ? t.accent : t.border)
      .shadow_sm()
      .when(Boolean(onClick), (el) => el.cursor_pointer().hover((s) => s.border_color(selected ? t.accent : t.input)).on_click(onClick))
      .child(h_flex().px(10).pt(8).pb(6).gap(7).min_w(0).when(Boolean(top), (el) => el.items_start()).when(!top, (el) => el.items_center()).children(head))
      .child(div().mx(10).h(1).bg(fade(rule, "aa")))
      .when(lines.length > 0, (el) => el.child(v_flex().px(10).pt(6).gap(2).text_size(12).text_color(t.muted)
        .children(lines.map((l, i) => div().max_h(i === 0 ? 38 : 19).overflow_hidden().child(clip(l, i === 0 ? chars : chars / 2))))))
      .child(h_flex().px(10).pt(6).pb(7).gap(6).items_center().text_size(11).text_color(t.dim).children(foot))
      .when(Boolean(after), (el) => el.child(after));
  }

  // `opts` (the board): { onClick, foot: extra footer items, after: an element under the footer }.
  agentCard(t, a, byAddress, kids, now, opts = {}) {
    const term = byAddress.get(a.address);
    const report = term?.report;
    const msg = typeof report === "object" ? report?.msg : null;
    const name = clean(a.title) || (/^\d+$/.test(a.tab_name) ? a.program?.name : a.tab_name) || a.address;
    const since = this.changed[a.address]?.at;
    const helpers = kids.get(a.address) ?? 0;
    const where = [a.space_name, /^\d+$/.test(a.tab_name) ? `tab ${a.tab_name}` : a.tab_name].filter(Boolean).join(" · ");
    const pic = icon(a.program, 13, t.muted);
    const mark = statusMark(t, a.status);
    // The title is the agent's summary of its task, so it wraps to three lines.
    const chars = Math.max(40, Math.floor((this.width - 60) / 7) * 3);
    return this.card(t, {
      id: `ag-${a.address}`,
      rule: t[a.status] ?? t.border,
      selected: a.focused,
      onClick: opts.onClick ?? (() => run("pane.focus", { pane: a.pane })),
      after: opts.after,
      top: true,
      head: [
        div().flex_1().min_w(0).max_h(63).overflow_hidden().text_size(13).font_medium()
          .text_color(a.status === "idle" && !a.focused ? t.muted : t.foreground).child(clip(name, chars)),
        mark ? h_flex().flex_none().h(21).items_center().child(mark) : null,
      ].filter(Boolean),
      lines: msg && msg !== name ? [msg] : [],
      foot: [
        pic,
        div().flex_1().min_w(0).truncate().child(where),
        helpers ? div().flex_none().child(`${helpers} helper${helpers > 1 ? "s" : ""}`) : null,
        term?.turn ? div().flex_none().child(`turn ${term.turn}`) : null,
        since ? div().flex_none().child(duration(now - since)) : null,
        ...(opts.foot ?? []),
      ].filter(Boolean),
    });
  }

  pluginCard(t, src, c) {
    const tone = c.tone ? t[c.tone] ?? t.accent : t.border;
    const button = (id, label, onClick) => div()
      .id(id).flex_none().px(6).h(18).rounded(4).flex().items_center()
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(); })
      .child(label);
    const bar = c.progress
      ? h_flex().w(48).h(4).flex_none().rounded(2).bg(t.border).overflow_hidden()
        .child(div().h_full().w(Math.round((48 * c.progress[0]) / c.progress[1])).bg(tone === t.border ? t.accent : tone))
      : null;
    return this.card(t, {
      id: `pc-${src.id}-${c.id}`,
      rule: tone,
      onClick: c.file || c.url ? () => this.openCard(c) : null,
      head: [
        c.tag ? div().flex_none().px(5).h(16).rounded(4).border(1).border_color(tone).text_size(10).font_semibold()
          .text_color(tone === t.border ? t.muted : tone).flex().items_center().child(c.tag) : null,
        div().flex_1().min_w(0).truncate().text_size(13).font_medium().text_color(t.foreground).child(c.title),
      ].filter(Boolean),
      lines: c.lines,
      foot: [
        bar,
        c.progress ? div().flex_none().child(`${c.progress[0]}/${c.progress[1]}`) : null,
        div().flex_1(),
        c.task ? button(`run-${src.id}-${c.id}`, "Start agent", () => this.startAgent(c)) : null,
        c.url && c.file ? button(`url-${src.id}-${c.id}`, "Link", () => exec("open", [c.url])) : null,
      ].filter(Boolean),
    });
  }

  // ── Sections ───────────────────────────────────────────────────────────────

  section(t, id, label, count, body, extra = null) {
    const open = !this.folded.has(id);
    return [
      h_flex().id(`sec-${id}`).flex_none().px(4).pt(12).pb(6).gap(6).items_center()
        .text_size(11).font_medium().text_color(t.dim).cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { open ? this.folded.add(id) : this.folded.delete(id); cx.notify(); })
        .child(svg(`${ICONS}/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .child(div().truncate().child(label))
        .child(div().child(count == null ? "" : String(count)))
        .child(div().flex_1())
        .when(Boolean(extra), (el) => el.child(extra)),
      ...(open ? body : []),
    ];
  }

  note(t, text, color) {
    return div().px(4).py(2).text_size(11.5).text_color(color ?? t.dim).child(text);
  }

  // A row of options, one of them on: [{ id, label }].
  toggle(t, prefix, options, on, onPick) {
    const opt = ({ id, label }) => div()
      .id(`${prefix}-${id}`).px(7).h(20).rounded(5).flex().items_center().flex_none()
      .text_color(on === id ? t.foreground : t.dim)
      .when(on === id, (el) => el.bg(t.selected))
      .hover((s) => s.text_color(t.foreground))
      .on_click(() => onPick(id))
      .child(label);
    return h_flex().flex_none().gap(2).text_size(11).children(options.map(opt));
  }

  scopeToggle(t, scope) {
    return this.toggle(t, "scope", [{ id: "space", label: "This space" }, { id: "all", label: "All" }], scope, (id) => setShared(SCOPE_KEY, id));
  }

  track(list, now) {
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s !== s) this.changed[a.address] = { s, at: now };
    }
  }

  renderAgents(t) {
    const now = Date.now();
    const scope = shared(SCOPE_KEY) === "all" ? "all" : "space";
    const active = spaces().find((s) => s.active);
    const all = terminals();
    const byAddress = new Map(all.map((k) => [k.address, k]));
    const kids = new Map();
    for (const k of all) if (k.parent && k.state === "live") kids.set(k.parent, (kids.get(k.parent) ?? 0) + 1);

    const list = agents();
    this.track(list, now);
    const urgent = (x, y) => (RANK[y.status] ?? 0) - (RANK[x.status] ?? 0) || y.seq - x.seq;
    const here = list.filter((a) => scope === "all" || a.space === active?.id).sort((x, y) => (y.pinned - x.pinned) || urgent(x, y));
    // In "This space", agents elsewhere that need you still get a line at the top.
    const elsewhere = scope === "space" ? list.filter((a) => a.space !== active?.id && (a.status === "blocked" || a.status === "done")).sort(urgent) : [];
    setAgentOrder([...elsewhere, ...here].map((a) => a.address));

    const rows = [];
    if (elsewhere.length) {
      rows.push(...this.section(t, "elsewhere", "Other spaces", elsewhere.length, elsewhere.map((a) => h_flex()
        .id(`el-${a.address}`).flex_none().px(8).h(26).gap(7).rounded(6).items_center().cursor_pointer()
        .hover((s) => s.bg(t.hover)).on_click(() => run("pane.focus", { pane: a.pane }))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground).child(`${a.space_name} · ${clean(a.title) || a.tab_name}`))
        .child(statusMark(t, a.status) ?? div()))));
    }
    const agentBody = here.length
      ? here.map((a) => this.agentCard(t, a, byAddress, kids, now))
      : [this.note(t, scope === "space" ? "No agents in this space." : "No agents report a status yet.")];
    rows.push(...this.section(t, "agents", "Agents", here.length, agentBody));

    return v_flex()
      .id("root")
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 8) { this.width = size.width; cx.notify(); } })
      .child(h_flex().pl(16).pr(10).h(40).pt(10).flex_none().gap(8).items_center()
        .child(div().flex_1().truncate().text_size(11.5).font_medium().text_color(t.dim).child("Agents"))
        .child(this.scopeToggle(t, scope)))
      .child(v_flex().id("cf-cards").flex_1().min_h(0).px(10).pb(10).gap(8).overflow_y_scrollbar().children(rows));
  }

  renderTodo(t) {
    const rows = [];
    const ctx = this.context();
    for (const src of this.config.sources) {
      const r = this.results.get(this.keyFor(src, ctx));
      const cards = r?.data?.cards ?? [];
      const body = [];
      if (r?.error) body.push(this.note(t, `Couldn't refresh: ${r.error}`, t.blocked));
      if (!r) body.push(this.note(t, "Loading…"));
      else if (!cards.length && !r.error) body.push(this.note(t, r.data?.empty ?? "Nothing here."));
      body.push(...cards.map((c) => this.pluginCard(t, src, c)));
      const reload = div().id(`reload-${src.id}`).text_color(t.dim).hover((s) => s.text_color(t.foreground))
        .tooltip("Refresh").on_click((_e, cx) => { cx.stop_propagation(); this.refresh(src, cx); }).child("↻");
      rows.push(...this.section(t, `src-${src.id}`, r?.data?.title ?? src.label ?? src.id, r ? cards.length : null, body, reload));
    }
    for (const e of this.config.errors) rows.push(this.note(t, e, t.blocked));
    if (!this.configAt) rows.push(this.note(t, "Loading…"));
    else if (!this.config.sources.length && !this.config.errors.length) rows.push(this.note(t, "No card sources. List them in cardfile.json."));

    return v_flex()
      .id("root")
      .size_full()
      .min_h(0)
      .rounded(10)
      .overflow_hidden()
      .bg(t.background)
      .border_1()
      .border_color(t.border)
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 8) { this.width = size.width; cx.notify(); } })
      .child(v_flex().id("cf-todo").flex_1().min_h(0).px(10).pb(10).gap(8).overflow_y_scrollbar().children(rows));
  }

  // ── Tab bar button: sits after the tab bar's Files and Changes, in their style ──

  renderTabButton(t) {
    const button = (id, on, icon, label, onClick) => h_flex().id(id).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
      .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover))
      // The block drags the window; a press on the button shouldn't.
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(onClick)
      .child(svg(icon).size(14))
      .child(label);
    const board = boardShown();
    return h_flex().size_full().pr(10).gap(4).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(button("tab-todo", openPanel() === "todo", `${ICONS}/circle-check.svg`, "Todo", () => showPanel("todo")))
      .child(button("tab-board", board, "mods/cardfile/kanban.svg", "Board", () => {
        if (!board) setShared(BOARD_KEY, Date.now());
        showBoard(!board);
      }));
  }

  // ── Panel tabs: Files, Changes, Todo ─────────────────────────────────────

  // The drawer's header, in the terminal pane header's style: 30px, 12px text, a line under it.
  renderPanelTabs(t) {
    const on = openPanel();
    const ctx = this.context();
    const h = home();
    const folder = ctx.folder === h ? "~" : ctx.folder.startsWith(h + "/") ? "~" + ctx.folder.slice(h.length) : ctx.folder;
    const tab = (p) => div()
      .id(`pt-${p.id}`).h_full().px(3).flex().items_center().flex_none()
      .border_b(2).border_color(on === p.id ? t.accent : "#00000000")
      .text_color(on === p.id ? t.foreground : t.dim)
      .when(on === p.id, (el) => el.font_medium())
      .when(on !== p.id, (el) => el.cursor_pointer().hover((s) => s.text_color(t.foreground)))
      .on_click(() => run("layout.select", { stack: "panel-body", child: p.id }))
      .child(p.label);
    return h_flex().size_full().pl(10).pr(6).gap(12).items_center().text_size(12)
      .bg(t.background).rounded_tl(9).rounded_tr(9).border_b(1).border_color(t.border)
      .children(PANELS.map(tab))
      .child(div().flex_1().min_w(0).truncate().text_right().text_color(t.dim).child(folder))
      .child(div().id("pt-close").flex_none().px(5).h(20).rounded(5).flex().items_center().text_size(13).text_color(t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Close panel")
        .on_click(() => run("layout.hide", { id: "panel" })).child("×"));
  }


  // ── Board: agents in lanes, in the middle of the window ──────────────────────

  initBoard(cx) {
    this.changed = {};
    this.width = 248; // a lane's width; card() sizes its text from it
    this.moved = new Map(); // address -> { lane, turn, at }: moves the labels don't show yet
    this.picking = null; // the card whose lane menu is open
    this.error = null;
    this.config = { agent: ["claude"], sources: [], boards: [], lanes: DEFAULT_LANES, errors: [] };
    this.boards = new Map(); // `${source}|${view}` -> { at, data?, error? }
    this.fetching = new Set();
    this.moves = new Map(); // `${source}|${card}` -> { at, lanes?, error? }: where a card can go now
    this.placed = new Map(); // `${source}|${card}` -> { lane, at }: moves the source doesn't show yet
    this.details = new Map(); // `${source}|${card}` -> { at, data?, error?, loading? }: what `show` printed
    this.composers = new Map(); // `${source}|${card}` -> { box, posting, error, typing }: comment drafts
    if (checking()) return;
    const load = (cx) => cx.spawn(async (cx) => { this.config = await loadConfig(); this.tickBoard(cx); cx.notify(); });
    load(cx);
    cx.timer.every(30000, (cx) => { load(cx); cx.notify(); });
    cx.timer.every(1000, (cx) => this.tickBoard(cx));
  }

  // ── Which board: the agents, or a board source ─────────────────────────────

  // The card open in the board's drawer: { src, id }, or null.
  get detail() {
    const d = shared(DETAIL_KEY);
    return d && typeof d.src === "string" && typeof d.id === "string" ? d : null;
  }

  boardSource() {
    const id = shared(SOURCE_KEY);
    return this.config.boards.find((b) => b.id === id) ?? null;
  }

  boardView(src) {
    const v = shared(viewKey(src.id));
    return typeof v === "string" ? v : "";
  }

  boardKey(src) {
    return `${src.id}|${this.boardView(src)}`;
  }

  // Board sources run in your home folder unless they ask for the shown space's.
  sourceContext(src) {
    const ctx = this.context();
    return src.where === "space" ? ctx : { ...ctx, folder: "" };
  }

  // Fetches the shown board source when it's older than `every` seconds (default 120), or now.
  tickBoard(cx, now = false) {
    const src = this.boardSource();
    if (!src || !boardShown()) return;
    // A drawer left open (or reopened after a reload) loads its card, and retries a failed load.
    const shown = this.detail?.src === src.id ? this.details.get(`${src.id}|${this.detail.id}`) : null;
    if (this.detail?.src === src.id && (!shown || (shown.error && !shown.loading && Date.now() - shown.at > 30000))) {
      this.composer(`${src.id}|${this.detail.id}`);
      this.fetchDetail(src, this.detail.id, cx);
      this.loadMoves(src, this.detail.id, cx);
    }
    const key = this.boardKey(src);
    const last = this.boards.get(key);
    const every = Math.max(src.every ?? 120, 30) * 1000;
    if (this.fetching.has(key) || (!now && last && Date.now() - last.at < every)) return;
    this.fetching.add(key);
    const started = Date.now();
    const view = this.boardView(src);
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const data = await runBoard(src, this.sourceContext(src), view);
        this.boards.set(key, { at: Date.now(), data });
        for (const [k, p] of this.placed) if (k.startsWith(`${src.id}|`) && p.at < started) this.placed.delete(k);
      } catch (e) {
        this.boards.set(key, { at: Date.now(), error: e?.message ?? String(e), data: last?.data });
      }
      this.fetching.delete(key);
      cx.notify();
    });
  }

  // Asks the source where a card can go from here, unless it was asked lately.
  loadMoves(src, id, cx) {
    const key = `${src.id}|${id}`;
    const last = this.moves.get(key);
    if (last && (last.lanes || last.loading) && Date.now() - last.at < 30000) return;
    this.moves.set(key, { at: Date.now(), loading: true });
    cx.spawn(async (cx) => {
      try {
        const out = await runProgram(src, this.sourceContext(src), ["moves", id]);
        this.moves.set(key, { at: Date.now(), lanes: (Array.isArray(out?.lanes) ? out.lanes : []).filter((x) => typeof x === "string") });
      } catch (e) {
        this.moves.set(key, { at: Date.now(), error: e?.message ?? String(e) });
      }
      cx.notify();
    });
  }

  // Opens or closes a card's lane menu.
  openMoves(src, c, cx) {
    const key = `${src.id}|${c.id}`;
    this.picking = this.picking === key ? null : key;
    if (this.picking) this.loadMoves(src, c.id, cx);
    cx.notify();
  }

  placeCard(src, c, lane, cx) {
    const key = `${src.id}|${c.id}`;
    this.placed.set(key, { lane: lane.id, at: Date.now() });
    this.picking = null;
    this.error = null;
    this.moves.delete(key);
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await runProgram(src, this.sourceContext(src), ["move", c.id, lane.id]);
        if (this.role === "board") this.tickBoard(cx, true);
        if (this.details.has(key)) {
          this.fetchDetail(src, c.id, cx, true);
          this.loadMoves(src, c.id, cx);
        }
      } catch (e) {
        this.placed.delete(key);
        this.error = `Couldn't move ${c.tag ?? c.title}: ${e?.message ?? e}`;
      }
      cx.notify();
    });
  }

  // ── One card in full: the board's drawer, or a tab of its own ───────────────

  fetchDetail(src, id, cx, now = false) {
    const key = `${src.id}|${id}`;
    const last = this.details.get(key);
    if (last?.loading || (!now && last?.data && Date.now() - last.at < 60000)) return;
    this.details.set(key, { ...last, at: last?.at ?? 0, loading: true });
    cx.spawn(async (cx) => {
      try {
        const out = await runProgram(src, this.sourceContext(src), ["show", id]);
        const card = cleanCard(out, 0);
        if (!card) throw new Error("printed no card");
        card.id = id;
        card.lane = str(out.lane);
        card.markdown = typeof out.markdown === "string" ? out.markdown : "";
        card.comment = out.comment === true;
        card.edit = out.edit === true;
        card.description = typeof out.description === "string" ? out.description : null;
        card.descriptionNote = str(out.descriptionNote);
        card.lanes = (Array.isArray(out.lanes) ? out.lanes : []).filter((l) => l && str(l.id)).map((l) => ({ id: l.id, label: str(l.label) ?? l.id }));
        card.fields = (Array.isArray(out.fields) ? out.fields : []).filter((f) => f && str(f.label) && str(f.value)).map((f) => ({ label: f.label.trim(), value: f.value.trim() }));
        this.details.set(key, { at: Date.now(), data: card });
      } catch (e) {
        this.details.set(key, { at: Date.now(), error: e?.message ?? String(e), data: last?.data });
      }
      cx.notify();
    });
  }

  // A card's comment box, made on first use. Text boxes need a live host call, so this runs
  // from init, clicks and timers, never from render.
  composer(key) {
    let c = this.composers.get(key);
    if (c || checking()) return c ?? null;
    const box = TextareaState.new({ placeholder: "Add a comment…" });
    box.set_auto_grow(3, 12);
    c = { box, posting: false, error: null, typing: false };
    box.on("focus", (_e, cx) => { c.typing = true; cx.notify(); });
    box.on("blur", (_e, cx) => { c.typing = false; cx.notify(); });
    // Enter is a new line; Cmd+Enter posts.
    box.on("submit", (e, cx) => { if (e.secondary) this.postComment(key, cx); });
    this.composers.set(key, c);
    return c;
  }

  postComment(key, cx) {
    const c = this.composers.get(key);
    const [srcId, ...rest] = key.split("|");
    const id = rest.join("|");
    const src = this.config.boards.find((b) => b.id === srcId);
    const text = c?.box.value().trim();
    if (!c || !src || !text || c.posting) return;
    c.posting = true;
    c.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await runProgram(src, this.sourceContext(src), ["comment", id, text]);
        if (c.box.value().trim() === text) c.box.set_value("");
        this.fetchDetail(src, id, cx, true);
      } catch (e) {
        c.error = `Couldn't post: ${e?.message ?? e}`;
      }
      c.posting = false;
      cx.notify();
    });
  }

  commentBox(t, key, id) {
    const c = this.composers.get(key);
    if (!c) return null;
    return v_flex().gap(6)
      .child(div().w_full().px(10).py(6).rounded(7).border_1().border_color(c.typing ? t.accent : t.input)
        .bg(t.background).text_size(13).text_color(t.foreground).child(Textarea.new(c.box)))
      .child(h_flex().gap(8).items_center().text_size(11.5)
        .child(div().flex_1().min_w(0).truncate().text_color(c.error ? t.blocked : t.dim)
          .child(c.error ?? "Markdown. ⌘↵ posts it as you."))
        .child(c.posting ? div().flex_none().text_color(t.dim).child("Posting…")
          : this.chip(t, `tv-post-${id}`, "Post", false, (cx) => this.postComment(key, cx))));
  }

  // ── Editing a card's title or description ───────────────────────────────────
  // One edit at a time: { key, field, input, base, saving, error }. `base` is the text the edit
  // started from. Text boxes need a live host call, so edits start from a click.

  startEdit(key, field, value, cx) {
    this.stopEditing();
    const multi = field === "description";
    const input = multi ? TextareaState.new({ value }) : InputState.new({ value });
    if (multi) input.set_auto_grow(6, 30);
    const e = { key, field, input, base: value, saving: false, error: null };
    // A title saves on Enter; a description takes Enter as a new line and saves on Cmd+Enter.
    input.on("submit", (ev, cx) => { if (!multi || ev.secondary) this.saveEdit(cx); });
    this.editing = e;
    // The box isn't on screen until the next frame, and a focus before that lands nowhere.
    input.focus();
    cx.timer?.after?.(60, () => input.focus());
    cx.timer?.after?.(300, () => input.focus());
    cx.notify();
  }

  stopEditing() {
    if (this.editing) this.editing.input.release();
    this.editing = null;
  }

  saveEdit(cx) {
    const e = this.editing;
    if (!e || e.saving) return;
    const [srcId, ...rest] = e.key.split("|");
    const id = rest.join("|");
    const src = this.config.boards.find((b) => b.id === srcId);
    const raw = e.input.value();
    const text = e.field === "title" ? raw.replace(/\s+/g, " ").trim() : raw.trim();
    if (!src || !text) return;
    if (text === e.base.trim()) { this.stopEditing(); cx.notify(); return; }
    e.saving = true;
    e.error = null;
    cx.notify();
    const args = e.field === "title" ? ["title", id, text] : ["describe", id, text, e.base];
    cx.spawn(async (cx) => {
      try {
        await runProgram(src, this.sourceContext(src), args);
        const d = this.details.get(e.key)?.data;
        if (d && e.field === "title") d.title = text; // shows at once; the refetch below confirms it
        if (this.editing === e) this.stopEditing();
        this.fetchDetail(src, id, cx, true);
        if (this.role === "board" && e.field === "title") this.tickBoard(cx, true);
      } catch (err) {
        e.saving = false;
        e.error = `Couldn't save: ${err?.message ?? err}`;
      }
      cx.notify();
    });
  }

  editor(t, id, note = null) {
    const e = this.editing;
    const multi = e.field === "description";
    return v_flex().gap(6)
      .on_key_down((ev, cx) => { if (ev.key === "escape") { cx.stop_propagation(); this.stopEditing(); cx.notify(); } })
      .child(div().w_full().px(10).py(multi ? 6 : 4).rounded(7).border_1().border_color(t.accent).bg(t.background)
        .text_size(multi ? 13 : 15).when(!multi, (el) => el.font_semibold()).text_color(t.foreground)
        .child(multi ? Textarea.new(e.input) : Input.new(e.input).h(28)))
      .when(Boolean(note), (el) => el.child(div().text_size(11.5).text_color(t.blocked).child(note)))
      .child(h_flex().gap(8).items_center().text_size(11.5)
        .child(div().flex_1().min_w(0).truncate().text_color(e.error ? t.blocked : t.dim)
          .child(e.error ?? (multi ? "Markdown. ⌘↵ saves · Esc cancels" : "↵ saves · Esc cancels")))
        .child(e.saving ? div().flex_none().text_color(t.dim).child("Saving…") : h_flex().flex_none().gap(4)
          .child(this.chip(t, `tv-cancel-${id}`, "Cancel", false, (cx) => { this.stopEditing(); cx.notify(); }))
          .child(this.chip(t, `tv-save-${id}`, "Save", true, (cx) => this.saveEdit(cx)))));
  }

  pencil(t, bid, tip, onClick) {
    return div().id(bid).flex_none().p(3).rounded(4).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); })
      .child(svg(`${ICONS}/square-pen.svg`).size(13));
  }

  // Shows a card in the drawer; the same card again closes it.
  openDetail(src, c, cx) {
    const same = this.detail?.src === src.id && this.detail?.id === c.id;
    setShared(DETAIL_KEY, same ? null : { src: src.id, id: c.id });
    if (this.editing && this.editing.key !== `${src.id}|${c.id}`) this.stopEditing();
    if (!same) {
      this.composer(`${src.id}|${c.id}`);
      this.fetchDetail(src, c.id, cx);
      this.loadMoves(src, c.id, cx);
    }
    cx.notify();
  }

  // Opens the card as a tab of its own, in the terminals' place (so the board steps aside).
  popOut(src, c) {
    showBoard(false);
    run("tab.new", { name: clip(c.tag ?? c.title, 24), mod: "cardfile", props: { ticket: { source: src.id, id: c.id, title: c.title, tag: c.tag } } });
  }

  // The card's header, fields, moves and markdown. `c` is what's known before `show` answers.
  ticketView(t, src, c, { drawer }) {
    const key = `${src.id}|${c.id}`;
    const r = this.details.get(key);
    const d = r?.data ?? null;
    const card = { ...c, ...(d ?? {}) };
    const id = `${src.id}-${c.id}`;
    const tone = card.tone ? t[card.tone] ?? t.accent : null;
    const iconButton = (bid, label, tip, onClick) => div().id(bid).flex_none().px(6).h(20).rounded(5).flex().items_center()
      .text_size(12).text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); })
      .child(label.endsWith(".svg") ? svg(label).size(13) : label);

    const head = h_flex().h(30).flex_none().pl(12).pr(6).gap(8).items_center().text_size(12).border_b(1).border_color(t.border)
      .when(Boolean(card.tag), (el) => el.child(div().flex_none().px(5).h(16).rounded(4).border(1).border_color(tone ?? t.border)
        .text_size(10).font_semibold().text_color(tone ?? t.muted).flex().items_center().child(card.tag)))
      .child(div().flex_1().min_w(0).truncate().text_color(r?.error ? t.blocked : t.dim)
        .child(r?.loading ? "Loading…" : r?.error ? `Couldn't load: ${r.error}` : ""))
      .child(iconButton(`tv-reload-${id}`, "↻", "Refresh", (cx) => this.fetchDetail(src, c.id, cx, true)))
      .when(Boolean(card.url), (el) => el.child(iconButton(`tv-url-${id}`, "mods/cardfile/globe.svg", "Open in the browser", () => exec("open", [card.url]))))
      .when(drawer, (el) => el
        .child(iconButton(`tv-tab-${id}`, "↗", "Open as a tab", () => this.popOut(src, card)))
        .child(iconButton(`tv-close-${id}`, "×", "Close", (cx) => { this.stopEditing(); setShared(DETAIL_KEY, null); cx.notify(); })));

    const field = (f) => h_flex().gap(10).items_start().text_size(12)
      .child(div().w(84).flex_none().text_color(t.dim).child(f.label))
      .child(div().flex_1().min_w(0).text_color(t.foreground).child(f.value));

    const m = this.moves.get(key);
    const lanes = d?.lanes?.length ? d.lanes : this.boards?.get(this.boardKey(src))?.data?.lanes ?? [];
    const here = this.placed.get(key)?.lane ?? card.lane;
    const order = (l) => { const i = lanes.findIndex((x) => x.id === l.id); return i < 0 ? lanes.length : i; };
    const options = (m?.lanes ?? []).filter((x) => x !== here).map((x) => lanes.find((l) => l.id === x) ?? { id: x, label: x })
      .sort((a, b) => order(a) - order(b));
    const moveRow = h_flex().flex_wrap().gap(4).items_center()
      .child(div().w(84).flex_none().text_size(12).text_color(t.dim).child("Move to"))
      .children(m?.error ? [div().text_size(11.5).text_color(t.blocked).child(m.error)]
        : !m?.lanes ? [div().text_size(11.5).text_color(t.dim).child("Checking…")]
        : options.length ? options.map((l) => this.chip(t, `tv-mv-${id}-${l.id}`, l.label, false, (cx) => this.placeCard(src, card, l, cx)))
        : [div().text_size(11.5).text_color(t.dim).child("It can't move from here.")]);

    const editing = this.editing?.key === key ? this.editing.field : null;
    const body = v_flex().id(`tv-body-${id}`).flex_1().min_h(0).px(16).py(12).gap(12).overflow_y_scrollbar()
      .child(editing === "title" ? this.editor(t, id)
        : h_flex().gap(6).items_start()
          .child(div().flex_1().min_w(0).text_size(drawer ? 15 : 18).font_semibold().text_color(t.foreground).child(card.title))
          .when(Boolean(d?.edit), (el) => el.child(this.pencil(t, `tv-edit-${id}`, "Edit the title",
            (cx) => this.startEdit(key, "title", card.title, cx)).mt(2))))
      .when(Boolean(d?.fields?.length), (el) => el.child(v_flex().gap(5).children(d.fields.map(field))))
      .child(moveRow)
      .when(Boolean(card.task), (el) => el.child(h_flex().gap(6)
        .child(this.chip(t, `tv-run-${id}`, "Start an agent on this", false, () => this.startAgent(card)))))
      .child(div().h(1).flex_none().bg(t.border))
      .when(Boolean(d?.edit && d.description != null), (el) => el.child(h_flex().gap(6).items_center()
        .child(div().flex_1().text_size(12).font_medium().text_color(t.dim).child("Description"))
        .when(editing !== "description", (el) => el.child(this.pencil(t, `tv-desc-${id}`, "Edit the description",
          (cx) => this.startEdit(key, "description", d.description, cx))))))
      .child(editing === "description" ? this.editor(t, id, d?.descriptionNote)
        : d ? div().text_size(13).text_color(t.foreground).child(TextView.markdown(`tv-md-${id}`, d.markdown || "*Nothing more.*").selectable(true))
        : div().text_size(12).text_color(t.dim).child(r?.error ? "" : "Loading…"));

    const compose = d?.comment ? this.commentBox(t, key, id) : null;
    return v_flex().size_full().min_h(0).child(head).child(body)
      .when(Boolean(compose), (el) => el.child(div().flex_none().px(12).pt(10).pb(10).border_t(1).border_color(t.border).child(compose)));
  }

  // Puts an agent in a lane by labelling its terminal; `lane` null goes back to automatic.
  moveTo(a, term, lane, cx) {
    const turn = Number(term?.turn) || 0;
    this.moved.set(a.address, { lane: lane?.id ?? null, turn, at: Date.now() });
    this.picking = null;
    this.error = null;
    cx.notify();
    const labels = lane ? [`${LANE_LABEL}=${lane.id}`, `${TURN_LABEL}=${turn}`] : [`${LANE_LABEL}=`, `${TURN_LABEL}=`];
    cx.spawn(async (cx) => {
      const r = await hc(["label", a.address, ...labels]).catch((e) => ({ code: 1, stderr: e?.message ?? String(e) }));
      if (r.code !== 0) {
        this.moved.delete(a.address);
        this.error = `Couldn't move the card: ${(r.stderr || r.stdout || `exit ${r.code}`).trim().split("\n").at(-1)}`;
      }
      cx.notify();
    });
  }

  // Leave the board when you pick another tab or pane in this space (a card, the tab bar, the
  // sidebar). Switching spaces keeps it, so you can look through spaces' boards.
  watchFocus() {
    const f = focused();
    const key = f ? `${f.tab}|${f.pane}` : "";
    const opened = shared(BOARD_KEY);
    if (opened === this.opened && boardShown() && f?.space === this.lastSpace && key !== this.lastFocus) showBoard(false);
    this.opened = opened;
    this.lastFocus = key;
    this.lastSpace = f?.space;
  }

  // ── Pieces ─────────────────────────────────────────────────────────────────

  chip(t, id, label, on, onClick) {
    return div()
      .id(id).px(7).h(20).rounded(5).flex().items_center().text_size(11)
      .border(1).border_color(on ? t.accent : t.border)
      .text_color(on ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); })
      .child(label);
  }

  footButton(t, id, label, tip, on, onClick) {
    return div().id(id).flex_none().px(5).h(18).rounded(4).flex().items_center()
      .text_color(on ? t.foreground : t.dim).when(on, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); })
      .child(label);
  }

  lanePicker(t, a, term, current) {
    const labelled = term?.labels?.[LANE_LABEL] ?? null;
    return h_flex().flex_wrap().px(10).pb(8).gap(4)
      .children(this.config.lanes.map((l) => this.chip(t, `mv-${a.address}-${l.id}`, l.label, l.id === current.id, (cx) => this.moveTo(a, term, l, cx))))
      .when(Boolean(labelled || this.moved.get(a.address)?.lane), (el) => el.child(
        this.chip(t, `mv-${a.address}-auto`, "Automatic", false, (cx) => this.moveTo(a, term, null, cx))));
  }

  laneColumn(t, l, items, note = null) {
    const tone = l.tone ? t[l.tone] ?? t.accent : t.dim;
    return v_flex().id(`lane-${l.id}`).w(this.width).flex_none().h_full().min_h(0)
      .rounded(8).bg(t.chrome).border(1).border_color(t.border)
      .child(h_flex().px(10).h(34).flex_none().gap(7).items_center()
        .child(div().size(7).flex_none().rounded(4).bg(tone))
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_medium().text_color(t.foreground).child(l.label))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(String(items.length))))
      .when(Boolean(note), (el) => el.child(div().px(10).pb(6).flex_none().truncate().text_size(10.5).text_color(t.dim).child(note)))
      .child(v_flex().id(`lane-cards-${l.id}`).flex_1().min_h(0).px(8).pb(8).gap(8).overflow_y_scrollbar()
        .children(items.length ? items : [div().px(2).text_size(11.5).text_color(t.dim).child("Empty")]));
  }

  // A board source's card: the title over its lines, then its tag, meta, Agent and Move.
  boardCard(t, src, c, lanes, laneId, show) {
    const key = `${src.id}|${c.id}`;
    const id = `${src.id}-${c.id}`;
    const picking = this.picking === key;
    const tone = c.tone ? t[c.tone] ?? t.accent : null;
    let after = null;
    if (picking) {
      const m = this.moves.get(key);
      const options = (m?.lanes ?? []).filter((x) => x !== laneId).map((x) => lanes.find((l) => l.id === x)).filter(Boolean);
      after = h_flex().flex_wrap().px(10).pb(8).gap(4).children(
        m?.error ? [this.note(t, m.error, t.blocked)]
          : !m?.lanes ? [this.note(t, "Checking where it can go…")]
          : options.length ? options.map((l) => this.chip(t, `bmv-${id}-${l.id}`, l.label, false, (cx) => this.placeCard(src, c, l, cx)))
          : [this.note(t, "It can't move from here.")]);
    }
    return this.card(t, {
      id: `bc-${id}`,
      rule: tone ?? t.border,
      onClick: show ? (_e, cx) => this.openDetail(src, c, cx) : c.file || c.url ? () => this.openCard(c) : null,
      selected: show && this.detail?.src === src.id && this.detail?.id === c.id,
      after,
      head: [div().flex_1().min_w(0).max_h(42).overflow_hidden().text_size(13).font_medium().text_color(t.foreground).child(clip(c.title, 90))],
      lines: c.lines,
      foot: [
        c.tag ? div().flex_none().px(5).h(16).rounded(4).border(1).border_color(tone ?? t.border).text_size(10).font_semibold()
          .text_color(tone ?? t.muted).flex().items_center().child(c.tag) : null,
        div().flex_1().min_w(0).truncate().child(c.meta ?? ""),
        c.task ? this.footButton(t, `bc-run-${id}`, "Agent", "Start an agent on this", false, () => this.startAgent(c)) : null,
        this.footButton(t, `bc-mv-${id}`, "Move", "Move to another lane", picking, (cx) => this.openMoves(src, c, cx)),
      ].filter(Boolean),
    });
  }

  // ── The two kinds of board ───────────────────────────────────────────────────

  agentBoard(t) {
    const now = Date.now();
    const scope = shared(SCOPE_KEY) === "all" ? "all" : "space";
    const active = spaces().find((s) => s.active);
    const all = terminals();
    const byAddress = new Map(all.map((k) => [k.address, k]));
    const kids = new Map();
    for (const k of all) if (k.parent && k.state === "live") kids.set(k.parent, (kids.get(k.parent) ?? 0) + 1);
    const list = agents().filter((a) => scope === "all" || a.space === active?.id);
    this.track(list, now);

    // Forget a move once the labels show it (or it has had long enough to).
    for (const [address, m] of this.moved) {
      if ((byAddress.get(address)?.labels?.[LANE_LABEL] ?? null) === m.lane || now - m.at > 15000) this.moved.delete(address);
    }

    const lanes = this.config.lanes;
    const groups = new Map(lanes.map((l) => [l.id, []]));
    const laneFor = new Map();
    for (const a of list) {
      const lane = laneOf(a, byAddress.get(a.address), lanes, this.moved.get(a.address));
      laneFor.set(a.address, lane);
      groups.get(lane.id).push(a);
    }

    const card = (a) => {
      const term = byAddress.get(a.address);
      const picking = this.picking === a.address;
      return this.agentCard(t, a, byAddress, kids, now, {
        onClick: () => { showBoard(false); run("pane.focus", { pane: a.pane }); },
        foot: [this.footButton(t, `mv-${a.address}`, "Move", "Move to another lane", picking,
          (cx) => { this.picking = picking ? null : a.address; cx.notify(); })],
        after: picking ? this.lanePicker(t, a, term, laneFor.get(a.address)) : null,
      });
    };

    return {
      info: scope === "all" ? "All spaces" : active?.name ?? "",
      error: this.error,
      controls: [this.scopeToggle(t, scope)],
      lanes: lanes.map((l) => this.laneColumn(t, l, groups.get(l.id).sort((x, y) => (y.pinned - x.pinned) || y.seq - x.seq).map(card))),
    };
  }

  sourceBoard(t, src) {
    const key = this.boardKey(src);
    const r = this.boards.get(key);
    const data = r?.data;
    const loading = this.fetching.has(key);
    const controls = [];
    if (data?.views?.length > 1) {
      const on = this.boardView(src) || data.view || data.views[0].id;
      controls.push(this.toggle(t, `bv-${src.id}`, data.views, on, (id) => { this.picking = null; setShared(viewKey(src.id), id); }));
    }
    controls.push(div().id(`bv-reload-${src.id}`).flex_none().px(5).h(20).rounded(5).flex().items_center().text_size(13).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Refresh")
      .on_click((_e, cx) => this.tickBoard(cx, true)).child("↻"));
    const age = r ? duration(Date.now() - r.at) : null;
    const info = loading ? "Updating…" : age === "now" ? "Updated just now" : age ? `Updated ${age} ago` : "";
    const error = this.error ?? (r?.error ? `Couldn't refresh: ${r.error}` : null);
    if (!data) {
      return { info, error, controls, lanes: [this.note(t, r?.error ? "Nothing to show yet." : "Loading…")] };
    }
    const groups = new Map(data.lanes.map((l) => [l.id, []]));
    const laneFor = (c) => {
      const p = this.placed.get(`${src.id}|${c.id}`)?.lane;
      return p && groups.has(p) ? p : c.lane;
    };
    for (const c of data.cards) groups.get(laneFor(c)).push(c);
    return {
      info: data.cards.length ? info : data.empty ?? info,
      error,
      controls,
      lanes: data.lanes.map((l) => this.laneColumn(t, l, groups.get(l.id).map((c) => this.boardCard(t, src, c, data.lanes, l.id, data.show)), l.note)),
      drawer: data.show && this.detail?.src === src.id ? this.ticketView(t, src, data.cards.find((c) => c.id === this.detail.id) ?? { id: this.detail.id, title: this.detail.id }, { drawer: true }) : null,
    };
  }

  renderBoard(t) {
    this.watchFocus();
    const src = this.boardSource();
    const b = src ? this.sourceBoard(t, src) : this.agentBoard(t);
    const boards = this.config.boards;
    const pick = (id) => { this.picking = null; this.error = null; setShared(SOURCE_KEY, id); };
    return v_flex()
      .id("root")
      .size_full()
      .min_h(0)
      .rounded(10)
      .overflow_hidden()
      .bg(t.background)
      .border_1()
      .border_color(t.border)
      // The board's header, in the pane header's style.
      .child(h_flex().h(30).flex_none().pl(12).pr(6).gap(10).items_center().text_size(12).border_b(1).border_color(t.border)
        .child(svg("mods/cardfile/kanban.svg").size(14).flex_none().text_color(t.dim))
        .child(boards.length
          ? this.toggle(t, "bsrc", [{ id: "agents", label: "Agents" }, ...boards.map((s) => ({ id: s.id, label: s.label ?? s.id }))], src?.id ?? "agents", pick)
          : div().flex_none().font_medium().text_color(t.foreground).child("Board"))
        .child(div().flex_none().text_color(t.dim).child(b.info ?? ""))
        .child(div().flex_1().min_w(0).truncate().text_color(t.blocked).child(b.error ?? ""))
        .children(b.controls)
        .child(div().id("board-close").flex_none().px(5).h(20).rounded(5).flex().items_center().text_size(13).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Back to terminals")
          .on_click(() => showBoard(false)).child("×")))
      .child(h_flex().flex_1().min_h(0)
        .child(h_flex().id("cf-lanes").flex_1().min_w(0).h_full().p(10).gap(10).items_start().overflow_x_scrollbar()
          .children(b.lanes))
        .when(Boolean(b.drawer), (el) => el.child(v_flex().id("cf-drawer").w(460).flex_none().h_full().min_h(0)
          .border_l(1).border_color(t.border).bg(t.background).child(b.drawer))));
  }

  // A card in a tab of its own: props { ticket: { source, id, title, tag } }.
  initTicket(ticket, cx) {
    this.ticket = ticket;
    this.width = 600;
    this.picking = null;
    this.error = null;
    this.config = { agent: ["claude"], sources: [], boards: [], lanes: DEFAULT_LANES, errors: [] };
    this.boards = new Map();
    this.moves = new Map();
    this.placed = new Map();
    this.details = new Map();
    this.composers = new Map();
    this.loaded = false;
    if (checking()) return;
    this.composer(`${ticket.source}|${ticket.id}`);
    cx.spawn(async (cx) => {
      this.config = await loadConfig();
      this.loaded = true;
      const src = this.config.boards.find((b) => b.id === ticket.source);
      if (src) {
        this.fetchDetail(src, ticket.id, cx, true);
        this.loadMoves(src, ticket.id, cx);
      }
      cx.notify();
    });
  }

  renderTicket(t) {
    const src = this.config.boards.find((b) => b.id === this.ticket.source);
    return v_flex().id("root").size_full().min_h(0).bg(t.background)
      .child(src ? this.ticketView(t, src, this.ticket, { drawer: false })
        : this.note(t, this.loaded ? `No board source "${this.ticket.source}" in cardfile.json.` : "Loading…"))
      .when(Boolean(this.error), (el) => el.child(div().px(16).pb(8).text_size(12).text_color(t.blocked).child(this.error)));
  }

  // ── Spaces column ──────────────────────────────────────────────────────────

  renderSpaces(t) {
    const list = spaces();
    const counts = new Map();
    for (const a of agents()) counts.set(a.space, (counts.get(a.space) ?? 0) + 1);
    const row = (s) => {
      const n = counts.get(s.id) ?? 0;
      const sub = [n ? `${n} agent${n > 1 ? "s" : ""}` : null, s.branch].filter(Boolean).join(" · ");
      return h_flex()
        .id(`sp-${s.id}`)
        .flex_none()
        .px(10)
        .py(6)
        .gap(6)
        .items_start()
        .rounded(7)
        .cursor_pointer()
        .when(s.active, (el) => el.bg(t.selected))
        .when(!s.active, (el) => el.hover((h) => h.bg(t.hover)))
        .on_click(() => run("space.select", { id: s.id }))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().text_size(12.5).text_color(s.active ? t.foreground : t.muted).when(s.active, (el) => el.font_medium()).child(s.name))
          .when(Boolean(sub), (el) => el.child(div().text_size(10.5).text_color(t.dim).truncate().child(sub))))
        .child(div().pt(3).child(s.status === "blocked"
          ? div().size(14).flex_none().rounded(4).bg(fade(t.blocked, "26")).text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!")
          : statusMark(t, s.status) ?? div()));
    };
    return v_flex()
      .id("root")
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .child(h_flex().pl(12).pr(8).h(36).pt(8).flex_none().items_center().justify_between()
        .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Spaces"))
        .child(div().id("sp-new").text_size(14).text_color(t.dim).hover((s) => s.text_color(t.foreground))
          .tooltip("New space").on_click(() => run("space.new", {})).child("+")))
      .child(v_flex().id("cf-spaces").flex_1().min_h(0).px(8).gap(2).overflow_y_scrollbar().children(list.map(row)));
  }

  // ── File view (dialog) ─────────────────────────────────────────────────────

  initView(view, cx) {
    this.view = view;
    this.text = null;
    cx.spawn(async (cx) => {
      try { this.text = (await readTextFile(view.file)) ?? "*File not found.*"; } catch (e) { this.text = `*Couldn't read the file: ${e?.message ?? e}*`; }
      cx.notify();
    });
  }

  renderView(t) {
    const v = this.view;
    return v_flex().size_full().bg(t.popover)
      .child(h_flex().px(16).h(44).flex_none().gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(14).font_semibold().text_color(t.foreground).child(v.title))
        .child(div().id("v-open").text_size(12).text_color(t.dim).hover((s) => s.text_color(t.foreground))
          .on_click(() => exec("open", [v.file])).child("Open file"))
        .child(div().id("v-close").text_size(12).text_color(t.dim).hover((s) => s.text_color(t.foreground))
          .on_click(() => closeOverlay(props().overlay)).child("Close")))
      .child(div().id("v-body").flex_1().min_h(0).px(18).py(12).overflow_y_scrollbar().text_size(13).text_color(t.foreground)
        .child(this.text == null ? "Loading…" : TextView.markdown("v-md", this.text).selectable(true)));
  }

  render() {
    const t = theme();
    if (this.role === "view") return this.renderView(t);
    if (this.role === "spaces") return this.renderSpaces(t);
    if (this.role === "todo") return this.renderTodo(t);
    if (this.role === "panel-tabs") return this.renderPanelTabs(t);
    if (this.role === "tab-button") return this.renderTabButton(t);
    if (this.role === "board") return this.renderBoard(t);
    if (this.role === "ticket") return this.renderTicket(t);
    return this.renderAgents(t);
  }
}
