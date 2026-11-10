import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Use the installed Pi runtime for the theme and width helpers.
const piDir =
	process.env.PI_TEST_PACKAGE_DIR ??
	join(
		execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(),
		"@earendil-works/pi-coding-agent",
	);
const require = createRequire(join(piDir, "package.json"));
const { createJiti } = require("jiti");
const tuiPath = require.resolve("@earendil-works/pi-tui");
const jiti = createJiti(import.meta.url, {
	fsCache: false,
	alias: {
		"@earendil-works/pi-coding-agent": join(piDir, "dist/index.js"),
		"@earendil-works/pi-tui": tuiPath,
	},
});
const file = (relative: string) =>
	fileURLToPath(new URL(relative, import.meta.url));
const shelfModule = await jiti.import(file("../subagent-shelf.ts"));
const shelfContract = await jiti.import(file("../lib/shelf.ts"));
const layout = await jiti.import(file("../lib/shell-layout.ts"));
const { Theme } = await import(join(piDir, "dist/index.js"));
const { visibleWidth } = await import(tuiPath);

const START = Date.parse("2026-10-23T12:00:00Z");

function makeTheme(name = "catppuccin-mocha") {
	const json = JSON.parse(
		readFileSync(file(`../../themes/${name}.json`), "utf8"),
	);
	const resolve = (value: string) =>
		json.vars[value] ? resolve(json.vars[value]) : value;
	const colors = Object.fromEntries(
		Object.entries(json.colors).map(([key, value]) => [
			key,
			resolve(value as string),
		]),
	);
	return new Theme(colors, colors, "truecolor");
}

// A fake pi-subagents owner that answers the documented v1 RPC from `fleet` and `cost`.
function harness({ subagents = true } = {}) {
	const theme = makeTheme();
	const listeners = new Map<string, Set<(value: any) => void>>();
	const handlers = new Map<string, Array<(event: any, ctx: any) => void>>();
	const statuses = new Map<string, string>();
	const requests: any[] = [];
	const sections = new Map<string, any>();
	let refreshes = 0;
	const state = {
		fleet: { version: 1, entries: [] as any[], totalActive: 0, omitted: 0 },
		cost: {
			version: 1,
			parent: {},
			children: [] as any[],
			childTotal: { input: 0, output: 0, cost: 0 },
			total: {},
			unresolvedAsyncChildren: 0,
		},
	};
	const events = {
		on(name: string, callback: (value: any) => void) {
			if (!listeners.has(name)) listeners.set(name, new Set());
			listeners.get(name)!.add(callback);
			return () => listeners.get(name)!.delete(callback);
		},
		emit(name: string, value: any) {
			for (const callback of [...(listeners.get(name) ?? [])]) callback(value);
		},
	};
	const ownerListeners = () => {
		const offs = [
			events.on(shelfContract.SHELF_SECTION, (message: any) => {
				if (message.remove) sections.delete(message.id);
				else sections.set(message.section.id, message.section);
			}),
			events.on(shelfContract.SHELF_REFRESH, () => refreshes++),
		];
		if (subagents)
			offs.push(
				events.on(shelfModule.RPC_REQUEST, (request: any) => {
					requests.push(request);
					const data =
						request.method === "status"
							? { text: "", fleet: structuredClone(state.fleet) }
							: structuredClone(state.cost);
					events.emit(`${shelfModule.RPC_REPLY_PREFIX}${request.requestId}`, {
						version: 1,
						requestId: request.requestId,
						method: request.method,
						success: true,
						data,
					});
				}),
			);
		return offs;
	};
	const owners = ownerListeners();
	const pi = {
		events,
		on(name: string, callback: any) {
			handlers.set(name, [...(handlers.get(name) ?? []), callback]);
		},
	};
	const ctx = {
		hasUI: true,
		ui: {
			theme,
			setStatus(name: string, text: string | undefined) {
				if (text === undefined) statuses.delete(name);
				else statuses.set(name, text);
			},
		},
	};
	shelfModule.default(pi);
	const emit = async (name: string, event = {}) => {
		for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
		await settle();
	};
	return {
		theme,
		state,
		statuses,
		requests,
		sections,
		listeners,
		owners,
		emit,
		get refreshes() {
			return refreshes;
		},
		section: () => sections.get("agents"),
		text(width = 80) {
			return sections.get("agents").render(width, theme).map(layout.plain);
		},
		headline() {
			return layout.plain(sections.get("agents").headline(theme));
		},
		setFleet(entries: any[]) {
			state.fleet = { version: 1, entries, totalActive: entries.length, omitted: 0 };
		},
	};
}

