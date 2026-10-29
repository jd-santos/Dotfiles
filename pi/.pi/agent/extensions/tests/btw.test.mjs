import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const piDir = process.env.PI_TEST_PACKAGE_DIR ?? join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const require = createRequire(join(piDir, "package.json"));
const { createJiti } = require("jiti");
const tuiPath = require.resolve("@earendil-works/pi-tui");
const aiPath = join(piDir, "node_modules/@earendil-works/pi-ai/dist/index.js");
const jiti = createJiti(import.meta.url, { fsCache: false, alias: {
  "@earendil-works/pi-coding-agent": join(piDir, "dist/index.js"),
  "@earendil-works/pi-tui": tuiPath,
} });
const file = (path) => fileURLToPath(new URL(path, import.meta.url));
const helpers = await jiti.import(file("../lib/btw.ts"));
const { default: btw } = await jiti.import(file("../btw.ts"));
const { SessionManager, convertToLlm, initTheme } = await import(join(piDir, "dist/index.js"));
initTheme("dark", false);
const { AssistantMessageEventStream } = await import(aiPath);
const { visibleWidth } = await import(tuiPath);
const { parseBtwArgs, selectBtwMessages, completeToolPairs, prepareBtwPayload, prefixMatches, estimateBtwCost, BtwBudget, usageReceipt, positiveBudget } = helpers;

const model = {
  id: "test-model", name: "Test", api: "openai-responses", provider: "openai",
  baseUrl: "https://example.invalid/v1", reasoning: false, input: ["text"],
  contextWindow: 128000, maxTokens: 4096,
  cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
};
const user = (content) => ({ role: "user", content, timestamp: 1 });
const system = (content = "System instructions") => ({ role: "system", content, toolsAdded: [{ name: "read", description: "Read", parameters: { type: "object", properties: {} } }], timestamp: 1 });
const assistant = (content = [{ type: "text", text: "Answer" }], stopReason = "stop") => ({
  role: "assistant", content, stopReason, timestamp: 2, api: model.api, provider: model.provider, model: model.id,
  usage: { input: 10, output: 5, cacheRead: 90, cacheWrite: 0, totalTokens: 105, cost: { input: 0.01, output: 0.01, cacheRead: 0.01, cacheWrite: 0, total: 0.03 } },
});
const call = (id) => ({ type: "toolCall", id, name: "read", arguments: {} });
const result = (id) => ({ role: "toolResult", toolCallId: id, toolName: "read", content: [{ type: "text", text: "file body" }], isError: false, timestamp: 3 });
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };

function harness({ idle = true, hold = false, nativeUsage = true, flags = {}, chosenModel = model, initial = [system(), user("Main task")], failure, oauth = false, subscription = false, rows = 40 } = {}) {
  const handlers = new Map();
  const commands = new Map();
  const manager = SessionManager.inMemory();
  for (const message of initial) manager.appendMessage(message);
  const notices = [];
  const dispatched = [];
  let view;
  let lastOptions;
  let lastContext;
  const generatedPayload = (context) => ({ model: chosenModel.id, input: structuredClone(context.messages), tools: [{ name: "read" }], prompt_cache_key: manager.getSessionId(), reasoning: { effort: "medium" }, text: { verbosity: "low" }, store: false });
  const pi = {
    on: (name, fn) => handlers.set(name, fn),
    registerCommand: (name, command) => commands.set(name, command),
    registerFlag() {}, getFlag: (name) => flags[name], getThinkingLevel: () => "medium",
    appendEntry: (name, data) => manager.appendCustomEntry(name, data),
    sendUserMessage() { throw new Error("Must not send a parent prompt"); },
    sendMessage() { throw new Error("Must not send a parent message"); },
    setActiveTools() { throw new Error("Must not alter parent tools"); },
  };
  const ctx = {
    mode: "tui", hasUI: true, cwd: "/fixture", model: chosenModel,
    sessionManager: manager, isIdle: () => idle, getSystemPrompt: () => "System instructions",
    abort() { throw new Error("Must not abort the parent"); },
    compact() { throw new Error("Must not compact the parent"); },
    modelRegistry: {
      isUsingOAuth: () => oauth,
      getProvider: () => ({ auth: { oauth: { isSubscription: subscription } } }),
      streamSimple(requestModel, context, options) {
        assert.equal(requestModel, chosenModel);
        lastOptions = options;
        lastContext = structuredClone(context);
        const stream = new AssistantMessageEventStream();
        void (async () => {
          try {
            const payload = await options.onPayload(generatedPayload(context));
            assert.equal(options.signal.aborted, false);
            dispatched.push(payload);
            if (hold) await new Promise((resolve) => options.signal.addEventListener("abort", resolve, { once: true }));
            if (failure) throw new Error("Provider error containing PRIVATE REQUEST TEXT");
            const message = assistant(undefined, options.signal.aborted ? "aborted" : "stop");
            if (nativeUsage) options.onProviderStreamEvent(typeof nativeUsage === "object" ? nativeUsage : { type: "response.completed", response: { usage: { input_tokens: 100, output_tokens: 5, input_tokens_details: { cached_tokens: 90 } } } });
            stream.push({ type: "done", reason: message.stopReason, message });
          } catch {
            stream.push({ type: "error", reason: "error", error: assistant([], "error") });
          }
        })();
        return stream;
      },
    },
    ui: {
      notify: (text, level) => notices.push({ text, level }),
      custom: (factory, options) => {
        assert.equal(options.overlay, true);
        return new Promise((resolve) => {
          view = factory({ terminal: { rows }, requestRender() {} }, { fg: (_color, text) => text }, {}, resolve);
        });
      },
    },
  };
  btw(pi);
  handlers.get("session_start")({}, ctx);
  function capture(messages = initial) {
    handlers.get("context_with_system")({ messages: structuredClone(messages) }, ctx);
    handlers.get("before_provider_request")({ payload: generatedPayload({ messages: convertToLlm(messages) }) }, ctx);
  }
  capture();
  return {
    pi, ctx, manager, handlers, notices, dispatched, capture,
    get view() { return view; }, get options() { return lastOptions; }, get context() { return lastContext; },
    command: (args) => commands.get("btw").handler(args, ctx),
    close: async () => { view?.handleInput("\x1b"); await flush(); },
    approve: async () => {
      view.handleInput("\x1b[F"); view.render(100);
      view.handleInput("\r"); await flush();
      view.handleInput("\x1b[H");
    },
    text: (width = 100) => view.render(width).join("\n"),
  };
}

test("parses full history, bare --last, explicit N, and -1 alias", () => {
  assert.deepEqual(parseBtwArgs("What changed?"), { question: "What changed?", last: undefined });
  for (const args of ["--last What changed?", "--last 1 What changed?", "--last -1 What changed?"]) assert.deepEqual(parseBtwArgs(args), { question: "What changed?", last: 1 });
  assert.deepEqual(parseBtwArgs("--last 3 Why?"), { question: "Why?", last: 3 });
  assert.deepEqual(parseBtwArgs("--last -- 42 is what?"), { question: "42 is what?", last: 1 });
  for (const args of ["", "--last", "--last 0 Why?", "--last -2 Why?", "--last 9007199254740992 Why?", "--compact Why?", "--wat Why?"]) assert.throws(() => parseBtwArgs(args));
});

test("last N counts real requests, keeps prompt deltas, and excludes older summaries", () => {
  const injected = { role: "custom", customType: "advisory", content: "Injected", timestamp: 2 };
  const messages = [system(), user("Old request"), assistant(), { role: "system", content: "New tools", timestamp: 2 }, { role: "compactionSummary", summary: "Old summary", timestamp: 2 }, user("Latest request"), injected, assistant()];
  const before = structuredClone(messages);
  const selected = selectBtwMessages(messages, 1);
  assert.equal(selected.filter((message) => message.role === "user").length, 1);
  assert.equal(selected.filter((message) => message.role === "system").length, 2);
  assert.ok(selected.some((message) => message.role === "custom"));
  assert.ok(!selected.some((message) => message.role === "compactionSummary"));
  assert.deepEqual(selectBtwMessages(messages, 10), messages);
  selected[0].content = "changed";
  assert.deepEqual(messages, before);
  assert.throws(() => selectBtwMessages([system()], 1));
});

