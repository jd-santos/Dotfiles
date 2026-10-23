import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Use the installed Pi runtime for the theme and width measurement.
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
const file = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const rules = await jiti.import(file("../lib/cache-rules.ts"));
const tracker = await jiti.import(file("../cache-tracker.ts"));
const { SHELF_SECTION } = await jiti.import(file("../lib/shelf.ts"));
const { Theme } = await import(join(piDir, "dist/index.js"));
const { visibleWidth } = await import(tuiPath);

function makeTheme() {
	const json = JSON.parse(readFileSync(file("../../themes/catppuccin-mocha.json"), "utf8"));
	const resolve = (value: string): string => (json.vars[value] ? resolve(json.vars[value]) : value);
	const colors = Object.fromEntries(
		Object.entries(json.colors).map(([key, value]) => [key, resolve(value as string)]),
	);
	return new Theme(colors, colors, "truecolor");
}
const plain = (text: string) => text.replace(/\x1b\[[\d;:]*m/g, "");

const sonnet = {
	provider: "anthropic",
	id: "claude-sonnet-5",
	promptCache: { short: 300, long: 3600 },
	cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};
const luna = {
	provider: "openai-codex",
	id: "gpt-6-luna",
	cost: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125, tiers: [{ inputTokensAbove: 272000, input: 0.2, output: 0.75, cacheRead: 0.02, cacheWrite: 0.25 }] },
};
const models: Record<string, any> = {
	"anthropic/claude-sonnet-5": sonnet,
	"openai-codex/gpt-6-luna": luna,
};
const ruleFor = (provider: string, id: string) =>
	rules.cacheRuleFor(provider, id, { model: models[`${provider}/${id}`] });

const T0 = Date.parse("2026-10-23T12:00:00Z");
function turn(at: number, usage: { input: number; cacheRead?: number; cacheWrite?: number }, model = sonnet) {
	const cacheRead = usage.cacheRead ?? 0;
	const cacheWrite = usage.cacheWrite ?? 0;
	const rate = (price: number, tokens: number) => (price * tokens) / 1_000_000;
	return {
		type: "message",
		timestamp: new Date(at).toISOString(),
		message: {
			role: "assistant",
			provider: model.provider,
			model: model.id,
			timestamp: at,
			stopReason: "stop",
			usage: {
				input: usage.input,
				output: 100,
				cacheRead,
				cacheWrite,
				totalTokens: usage.input + cacheRead + cacheWrite + 100,
				cost: {
					input: rate(model.cost.input, usage.input),
					output: 0,
					cacheRead: rate(model.cost.cacheRead, cacheRead),
					cacheWrite: rate(model.cost.cacheWrite, cacheWrite),
					total: 0,
				},
			},
		},
	};
}

