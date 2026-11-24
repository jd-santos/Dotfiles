import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

import bridge from "../herdr-jd.ts";
import { APP_TITLE_LABEL, SUMMARY_UPDATED_EVENT, TITLE_TTL_MS, latestConversationTitle, parseSummaryResponse } from "../lib/herdr-title.ts";

const entry = (data: any) => ({ type: "custom", customType: "conversation-summary", data });
const summarySource = readFileSync(new URL("../conversation-summary.ts", import.meta.url), "utf8");
const summaryFactory = vm.runInNewContext(
  stripTypeScriptTypes(summarySource.replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, "").replace("export default function", "function summaryExtension")) + "\nsummaryExtension;",
  { SUMMARY_UPDATED_EVENT, parseSummaryResponse, AbortController, setTimeout, clearTimeout, Date,
    complete: async () => ({ content: [{ type: "text", text: "TITLE: Wire summary titles\nSUMMARY: Connect generated conversation titles to the desktop agent cards" }] }) },
);

function harness({ env = { HC_TERMINAL_ID: "t42" }, mode = "tui", entries = [entry({ title: "Stored short title", summary: "Stored longer summary" })], exec }: any = {}) {
  const handlers = new Map<string, any[]>();
  const listeners = new Map<string, Set<any>>();
  const calls: any[] = [];
  const notices: any[] = [];
  const commands = new Map<string, any>();
  const pi: any = {
    on(name: string, handler: any) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
    events: {
      on(name: string, handler: any) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(handler);
        return () => listeners.get(name)!.delete(handler);
      },
      emit(name: string) { for (const f of listeners.get(name) ?? []) f(); },
    },
    exec: async (...args: any[]) => { calls.push(args); return exec ? exec(...args) : { code: 0 }; },
    registerCommand(name: string, command: any) { commands.set(name, command); },
    appendEntry(_type: string, data: any) { entries.push(entry(data)); },
    getSessionName: () => "unchanged",
    setSessionName() {}, // Deliberately no session_info_changed event.
  };
  const keys = ["HC_TERMINAL_ID", "HERDR_ENV", "HERDR_PANE_ID", "HERDR_BIN_PATH"];
  const previous = keys.map((k) => process.env[k]);
  try {
    for (const k of keys) { delete process.env[k]; if (env[k]) process.env[k] = env[k]; }
    bridge(pi);
  } finally {
    keys.forEach((k, i) => { if (previous[i] === undefined) delete process.env[k]; else process.env[k] = previous[i]; });
  }
  const ctx: any = {
    mode, hasUI: mode === "tui", isIdle: () => true,
    ui: { notify: (...args: any[]) => notices.push(args), setStatus() {} },
    sessionManager: { getBranch: () => entries, getEntries: () => entries, getSessionFile: () => undefined },
    modelRegistry: { find: () => ({}), getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "test-only" }) },
  };
  const emit = async (name: string) => { for (const f of handlers.get(name) ?? []) await f({}, ctx); };
  const payload = () => {
    const value = calls.at(-1)?.[1]?.[2]?.slice(APP_TITLE_LABEL.length + 1);
    return value ? JSON.parse(value) : null;
  };
  return { pi, ctx, entries, calls, notices, commands, emit, payload, listeners };
}

test("selects the newest branch title, summary fallback and explicit clear", () => {
  assert.equal(latestConversationTitle([entry({ title: "Old" }), entry({ summary: "Manual" })]), "Manual");
  assert.equal(latestConversationTitle([entry({ title: "Old" }), entry({ source: "manual-clear" })]), undefined);
  assert.equal(latestConversationTitle([entry({ title: "  ", summary: "Fallback" })]), "Fallback");
});

test("publishes a stored short title with expiry, without changing lifecycle reports", async () => {
  const h = harness();
  const before = Date.now();
  await h.emit("session_start");
  assert.equal(h.payload().title, "Stored short title");
  assert.ok(h.payload().expiresAt >= before + TITLE_TTL_MS);
  assert.deepEqual(h.calls[0].slice(0, 2), ["hc", ["label", "t42", `${APP_TITLE_LABEL}=${JSON.stringify(h.payload())}`]]);
  assert.equal(h.calls[0][2].timeout, 2000);
  await h.emit("session_shutdown");
  assert.equal(h.payload(), null);
  assert.equal(h.listeners.get(SUMMARY_UPDATED_EVENT)?.size, 0);
});

test("manual summary set and clear reach the bridge even without a name-change event", async () => {
  const h = harness();
  summaryFactory(h.pi);
  await h.emit("session_start");
  await h.commands.get("summary").handler("New manual summary", h.ctx);
  await h.emit("agent_start"); // Drain the serialized writes.
  assert.equal(h.payload().title, "New manual summary");
  await h.commands.get("summary").handler("clear", h.ctx);
  await h.emit("agent_start");
  assert.equal(h.payload(), null);
});

test("asynchronous generated title updates are published immediately", async () => {
  const h = harness({ entries: [{ type: "message", message: { role: "assistant", content: "Example reply" } }] });
  summaryFactory(h.pi);
  await h.emit("session_start");
  const updated = new Promise<void>((resolve) => h.pi.events.on(SUMMARY_UPDATED_EVENT, resolve));
  await h.emit("agent_end");
  await updated;
  await h.emit("agent_start");
  assert.equal(h.payload().title, "Wire summary titles");
});

test("queues updates before shutdown clearing", async () => {
  let release: any;
  const blocked = new Promise((resolve) => { release = resolve; });
  const h = harness({ exec: async () => { await blocked; return { code: 0 }; } });
  const started = h.emit("session_start");
  h.entries.push(entry({ title: "Latest" }));
  h.pi.events.emit(SUMMARY_UPDATED_EVENT);
  const shutdown = h.emit("session_shutdown");
  release();
  await Promise.all([started, shutdown]);
  assert.equal(h.payload(), null);
  assert.equal(h.calls.length, 3);
  assert.equal(JSON.parse(h.calls[1][1][2].slice(APP_TITLE_LABEL.length + 1)).title, "Latest");
});

test("tree navigation clears titles absent from the active branch", async () => {
  const h = harness();
  await h.emit("session_start");
  h.entries.length = 0;
  await h.emit("session_tree");
  assert.equal(h.payload(), null);
});

test("keeps the legacy TUI transport when no Core terminal is present", async () => {
  const h = harness({ env: { HERDR_ENV: "1", HERDR_PANE_ID: "w1:p2", HERDR_BIN_PATH: "/example/herdr" } });
  await h.emit("session_start");
  assert.equal(h.calls[0][0], "/example/herdr");
  assert.ok(h.calls[0][1].includes("title=Stored short title"));
  assert.ok(h.calls[0][1].includes("pi_glyph=π"));
  await h.emit("session_shutdown");
  assert.ok(h.calls.at(-1)[1].includes("--clear-token"));
});

test("does nothing outside Herdr or in an inherited non-interactive terminal", async () => {
  for (const options of [{ env: {} }, { mode: "print" }, { mode: "json" }, { mode: "rpc" }]) {
    const h = harness(options);
    await h.emit("session_start");
    await h.emit("agent_start");
    await h.emit("session_shutdown");
    assert.equal(h.calls.length, 0);
  }
});

test("transport failure is bounded, warns once, and does not poison later writes", async () => {
  let fail = true;
  const h = harness({ exec: async () => { if (fail) throw new Error("unavailable"); return { code: 0 }; } });
  await h.emit("session_start");
  await h.emit("agent_start");
  assert.equal(h.notices.length, 1);
  fail = false;
  await h.emit("agent_start");
  assert.equal(h.payload().title, "Stored short title");
});
