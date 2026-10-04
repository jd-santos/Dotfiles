import assert from "node:assert/strict";
import test from "node:test";
import autoCompact from "../auto-compact.ts";

function harness() {
  const handlers = new Map();
  const compactCalls = [];
  autoCompact({ on: (name, handler) => handlers.set(name, handler) });
  return {
    compactCalls,
    turn(percent, tokens = percent * 1000) {
      handlers.get("turn_end")(
        {},
        {
          getContextUsage: () => ({ percent, tokens, contextWindow: 100_000 }),
          hasUI: false,
          compact: (options) => compactCalls.push(options),
        },
      );
    },
    reset() {
      handlers.get("session_start")();
    },
  };
}

test("compacts at 80 percent", () => {
  const h = harness();
  h.turn(70);
  h.turn(79.9);
  assert.equal(h.compactCalls.length, 0);
  h.turn(80);
  assert.equal(h.compactCalls.length, 1);
});

test("does not launch overlapping compactions", () => {
  const h = harness();
  h.turn(80);
  h.turn(85);
  assert.equal(h.compactCalls.length, 1);
  h.compactCalls[0].onComplete();
  h.turn(80);
  assert.equal(h.compactCalls.length, 2);
});

test("backs off after a failed compaction", () => {
  const h = harness();
  h.turn(80, 80_000);
  h.compactCalls[0].onError(new Error("failed"));
  h.turn(84.999, 84_999);
  assert.equal(h.compactCalls.length, 1);
  h.turn(85, 85_000);
  assert.equal(h.compactCalls.length, 2);
});

test("recovers when compact throws synchronously", () => {
  const handlers = new Map();
  let calls = 0;
  let tokens = 80_000;
  autoCompact({ on: (name, handler) => handlers.set(name, handler) });
  const context = {
    getContextUsage: () => ({
      percent: tokens / 1000,
      tokens,
      contextWindow: 100_000,
    }),
    hasUI: false,
    compact() {
      calls++;
      throw new Error("synchronous failure");
    },
  };
  handlers.get("turn_end")({}, context);
  handlers.get("turn_end")({}, context);
  assert.equal(calls, 1);
  tokens = 85_000;
  handlers.get("turn_end")({}, context);
  assert.equal(calls, 2);
});

test("ignores incomplete percentage telemetry", () => {
  const handlers = new Map();
  let calls = 0;
  autoCompact({ on: (name, handler) => handlers.set(name, handler) });
  handlers.get("turn_end")(
    {},
    {
      getContextUsage: () => ({ tokens: 70_000, contextWindow: 100_000 }),
      hasUI: false,
      compact() {
        calls++;
      },
    },
  );
  assert.equal(calls, 0);
});
