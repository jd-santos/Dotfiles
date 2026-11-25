import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../herdr-app/.config/herdr-app/mods/cardfile/main.js", import.meta.url), "utf8");
function element() {
  const state = { nodes: [], props: {} };
  const proxy = new Proxy(state, { get(target, key) {
    if (key in target) return target[key];
    if (key === "child") return (child) => { state.nodes.push(child); return proxy; };
    if (key === "children") return (children) => { state.nodes.push(...children); return proxy; };
    if (key === "when") return (condition, fn) => condition ? fn(proxy) : proxy;
    return (...args) => { state.props[key] = args; return proxy; };
  } });
  return proxy;
}
const overlays = [], opened = [];
const { CardFile, cleanCard } = vm.runInNewContext(
  source.replace(/^import .*;\n/gm, "").replace("export default class CardFile", "class CardFile") + "\n({ CardFile, cleanCard });",
  { View: class {}, div: element, h_flex: element, v_flex: element,
    openOverlay: (options) => overlays.push(options), exec: (...args) => opened.push(args),
    TextView: { markdown: (_id, text) => element().child(text) } },
);
const theme = { border: "#333333", accent: "#ffaaaa" };
const raw = { title: "A long title that should remain fully readable", markdown: "- [ ] Parent\n  - [x] Child", url: "https://example.com/task", index: "/repo/todo/TODO.md", links: [{ label: "Child", file: "/repo/todo/work/child/README.md" }], task: "Continue", progress: [1, 2] };
function all(node) { return node && typeof node === "object" ? [node, ...(node.nodes ?? []).flatMap(all)] : []; }

test("Todo card keeps full title, enables footer wrapping and retains URL action with inline details", () => {
  const mod = new CardFile();
  mod.card = (_theme, options) => options;
  const card = mod.pluginCard(theme, { id: "todo" }, cleanCard(raw, 0));
  assert.equal(card.wrapFoot, true);
  assert.equal(card.head.at(-1).props.truncate, undefined);
  assert.equal(card.head.at(-1).nodes[0], raw.title);
  const link = card.foot.find((item) => item.props.id?.[0] === "url-todo-0");
  link.props.on_click[0]({}, { stop_propagation() {} });
  assert.equal(opened.at(-1)[0], "open");
  assert.equal(opened.at(-1)[1][0], raw.url);
  card.onClick();
  assert.equal(overlays.at(-1).props.view.markdown, raw.markdown);
});

test("Details renders complete inline body and explicit child record and URL actions", () => {
  const mod = new CardFile();
  mod.initView(cleanCard(raw, 0), { spawn() { assert.fail("Inline details must not read a file"); } });
  const nodes = all(mod.renderView(theme));
  assert.ok(nodes.some((node) => node.nodes.includes(raw.markdown)));
  const link = nodes.find((node) => node.props.id?.[0] === "v-work-0");
  link.props.on_click[0]();
  assert.equal(overlays.at(-1).props.view.file, raw.links[0].file);
  assert.ok(nodes.some((node) => node.props.id?.[0] === "v-url"));
});

test("Legacy URL-only and file cards keep their original opening behavior", () => {
  const mod = new CardFile();
  mod.openCard({ title: "URL", url: raw.url });
  assert.equal(opened.at(-1)[0], "open");
  assert.equal(opened.at(-1)[1][0], raw.url);
  mod.openCard({ title: "File", file: "/repo/work.md" });
  assert.equal(overlays.at(-1).props.view.file, "/repo/work.md");
});