async function settle() {
	for (let i = 0; i < 5; i++) await Promise.resolve();
}

function entry(key: string, agent: string, startedAt: number, extra = {}) {
	return {
		key,
		agent,
		model: "openrouter/deepseek/deepseek-v4.1-flash",
		startedAt,
		tokens: { input: 2000, output: 800, total: 2800 },
		...extra,
	};
}

test("registers the Agents section and reads none while idle", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: START });
	const h = harness();
	await h.emit("session_start");
	const section = h.section();
	assert.equal(section.id, "agents");
	assert.equal(section.title, "Agents");
	assert.equal(section.order, 10);
	assert.equal(h.headline(), "none");
	assert.deepEqual(h.text(), ["No subagents this session"]);
	assert.equal(h.statuses.has("agents"), false);
	await h.emit("session_shutdown");
});

test("a running subagent shows its task and elapsed time, then moves to the finished summary", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: START });
	const h = harness();
	await h.emit("session_start");

	await h.emit("tool_execution_start", {
		toolName: "subagent",
		toolCallId: "call-1",
		args: { agent: "scout", task: "Map the auth flow\nand its callers" },
	});
	// The poll tick below advances the clock one second, to 1m 12s.
	h.setFleet([entry("fleet-1", "scout", START - 71_000)]);
	t.mock.timers.tick(shelfModule.POLL_MS);
	await settle();

	assert.equal(h.headline(), "● 1 running");
	assert.equal(h.statuses.get("agents"), "● 1");
	const [row] = h.text(80);
	assert.match(row, /^● scout\s+Map the auth flow and its callers\s+2\.8k tok\s+1m 12s$/);

	t.mock.timers.tick(shelfModule.POLL_MS * 3);
	await settle();
	assert.match(h.text(80)[0], /1m 15s$/);

	// Finishing: the fleet empties and the cost report records the child.
	h.setFleet([]);
	h.state.cost.children = [{ label: "Child 1 (scout)", agent: "scout", usage: { cost: 0.0123 } }];
	h.state.cost.childTotal = { input: 12_000, output: 3_000, cost: 0.0123 };
	await h.emit("tool_execution_end", { toolName: "subagent", toolCallId: "call-1" });

	assert.equal(h.headline(), "none");
	assert.equal(h.statuses.has("agents"), false);
	assert.deepEqual(h.text(80), ["finished 1 · $0.012 · 15k tok"]);

	// The timer stops once idle: no more status requests on later ticks.
	const before = h.requests.filter((r) => r.method === "status").length;
	t.mock.timers.tick(shelfModule.POLL_MS * 5);
	await settle();
	assert.equal(h.requests.filter((r) => r.method === "status").length, before);
	await h.emit("session_shutdown");
});

test("async runs, parallel tasks, overflow, and unresolved cost are reported", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: START });
	const h = harness();
	await h.emit("session_start");
	await h.emit("tool_execution_start", {
		toolName: "subagent",
		toolCallId: "call-2",
		args: {
			tasks: [
				{ agent: "reviewer", task: "Check correctness" },
				{ agent: "reviewer", task: "Check design" },
			],
		},
	});
	h.setFleet([
		entry("fleet-1", "reviewer", START - 5_000),
		entry("fleet-2", "reviewer", START - 4_000),
		...Array.from({ length: 6 }, (_, i) => entry(`fleet-${i + 3}`, "worker", START - 1_000)),
	]);
	h.state.fleet.totalActive = 10;
	await h.emit("tool_execution_end", { toolName: "subagent", toolCallId: "call-2" });

	const lines = h.text(80);
	assert.equal(h.headline(), "● 10 running");
	assert.equal(h.statuses.get("agents"), "● 10");
	assert.match(lines[0], /reviewer\s+Check correctness/);
	assert.match(lines[1], /reviewer\s+Check design/);
	assert.match(lines[2], /worker\s+deepseek-v4\.1-flash/);
	assert.equal(lines[6], "+4 more");

	// The async run keeps the timer alive after the tool call ended.
	h.setFleet([]);
	h.state.cost.children = [{}, {}];
	h.state.cost.childTotal = { input: 0, output: 0, cost: 0.5 };
	h.state.cost.unresolvedAsyncChildren = 1;
	h.listeners.get(shelfModule.ASYNC_COMPLETE)!.forEach((callback) => callback({}));
	t.mock.timers.tick(shelfModule.POLL_MS);
	await settle();
	assert.deepEqual(h.text(80), ["finished 2 · ≥$0.500"]);
	assert.equal(h.statuses.has("agents"), false);
	await h.emit("session_shutdown");
});

