import assert from "node:assert/strict";
import test from "node:test";
import contextPlanner from "../context-planner.ts";

function harness() {
  const handlers = new Map();
  contextPlanner({ on: (name, handler) => handlers.set(name, handler) });
  return {
    prompt(usage) {
      handlers.get("before_agent_start")({}, { getContextUsage: () => usage });
    },
    context(messages = []) {
      return handlers.get("context")({ messages });
    },
    reset() {
      handlers.get("session_start")();
    },
  };
}

function usage(percent) {
  return { tokens: percent * 1000, contextWindow: 100000, percent };
}

test("advisory thresholds preserve normal, wrap-up, and stop behavior", () => {
  const h = harness();
  for (const [percent, state] of [[49.9, "normal"], [50, "wrap-up"], [79.9, "wrap-up"], [80, "stop"]]) {
    h.prompt(usage(percent));
    const message = h.context().messages[0];
    assert.ok(message.content.includes(`Planning state: ${state}`));
    assert.equal(message.display, false);
    assert.equal(message.customType, "context-planning-advisory");
  }
});

test("stop guidance uses the existing work record without authorizing writes", () => {
  const h = harness();
  h.prompt(usage(80));
  const text = h.context().messages[0].content;
  assert.match(text, /existing work README or inline task/);
  assert.match(text, /todo-manager skill/);
  assert.doesNotMatch(text, /in TODO\.md/);
  assert.match(text, /does not authorize compaction, TODO edits/);
});

test("unavailable telemetry does not demand stopping work", () => {
  const h = harness();
  for (const value of [undefined, { ...usage(50), tokens: null }, { ...usage(50), percent: null }]) {
    h.prompt(value);
    const text = h.context().messages[0].content;
    assert.match(text, /Treat capacity as unknown/);
    assert.match(text, /do not stop work solely because telemetry is unavailable/);
  }
});

test("context injection preserves existing messages and resets between sessions", () => {
  const h = harness();
  assert.equal(h.context(), undefined);
  h.prompt(usage(80));
  const messages = [{ role: "user", content: "Continue the task" }];
  const result = h.context(messages);
  assert.equal(messages.length, 1);
  assert.equal(result.messages.length, 2);
  assert.deepEqual(result.messages[0], messages[0]);
  h.reset();
  assert.equal(h.context(), undefined);
});