test("rule lookup layers runtime metadata, extra layers, the static table, then unknown", () => {
	const anthropic = rules.cacheRuleFor("anthropic", "claude-sonnet-5", { model: sonnet });
	assert.equal(anthropic.ttlSeconds, 300);
	assert.equal(anthropic.extendedTtlSeconds, 3600);
	assert.equal(anthropic.sources.ttlSeconds, "pi-runtime: model metadata");
	assert.ok(Math.abs(anthropic.readMultiplier - 0.1) < 1e-9);
	assert.equal(anthropic.writeMultiplier, 1.25);
	assert.equal(anthropic.mode, "explicit");
	assert.match(anthropic.sources.mode, /anthropic-messages/);
	assert.equal(anthropic.extendedWriteMultiplier, 2);

	// An extra layer fills gaps but cannot override runtime data.
	const layered = rules.cacheRuleFor("openai-codex", "gpt-6-luna", {
		model: luna,
		layers: [() => ({ ttlSeconds: 600, readMultiplier: 0.5, source: "fixture" })],
	});
	assert.equal(layered.ttlSeconds, 600);
	assert.equal(layered.sources.ttlSeconds, "fixture");
	assert.ok(Math.abs(layered.readMultiplier - 0.1) < 1e-9);
	assert.equal(layered.mode, "automatic");

	// A throwing layer is skipped.
	const safe = rules.cacheRuleFor("openai-codex", "gpt-6-luna", { layers: [() => { throw new Error("offline"); }] });
	assert.equal(safe.ttlSeconds, undefined);

	// Pattern rows: anthropic/* on OpenRouter is explicit, other ids unknown.
	assert.equal(rules.cacheRuleFor("openrouter", "anthropic/claude-sonnet-5").mode, "explicit");
	const glm = rules.cacheRuleFor("openrouter", "z-ai/glm-5.3-flash", {
		model: { cost: { input: 0.15, cacheRead: 0.03, cacheWrite: 0 } },
	});
	assert.equal(glm.mode, "unknown");
	assert.equal(glm.ttlSeconds, undefined);
	assert.equal(glm.writeMultiplier, 1, "zero write rate bills misses as input, as Pi's warmer assumes");

	const nothing = rules.cacheRuleFor("mystery", "model");
	assert.equal(nothing.mode, "unknown");
	assert.deepEqual(nothing.sources, {});
	assert.equal(rules.ttlSecondsFor(anthropic, "long"), 3600);
	assert.equal(rules.ttlSecondsFor(anthropic, "none"), undefined);
	assert.equal(rules.defaultRetention({ PI_CACHE_RETENTION: "long" }), "long");
	assert.equal(rules.defaultRetention({}), "short");
	assert.equal(rules.inputPriceFor(luna.cost, 300000), 0.2);
	assert.equal(rules.inputPriceFor(luna.cost, 1000), 0.1);
});

test("reuse math per turn and per session, with cost against uncached", () => {
	const state = tracker.analyzeEntries(
		[
			turn(T0, { input: 500, cacheWrite: 9500 }),
			turn(T0 + 60_000, { input: 200, cacheRead: 9500, cacheWrite: 300 }),
		],
		{ ruleFor },
	);
	assert.equal(state.turns.length, 2);
	assert.equal(state.turns[0].reuse, 0);
	assert.equal(state.turns[1].reuse, 0.95);
	const stats = state.models.get("anthropic/claude-sonnet-5");
	assert.equal(stats.turns, 2);
	assert.equal(tracker.reuseRate(stats), 9500 / 20000);
	assert.equal(stats.lastRequestAt, T0 + 60_000);
	const uncached = (20000 * 2) / 1_000_000;
	assert.ok(Math.abs(stats.uncachedCost - uncached) < 1e-12);
	const totals = tracker.sessionTotals(state);
	assert.ok(totals.inputCost < totals.uncachedCost);
	assert.equal(state.rewrites.length, 0);
});

test("warm and cold transitions follow the rule's TTL on an injected clock", () => {
	const state = tracker.analyzeEntries([turn(T0, { input: 500, cacheWrite: 9500 })], { ruleFor });
	const stats = state.models.get("anthropic/claude-sonnet-5");
	const rule = ruleFor("anthropic", "claude-sonnet-5");
	const warm = tracker.cacheClock(stats, rule, "short", T0 + 108_000);
	assert.equal(warm.state, "warm");
	assert.equal(tracker.formatDuration(warm.remainingMs), "3:12");
	assert.equal(tracker.cacheClock(stats, rule, "short", T0 + 300_001).state, "cold");
	assert.equal(tracker.cacheClock(stats, rule, "long", T0 + 300_001).state, "warm");

	const theme = makeTheme();
	assert.equal(plain(tracker.formatStatus(theme, state, stats.key, warm)), "0% warm 3:12");

	// Unknown TTL reports idle time, never a guessed countdown.
	const codex = tracker.analyzeEntries([turn(T0, { input: 1000, cacheRead: 9000 }, luna)], { ruleFor });
	const codexStats = codex.models.get("openai-codex/gpt-6-luna");
	const unknown = tracker.cacheClock(codexStats, ruleFor("openai-codex", "gpt-6-luna"), "short", T0 + 192_000);
	assert.equal(unknown.state, "unknown");
	assert.equal(plain(tracker.formatStatus(theme, codex, codexStats.key, unknown)), "90% idle 3m");
	assert.equal(plain(tracker.headline(theme, codex, codexStats.key, unknown)), "ttl unknown");

	// Pi's cache warmer refreshes the entry and restarts the countdown.
	const warmed = tracker.analyzeEntries(
		[
			turn(T0, { input: 500, cacheWrite: 9500 }),
			{
				type: "usage",
				kind: "cache_warm",
				provider: "anthropic",
				model: "claude-sonnet-5",
				timestamp: new Date(T0 + 270_000).toISOString(),
				usage: { input: 0, output: 1, cacheRead: 10000, cacheWrite: 0, cost: { total: 0.002 } },
			},
		],
		{ ruleFor },
	);
	const warmedStats = warmed.models.get("anthropic/claude-sonnet-5");
	assert.equal(warmed.warms.length, 1);
	assert.equal(tracker.cacheClock(warmedStats, rule, "short", T0 + 400_000).state, "warm");
});