test("rows stay within the drawer width for long and wide text", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: START });
	const h = harness();
	await h.emit("session_start");
	await h.emit("tool_execution_start", {
		toolName: "subagent",
		toolCallId: "call-3",
		args: { agent: "a-very-long-agent-name-修正", task: "審查認証フローとその呼び出し元を確認する 👩‍💻 ".repeat(8) },
	});
	h.setFleet([entry("fleet-1", "a-very-long-agent-name-修正", START - 3_725_000)]);
	t.mock.timers.tick(shelfModule.POLL_MS);
	await settle();
	h.state.cost.children = [{}];
	h.state.cost.childTotal = { input: 1, output: 1, cost: 1.25 };
	await h.emit("agent_settled");
	for (const width of [0, 1, 4, 8, 12, 20, 30, 40, 52, 60, 80, 120]) {
		const lines = h.section().render(width, h.theme);
		for (const line of lines) assert.ok(visibleWidth(line) <= width, `width ${width}: ${line}`);
		assert.ok(visibleWidth(h.section().headline(h.theme)) <= 20);
	}
	assert.match(h.text(120)[0], /1h 02m$/);
	await h.emit("session_shutdown");
});

test("without pi-subagents the section says so instead of guessing", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: START });
	const h = harness({ subagents: false });
	await h.emit("session_start");
	t.mock.timers.tick(shelfModule.RPC_TIMEOUT_MS);
	await settle();
	assert.equal(h.headline(), "unavailable");
	assert.deepEqual(h.text(), ["pi-subagents is not responding"]);
	await h.emit("session_shutdown");
});

test("shutdown removes the section, clears the status, and stops listening", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: START });
	const h = harness();
	await h.emit("session_start");
	await h.emit("tool_execution_start", {
		toolName: "subagent",
		toolCallId: "call-4",
		args: { agent: "worker", task: "Implement" },
	});
	h.setFleet([entry("fleet-1", "worker", START)]);
	t.mock.timers.tick(shelfModule.POLL_MS);
	await settle();
	assert.equal(h.statuses.get("agents"), "● 1");

	await h.emit("session_shutdown");
	assert.equal(h.sections.has("agents"), false);
	assert.equal(h.statuses.has("agents"), false);
	const ownerCount = h.owners.length;
	const remaining = [...h.listeners.values()].reduce((sum, set) => sum + set.size, 0);
	assert.equal(remaining, ownerCount);

	const requests = h.requests.length;
	t.mock.timers.tick(shelfModule.POLL_MS * 10);
	await settle();
	assert.equal(h.requests.length, requests);

	// A fresh session starts clean.
	h.setFleet([]);
	await h.emit("session_start");
	assert.equal(h.headline(), "none");
	await h.emit("session_shutdown");
});

test("helpers parse tool arguments and format elapsed time", () => {
	assert.deepEqual(shelfModule.tasksFromArgs({ action: "status", agent: "x", task: "y" }), []);
	assert.deepEqual(shelfModule.tasksFromArgs({ script: "return runs.run(...)" }), []);
	assert.deepEqual(
		shelfModule.tasksFromArgs({ chain: [{ agent: "scout", task: "a" }, { parallel: [{ agent: "worker", task: "b" }] }] }),
		[
			{ agent: "scout", task: "a" },
			{ agent: "worker", task: "b" },
		],
	);
	assert.equal(shelfModule.formatElapsed(9_400), "9s");
	assert.equal(shelfModule.formatElapsed(72_000), "1m 12s");
	assert.equal(shelfModule.formatElapsed(3_725_000), "1h 02m");
});