test("removes unmatched parallel tool calls/results without mutating the source", () => {
  const messages = [system(), user("Task"), assistant([call("complete"), call("pending")], "toolUse"), result("complete"), result("orphan")];
  const before = structuredClone(messages);
  const clean = completeToolPairs(messages);
  assert.equal(clean.omitted, 2);
  assert.deepEqual(clean.messages[2].content, [call("complete")]);
  assert.equal(clean.messages.length, 4);
  assert.deepEqual(messages, before);
});

test("preserves cache/routing controls and tools without mutating main payload", () => {
  const baseline = { model: "test-model", instructions: "Same", tools: [{ name: "read" }], input: [{ role: "user", content: "Main" }], reasoning: { effort: "high" }, prompt_cache_key: "main-key", provider: { order: ["openai"], allow_fallbacks: false }, session_id: "main-session" };
  const before = structuredClone(baseline);
  const generated = { ...baseline, input: [...baseline.input, { role: "user", content: "Side" }], reasoning: { effort: "low" }, previous_response_id: "parent-response", conversation: "parent", tool_choice: "auto" };
  const payload = prepareBtwPayload(generated, baseline, model);
  assert.equal(prefixMatches(baseline, payload), true);
  assert.deepEqual(payload.tools, baseline.tools);
  assert.deepEqual(payload.provider, baseline.provider);
  assert.equal(payload.tool_choice, "none");
  assert.equal(payload.max_output_tokens, 2048);
  assert.ok(!("previous_response_id" in payload));
  assert.ok(!("conversation" in payload));
  assert.deepEqual(baseline, before);
  assert.equal(prefixMatches(baseline, { ...payload, input: [{ role: "user", content: "Changed" }] }), false);
  assert.equal(prefixMatches(baseline, { ...payload, tools: [] }), false);
});

test("provider-specific output caps do not invent a Codex cap", () => {
  assert.equal(prepareBtwPayload({ max_completion_tokens: 9999 }, undefined, { ...model, api: "openai-completions" }).max_completion_tokens, 2048);
  const anthropic = prepareBtwPayload({ thinking: { type: "enabled", budget_tokens: 8000 } }, undefined, { ...model, api: "anthropic-messages" });
  assert.deepEqual(anthropic.tool_choice, { type: "none" });
  assert.equal(anthropic.max_tokens, 2048);
  assert.equal(anthropic.thinking.budget_tokens, 2047);
  assert.ok(!("max_output_tokens" in prepareBtwPayload({}, undefined, { ...model, api: "openai-codex-responses" })));
});

test("uncached estimates include higher tiers/write rates; unknown prices fail closed", () => {
  const low = estimateBtwCost({ messages: ["hello"] }, model, false);
  const high = estimateBtwCost({ messages: ["hello"] }, { ...model, cost: { ...model.cost, tiers: [{ inputTokensAbove: 1, input: 10, output: 20, cacheRead: 1, cacheWrite: 25 }] } }, false);
  assert.ok(high.cost > low.cost);
  assert.equal(estimateBtwCost({}, { ...model, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }, false).cost, undefined);
  assert.equal(estimateBtwCost({}, model, true).subscription, true);
  const budget = new BtwBudget();
  budget.reserve(0.2, 0.3, 0.4);
  assert.throws(() => budget.reserve(0.25, 0.3, 0.4), /exceeds/);
  assert.throws(() => budget.reserve(undefined, 1, 5), /Cannot estimate/);
  assert.equal(budget.reserved, 0.2);
  assert.equal(positiveBudget(undefined, 1), 1);
  for (const value of ["0", "-1", "Infinity", "invalid"]) assert.throws(() => positiveBudget(value, 1));
});

test("receipt does not confuse normalized uncached input with total input", () => {
  assert.match(usageReceipt(assistant(), true, false), /100 input · 90 cached/);
  assert.match(usageReceipt(assistant(), true, false), /catalog estimate/);
  assert.match(usageReceipt(assistant(), false, false), /Usage unknown/);
  assert.match(usageReceipt(assistant(), true, true), /quota impact unknown/);
});