test("rewrites are near-total misses after a warm turn, with a likely cause", () => {
	const base = [turn(T0, { input: 500, cacheWrite: 9500 })];
	const cases: Array<[string, any[]]> = [
		["idle past ttl", [turn(T0 + 600_000, { input: 500, cacheWrite: 10000 })]],
		["model switch", [turn(T0 + 30_000, { input: 10500 }, luna)]],
		[
			"thinking change",
			[
				{ type: "thinking_level_change", thinkingLevel: "high" },
				turn(T0 + 30_000, { input: 500, cacheWrite: 10000 }),
			],
		],
		["compaction", [{ type: "compaction" }, turn(T0 + 30_000, { input: 3000 })]],
		["unknown", [turn(T0 + 30_000, { input: 500, cacheWrite: 10000 })]],
	];
	for (const [cause, rest] of cases) {
		const state = tracker.analyzeEntries([...base, ...rest], { ruleFor });
		assert.equal(state.rewrites.length, 1, cause);
		assert.equal(state.rewrites[0].cause, cause);
	}

	// A normal hit, a small miss under the noise floor, and a cold first turn are not rewrites.
	const quiet = tracker.analyzeEntries(
		[
			turn(T0, { input: 10000 }, luna),
			turn(T0 + 10_000, { input: 11000 }, luna),
			turn(T0 + 20_000, { input: 200, cacheWrite: 800 }),
			turn(T0 + 30_000, { input: 1000, cacheWrite: 100 }),
			turn(T0 + 40_000, { input: 300, cacheRead: 1100 }),
		],
		{ ruleFor },
	);
	assert.equal(quiet.rewrites.length, 0);
});

test("models are tracked separately when a session switches", () => {
	const state = tracker.analyzeEntries(
		[
			turn(T0, { input: 500, cacheWrite: 9500 }),
			turn(T0 + 10_000, { input: 100, cacheRead: 9900 }),
			turn(T0 + 20_000, { input: 10000 }, luna),
			turn(T0 + 30_000, { input: 1000, cacheRead: 9000 }, luna),
		],
		{ ruleFor },
	);
	assert.deepEqual([...state.models.keys()], ["anthropic/claude-sonnet-5", "openai-codex/gpt-6-luna"]);
	assert.equal(state.models.get("anthropic/claude-sonnet-5").turns, 2);
	assert.equal(state.models.get("openai-codex/gpt-6-luna").cacheRead, 9000);
	assert.equal(state.models.get("openai-codex/gpt-6-luna").rewrites.length, 1);
	assert.equal(state.models.get("anthropic/claude-sonnet-5").rewrites.length, 0);

	// A selected model with no turns has nothing cached.
	const theme = makeTheme();
	const clock = tracker.cacheClock(undefined, undefined, "short", T0);
	assert.match(plain(tracker.formatStatus(theme, state, "openrouter/z-ai/glm-5.3-flash", clock)), /cold$/);
});

