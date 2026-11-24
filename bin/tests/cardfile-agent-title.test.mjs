import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../herdr-app/.config/herdr-app/mods/cardfile/main.js", import.meta.url), "utf8");
function element(kind = "div", path = null) {
  const state = { kind, path, children: [], props: {} };
  const proxy = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "child") return (child) => { state.children.push(child); return proxy; };
      if (key === "children") return (children) => { state.children.push(...children); return proxy; };
      return (...args) => { state.props[key] = args; return proxy; };
    },
  });
  return proxy;
}
const { agentTitle, CardFile } = vm.runInNewContext(
  source.replace(/^import .*;\n/gm, "").replace("export default class CardFile", "class CardFile") + "\n({ agentTitle, CardFile });",
  { View: class {}, div: () => element(), h_flex: () => element("row"), v_flex: () => element("column"),
    svg: (path) => element("svg", path), image: (path) => element("image", path) },
);
const a = { address: "t42", app: "pi", program: { key: "pi", name: "Pi", icon: "icons/pi.svg", tint: true }, title: "Pi - Dotfiles - Main", tab_name: "Main", space_name: "Example", status: "working" };
const now = 1000;
const label = (title, expiresAt = now + 1) => ({ labels: { "pi.title": JSON.stringify({ title, expiresAt }) } });

test("Pi cards prefer the generated short title, never the terminal title", () => {
  assert.equal(agentTitle(a, label("Wire summary titles"), now), "Wire summary titles");
  assert.equal(agentTitle({ ...a, app: null }, label("Manual summary"), now), "Manual summary");
  assert.equal(agentTitle(a, label(" a ".repeat(90)), now).length, 80);
});

test("missing, invalid, empty and expired title labels show an honest placeholder", () => {
  for (const term of [undefined, {}, { labels: { "pi.title": "broken" } }, label(""), label("Old", now), label("Old", now - 1), label("Bad date", "9999"), label(42)]) {
    assert.equal(agentTitle(a, term, now), "Awaiting summary");
  }
});

test("other agents retain their own session titles and fallback names", () => {
  const claude = { ...a, app: "claude-code", program: { key: "claude", name: "Claude Code" }, title: "✦ Fix login" };
  assert.equal(agentTitle(claude, label("Stale Pi summary"), now), "Fix login");
  assert.equal(agentTitle({ ...claude, title: "", tab_name: "2" }, {}, now), "Claude Code");
  assert.equal(agentTitle({ ...claude, title: "" }, {}, now), "Main");
});

test("the card keeps a 20px header logo, summary title and footer metadata", () => {
  const mod = new CardFile();
  mod.width = 320;
  mod.laneFor = () => ({ id: "running", auto: ["working"], tone: "working" });
  mod.callMark = () => element("status");
  mod.card = (_theme, options) => options;
  const term = { ...label("Wire summary titles"), turn: 7 };
  const card = mod.agentCard({}, a, new Map([[a.address, term]]), new Map([[a.address, 2]]), now);
  assert.equal(card.head[0].children[0].kind, "svg");
  assert.equal(card.head[0].children[0].props.size[0], 20);
  assert.equal(card.head[1].children[0], "Wire summary titles");
  assert.deepEqual(Array.from(card.foot, (item) => item.children[0]), ["Example · Main", "2 helpers", "turn 7"]);
});

test("an agent without an icon keeps its title visible", () => {
  const mod = new CardFile();
  mod.width = 320;
  mod.laneFor = () => ({ id: "running", auto: ["working"] });
  mod.callMark = () => null;
  mod.card = (_theme, options) => options;
  const card = mod.agentCard({}, { ...a, program: { key: "pi", name: "Pi" } }, new Map([[a.address, label("Fix layout")]]), new Map(), now);
  assert.equal(card.head[0].children[0], "Fix layout");
});

test("all full and compact views use the shared title selector", () => {
  assert.equal((source.match(/agentTitle\(a, /g) ?? []).length, 4); // Definition and three call sites.
  assert.equal((source.match(/clean\(a\.title\)/g) ?? []).length, 1); // Non-Pi fallback only.
});