test("command returns while main is busy; approval and accounting never alter main model context", async () => {
  const h = harness({ idle: false });
  const initialMessages = h.manager.getBranch().filter((entry) => entry.type === "message");
  const originalPayload = structuredClone(h.manager.getBranch());
  h.manager.appendMessage(assistant([{ type: "text", text: "Finalized main output" }]));
  await h.command("Why this approach?");
  await flush();
  assert.equal(h.dispatched.length, 0);
  assert.match(h.text(), /partial exchange/);
  assert.match(h.text(), /approve|approval/);
  assert.ok(h.context.messages.some((message) => message.role === "assistant" && message.content[0].text === "Finalized main output"));
  assert.equal(h.options.transport, "sse");
  assert.equal(h.options.sessionId, h.manager.getSessionId());
  assert.equal(h.options.toolChoice, "none");
  assert.equal(h.options.maxRetries, 0);
  assert.notEqual(h.options.signal, h.ctx.signal);
  await h.approve();
  assert.equal(h.dispatched.length, 1);
  assert.match(h.text(), /90 cached/);
  assert.match(h.text(), /Answer/);
  const actualMessages = h.manager.getBranch().filter((entry) => entry.type === "message");
  assert.deepEqual(actualMessages.slice(0, initialMessages.length), initialMessages);
  assert.equal(actualMessages.length, initialMessages.length + 1);
  assert.deepEqual(originalPayload, initialMessages);
  const metadata = h.manager.getEntries().filter((entry) => entry.type === "custom");
  assert.deepEqual(metadata.map((entry) => entry.customType), ["btw-request", "btw-usage"]);
  assert.doesNotMatch(JSON.stringify(metadata), /Why this approach|Finalized main output|Answer/);
  await h.close();
});

test("last-only snapshot has no older conversation and marks omitted in-flight calls", async () => {
  const messages = [system(), user("Old request"), assistant(), user("Latest request")];
  const h = harness({ initial: messages, idle: false });
  h.manager.appendMessage(assistant([call("pending")], "toolUse"));
  await h.command("--last Why?");
  await flush();
  assert.ok(!h.context.messages.some((message) => message.content === "Old request"));
  assert.match(h.text(), /last 1 exchange/);
  assert.match(h.text(), /1 unmatched/);
  assert.match(h.text(), /Assume an uncached/);
  await h.close();
  assert.equal(h.dispatched.length, 0);
});

test("Escape before approval costs nothing and releases the single-operation guard", async () => {
  const h = harness();
  await h.command("First?"); await flush();
  await h.command("Second?");
  assert.match(h.notices.at(-1).text, /already open/);
  await h.close();
  assert.equal(h.dispatched.length, 0);
  assert.equal(h.manager.getEntries().filter((entry) => entry.type === "custom").length, 0);
  await h.command("Second?"); await flush();
  assert.match(h.text(), /Second/);
  await h.close();
});

test("Escape after approval cancels only the side controller and retains the estimate reservation", async () => {
  const h = harness({ hold: true });
  await h.command("Question?"); await flush(); await h.approve();
  assert.equal(h.options.signal.aborted, false);
  await h.close();
  assert.equal(h.options.signal.aborted, true);
  assert.ok(h.manager.getEntries().some((entry) => entry.type === "custom" && entry.customType === "btw-request"));
});

test("request and session budget gates prevent dispatch, including after reload", async () => {
  const h = harness({ flags: { "btw-max-cost": "0.00001" } });
  await h.command("Question?"); await flush(); await h.approve();
  assert.equal(h.dispatched.length, 0);
  assert.match(h.text(), /exceeds the BTW budget/);
  await h.close();
  const reload = harness({ flags: { "btw-session-budget": "0.01" } });
  reload.manager.appendCustomEntry("btw-request", { reservedEstimate: 0.009 });
  reload.handlers.get("session_start")({}, reload.ctx);
  reload.capture();
  await reload.command("Question?"); await flush(); await reload.approve();
  assert.equal(reload.dispatched.length, 0);
  assert.match(reload.text(), /already\s+reserved/);
  await reload.close();
});