test("the shelf section stays within width and lists every model", () => {
	const theme = makeTheme();
	const state = tracker.analyzeEntries(
		[
			turn(T0, { input: 500, cacheWrite: 9500 }),
			turn(T0 + 600_000, { input: 500, cacheWrite: 10000 }),
			turn(T0 + 610_000, { input: 10000 }, luna),
		],
		{ ruleFor },
	);
	for (const width of [0, 1, 8, 20, 40, 60, 80, 120]) {
		const lines = tracker.renderSection(width, theme, {
			state,
			currentKey: "openai-codex/gpt-6-luna",
			ruleFor,
			retention: "short",
			now: T0 + 700_000,
			warmerDecision: { at: T0, action: "stop" },
		});
		if (width === 0) assert.deepEqual(lines, []);
		for (const line of lines) assert.ok(visibleWidth(line) <= width, `${width}: ${plain(line)}`);
		if (width >= 80) {
			const text = lines.map(plain).join("\n");
			assert.match(text, /anthropic\/claude-sonnet-5/);
			assert.match(text, /openai-codex\/gpt-6-luna/);
			assert.match(text, /rewrite .* idle past ttl/);
			assert.match(text, /ttl unknown/);
			assert.match(text, /pi warmer not run · last decision stop/);
		}
	}
	const empty = tracker.renderSection(40, theme, { state: tracker.analyzeEntries([], { ruleFor }), ruleFor, retention: "short", now: T0 });
	assert.match(plain(empty[0]), /No model turns yet/);
});

test("the extension registers a cache section and status, and cleans up on shutdown", async () => {
	const theme = makeTheme();
	const handlers = new Map<string, Array<(event: any, ctx: any) => any>>();
	const listeners = new Map<string, Set<(value: any) => void>>();
	const sections = new Map<string, any>();
	const statuses = new Map<string, string | undefined>();
	const entries: any[] = [turn(Date.now() - 60_000, { input: 500, cacheWrite: 9500 })];
	const pi = {
		events: {
			on(name: string, callback: (value: any) => void) {
				if (!listeners.has(name)) listeners.set(name, new Set());
				listeners.get(name)!.add(callback);
				return () => listeners.get(name)!.delete(callback);
			},
			emit(name: string, value: any) {
				if (name === SHELF_SECTION) {
					if (value.remove) sections.delete(value.id);
					else sections.set(value.section.id, value.section);
				}
				for (const callback of listeners.get(name) ?? []) callback(value);
			},
		},
		on(name: string, callback: any) {
			handlers.set(name, [...(handlers.get(name) ?? []), callback]);
		},
	};
	const ctx = {
		hasUI: true,
		model: sonnet,
		modelRegistry: { find: (provider: string, id: string) => models[`${provider}/${id}`] },
		sessionManager: { getBranch: () => entries },
		ui: {
			theme,
			setStatus(name: string, text: string | undefined) {
				statuses.set(name, text);
			},
		},
	};
	const emit = async (name: string, event = {}) => {
		for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
	};
	// The extension reads retention from the environment once, at load.
	const saved = process.env.PI_CACHE_RETENTION;
	delete process.env.PI_CACHE_RETENTION;
	try {
		tracker.default(pi);
	} finally {
		if (saved !== undefined) process.env.PI_CACHE_RETENTION = saved;
	}
	assert.equal(sections.size, 0, "nothing registers in the factory");
	await emit("session_start", { reason: "startup" });
	const section = sections.get("cache");
	assert.equal(section.order, 40);
	assert.match(plain(statuses.get("cache")!), /^0% warm [34]:\d\d$/);
	assert.match(plain(section.headline(theme)), /^warm /);

	// message_end arrives before persistence; the pending message is still counted.
	await emit("message_end", { message: turn(Date.now(), { input: 100, cacheRead: 9900 }).message });
	assert.match(plain(statuses.get("cache")!), /^50% warm [45]:\d\d$/);

	await emit("session_shutdown");
	assert.equal(sections.size, 0);
	assert.equal(statuses.get("cache"), undefined);
});