test("unknown usage and subscription impact are explicit; provider errors do not leak prompts", async () => {
  for (const nativeUsage of [false, { usage: {} }, { usage: { input_tokens: -1 } }, { usage: { input_tokens: 0 } }, { usage: { output_tokens: 0 } }, { usage: { prompt_tokens: 0 } }, { usage: { input_tokens: 0, output_tokens: -1 } }]) {
    const h = harness({ nativeUsage });
    await h.command("Question?"); await flush(); await h.approve();
    assert.match(h.text(), /Usage unknown/);
    await h.close();
  }
  const codex = harness({ chosenModel: { ...model, provider: "openai-codex", api: "openai-codex-responses" } });
  await codex.command("Question?"); await flush();
  assert.match(codex.text(), /quota impact is unknown/);
  assert.match(codex.text(), /does not expose/);
  await codex.close();
  const failed = harness({ failure: true });
  await failed.command("Question?"); await flush(); await failed.approve();
  assert.doesNotMatch(failed.text(), /PRIVATE REQUEST TEXT/);
  assert.match(failed.text(), /failed/);
  await failed.close();
});

test("session replacement closes the overlay and ignores late responses", async () => {
  const h = harness({ hold: true });
  await h.command("Question?"); await flush(); await h.approve();
  h.handlers.get("session_shutdown")({}, h.ctx);
  await flush();
  assert.equal(h.options.signal.aborted, true);
  assert.equal(h.manager.getEntries().filter((entry) => entry.type === "custom" && entry.customType === "btw-usage").length, 0);
});

test("OAuth-backed OpenRouter remains API-billed and cannot bypass budget gates", async () => {
  const h = harness({ oauth: true, chosenModel: { ...model, provider: "openrouter", api: "openai-completions" }, flags: { "btw-max-cost": "0.00001" } });
  await h.command("Question?"); await flush();
  assert.match(h.text(), /uncached catalog estimate/);
  assert.doesNotMatch(h.text(), /Subscription quota/);
  await h.approve();
  assert.equal(h.dispatched.length, 0);
  assert.match(h.text(), /exceeds the BTW budget/);
  await h.close();
  const subscribed = harness({ oauth: true, subscription: true });
  await subscribed.command("Question?"); await flush();
  assert.match(subscribed.text(), /Subscription quota impact is unknown/);
  await subscribed.close();
});

test("tree navigation invalidates late receipts and does not move the selected leaf", async () => {
  const h = harness({ hold: true });
  const destination = h.manager.getLeafId();
  await h.command("Question?"); await flush(); await h.approve();
  h.manager.branch(destination);
  h.handlers.get("session_tree")({}, h.ctx);
  await flush();
  assert.equal(h.options.signal.aborted, true);
  assert.equal(h.manager.getLeafId(), destination);
  assert.equal(h.manager.getEntries().filter((entry) => entry.type === "custom" && entry.customType === "btw-usage").length, 0);
});

test("approval requires reaching the disclosure end, even with a long question in a short terminal", async () => {
  const h = harness({ rows: 16 });
  await h.command("Question " + "long question text ".repeat(2000)); await flush();
  const firstPage = h.text();
  assert.match(firstPage, /uncached catalog estimate/);
  assert.match(firstPage, /Scroll to end/);
  h.view.handleInput("\r"); await flush();
  assert.equal(h.dispatched.length, 0);
  await h.approve();
  assert.equal(h.dispatched.length, 1);
  await h.close();
});

test("overlay handles narrow widths, Unicode, scrolling and parent-control keys", async () => {
  const h = harness();
  await h.command("--last ¿Por qué? 日本語"); await flush();
  for (const width of [1, 12, 40, 100]) {
    for (const line of h.view.render(width)) assert.ok(visibleWidth(line) <= width, `${visibleWidth(line)} > ${width}`);
  }
  h.view.handleInput("j"); h.view.handleInput("k");
  h.view.invalidate();
  h.view.handleInput("\x03"); await flush();
  assert.equal(h.dispatched.length, 0);
});
