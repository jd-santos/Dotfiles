import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Same runtime setup as shell.test.ts: the installed Pi, its theme and renderer.
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
const layout = await jiti.import(file("../lib/shell-layout.ts"));
const contract = await jiti.import(file("../lib/shelf.ts"));
const allowance = await jiti.import(file("../lib/codex-allowance.ts"));
const footerModule = await jiti.import(file("../footer.ts"));
const shelfModule = await jiti.import(file("../shelf.ts"));
const limitsModule = await jiti.import(file("../codex-limits.ts"));
const { Theme } = await import(join(piDir, "dist/index.js"));
const { visibleWidth } = await import(tuiPath);

function makeTheme(name = "catppuccin-mocha") {
	const json = JSON.parse(readFileSync(file(`../../themes/${name}.json`), "utf8"));
	const resolve = (value: string) => (json.vars[value] ? resolve(json.vars[value]) : value);
	const colors = Object.fromEntries(
		Object.entries(json.colors).map(([key, value]) => [key, resolve(value as string)]),
	);
	return new Theme(colors, colors, "truecolor");
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

function harness(
	factories: Array<(pi: any) => void> = [footerModule.default, shelfModule.default],
	{ provider = "openrouter", rows = 24 } = {},
) {
	const theme = makeTheme();
	const listeners = new Map<string, Set<(value: any) => void>>();
	const handlers = new Map<string, Array<(event: any, ctx: any) => any>>();
	const commands = new Map<string, any>();
	const shortcuts = new Map<string, any>();
	const statuses = new Map<string, string>([["permission-gate", "ask"]]);
	const entries: any[] = [];
	const notices: Array<{ text: string; level: string }> = [];
	const widgets = new Map<string, { component: any; placement?: string }>();
	let footer: any;
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
	const pi = {
		events,
		on(name: string, callback: any) {
			handlers.set(name, [...(handlers.get(name) ?? []), callback]);
		},
		registerCommand(name: string, command: any) {
			commands.set(name, command);
		},
		registerShortcut(key: string, options: any) {
			shortcuts.set(key, options);
		},
		registerEntryRenderer() {},
		getSessionName: () => "Build the shelf",
		appendEntry(customType: string, data: any) {
			entries.push({ type: "custom", customType, data });
		},
	};
	const tui = { requestRender() {}, terminal: { rows } };
	const data = {
		getGitBranch: () => "feat/pi-shelf",
		getExtensionStatuses: () => statuses,
		onBranchChange: () => () => {},
	};
	const ctx = {
		cwd: "/workspace/Dotfiles",
		hasUI: true,
		model: { id: "gpt-6.1-sol", provider, contextWindow: 128000 },
		getContextUsage: () => ({ tokens: 48640, percent: 38, contextWindow: 128000 }),
		sessionManager: { getBranch: () => entries },
		ui: {
			theme,
			setStatus(name: string, text: string | undefined) {
				if (text === undefined) statuses.delete(name);
				else statuses.set(name, text);
			},
			setTitle() {},
			setFooter(factory: any) {
				footer?.dispose();
				footer = factory?.(tui, theme, data);
			},
			setWidget(key: string, content: any, options?: any) {
				widgets.get(key)?.component.dispose?.();
				widgets.delete(key);
				if (content) widgets.set(key, { component: content(tui, theme), placement: options?.placement });
			},
			notify(text: string, level: string) {
				notices.push({ text, level });
			},
		},
	};
	for (const factory of factories) factory(pi);
	const emit = async (name: string, event = {}) => {
		for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
	};
	return {
		pi,
		ctx,
		theme,
		statuses,
		entries,
		notices,
		widgets,
		commands,
		shortcuts,
		listeners,
		events,
		emit,
		get footer() {
			return footer;
		},
		shelf(width = 80): string[] | undefined {
			return widgets.get("shelf")?.component.render(width);
		},
	};
}

const headings = (lines: string[]) =>
	lines.map(layout.plain).filter((line) => / ─+/.test(line)).map((line) => line.split(" ")[0] + (line.startsWith("Last turn") ? " turn" : ""));

test("the shelf starts closed and toggles from /shelf, the shortcut, the event, and the footer button", async () => {
	const h = harness();
	await h.emit("session_start");
	assert.equal(h.shelf(), undefined);
	assert.match(layout.plain(h.footer.render(100)[0]), /shelf ▸$/);

	await h.commands.get("shelf").handler("", h.ctx);
	assert.equal(h.widgets.get("shelf")?.placement, "belowEditor");
	assert.ok(h.shelf()!.length > 0);
	assert.match(layout.plain(h.footer.render(100)[0]), /shelf ▾$/);
	assert.deepEqual(h.entries.at(-1), { type: "custom", customType: "shelf-display", data: { open: true } });

	const shortcut = h.shortcuts.get(shelfModule.SHELF_SHORTCUT);
	assert.equal(shelfModule.SHELF_SHORTCUT, "alt+s");
	await shortcut.handler(h.ctx);
	assert.equal(h.shelf(), undefined);

	contract.toggleShelf(h.pi);
	assert.ok(h.shelf());
	contract.toggleShelf(h.pi, true);
	assert.ok(h.shelf(), "open: true keeps an open shelf open");
	await h.commands.get("shelf").handler("close", h.ctx);
	assert.equal(h.shelf(), undefined);

	// Footer click: the button toggles; elsewhere on the telemetry row opens.
	const click = (x: number, y = 0) =>
		h.footer.handleMouse({ type: "click", button: "left", x, y, width: 100, height: 2 });
	h.footer.render(100);
	assert.deepEqual(click(99), { handled: true });
	assert.ok(h.shelf());
	h.footer.render(100);
	assert.deepEqual(click(98), { handled: true });
	assert.equal(h.shelf(), undefined);
	assert.deepEqual(click(3), { handled: true });
	assert.ok(h.shelf());
	assert.equal(click(3), undefined, "clicking the row while open does nothing");
	assert.equal(click(3, 1), undefined, "only the telemetry row is clickable");

	await h.commands.get("costs").handler("", h.ctx);
	assert.ok(h.shelf(), "/costs opens the shelf");
	await h.emit("session_shutdown");
	assert.ok([...h.listeners.values()].every((set) => set.size === 0));
});

test("the open state survives reload and resume through a custom entry", async () => {
	const h = harness();
	await h.emit("session_start");
	await h.commands.get("shelf").handler("open", h.ctx);
	await h.emit("session_shutdown");
	assert.equal(h.shelf(), undefined);
	await h.emit("session_start");
	assert.ok(h.shelf());
	await h.commands.get("shelf").handler("", h.ctx);
	await h.emit("session_shutdown");
	await h.emit("session_start");
	assert.equal(h.shelf(), undefined);
	await h.emit("session_shutdown");
});

test("sections render by order, register in any load order, and leave on unregister", async () => {
	const h = harness();
	// Registered before the drawer listens: the drawer's request brings it back.
	const early = contract.registerShelfSection(h.pi, {
		id: "agents",
		title: "Agents",
		order: 10,
		headline: (theme: any) => theme.fg("accent", "● 2 running"),
		render: () => ["worker  task  1m"],
	});
	await h.emit("session_start");
	const late = contract.registerShelfSection(h.pi, {
		id: "cache",
		title: "Cache",
		order: 40,
		render: () => ["warm 4:12"],
	});
	await h.commands.get("shelf").handler("open", h.ctx);
	const lines = h.shelf(100)!;
	assert.deepEqual(headings(lines), ["Agents", "Last turn", "Context", "Cache", "Usage"]);
	assert.match(layout.plain(lines[0]), /^Agents ─+ ● 2 running$/);
	assert.equal(visibleWidth(lines[0]), 100);

	// Re-registering an id replaces the section.
	contract.registerShelfSection(h.pi, { id: "cache", title: "Cache", order: 5, render: () => ["cold"] });
	assert.deepEqual(headings(h.shelf(100)!).slice(0, 2), ["Cache", "Agents"]);
	early();
	late();
	assert.deepEqual(headings(h.shelf(100)!), ["Last turn", "Context", "Usage"]);

	// A throwing section reports itself instead of breaking the drawer.
	contract.registerShelfSection(h.pi, { id: "bad", title: "Bad", order: 1, render: () => { throw new Error("boom"); } });
	assert.match(h.shelf(100)!.map(layout.plain).join("\n"), /section failed: boom/);
	await h.emit("session_shutdown");
});

test("built-in sections show the last turn, context, and usage with tool counts", async () => {
	const h = harness();
	h.entries.push(
		{
			type: "message",
			message: {
				role: "assistant",
				model: "openai/gpt-6.1-sol",
				usage: { input: 1200, output: 300, cacheRead: 5000, cacheWrite: 100, cost: { total: 0.25 } },
				content: [
					{ type: "toolCall", name: "bash" },
					{ type: "toolCall", name: "read" },
					{ type: "toolCall", name: "bash" },
				],
			},
		},
		{ type: "custom", customType: "turn-receipt", data: { elapsedMs: 42_000, output: 3100, tps: 61, cost: 0.21, contextPercent: 31 } },
	);
	await h.emit("session_start");
	await h.commands.get("shelf").handler("open", h.ctx);
	const text = h.shelf(100)!.map(layout.plain).join("\n");
	assert.match(text, /^Last turn ─+ 42s$/m);
	assert.match(text, /model gpt-6\.1-sol .*out 3\.1k .*speed 61 t\/s .*cost \$0\.210 .*ctx 31%/);
	assert.match(text, /^Context ─+ 38%$/m);
	assert.match(text, /ctx [█░┃]+ +38%/);
	assert.match(text, /compacts at 80% \(102k\)/);
	assert.match(text, /^Usage ─+ \$0\.250$/m);
	assert.match(text, /in 1\.2k .*out 300 .*cache read 5\.0k .*cache write 100/);
	assert.match(text, /tools +bash 2 +read 1/);
	await h.emit("session_shutdown");
});

test("the drawer is capped to a share of the terminal and keeps every heading", async () => {
	assert.equal(shelfModule.shelfHeight(24), 9);
	assert.equal(shelfModule.shelfHeight(60), 24);
	assert.equal(shelfModule.shelfHeight(5), 4);
	assert.equal(shelfModule.shelfHeight(undefined), 9);

	const h = harness(undefined, { rows: 24 });
	await h.emit("session_start");
	contract.registerShelfSection(h.pi, {
		id: "long",
		title: "Long",
		order: 1,
		render: () => Array.from({ length: 50 }, (_, index) => `line ${index}`),
	});
	await h.commands.get("shelf").handler("open", h.ctx);
	const lines = h.shelf(80)!;
	assert.equal(lines.length, 9);
	assert.deepEqual(headings(lines), ["Long", "Last turn", "Context", "Usage"]);
	assert.match(lines.map(layout.plain).join("\n"), /… \+\d+ more/);

	const many = Array.from({ length: 12 }, (_, index) => ({
		id: `s${index}`,
		title: `S${index}`,
		order: index,
		render: () => ["x"],
	}));
	const cut = shelfModule.renderDrawer(many, 40, h.theme, 5);
	assert.equal(cut.length, 5);
	assert.match(layout.plain(cut.at(-1)), /\+8 more sections/);
	await h.emit("session_shutdown");
});

test("drawer lines, headings, and the footer stay within narrow widths", async () => {
	const h = harness();
	await h.emit("session_start");
	contract.registerShelfSection(h.pi, {
		id: "wide",
		title: "A very long section title 项目👩‍💻",
		order: 1,
		headline: (theme: any) => theme.fg("accent", "● 12 running, a long headline"),
		render: (width: number) => ["x".repeat(width + 30), "项目".repeat(40)],
	});
	await h.commands.get("shelf").handler("open", h.ctx);
	h.statuses.set("limits", "5h 12%  7d 34%");
	h.statuses.set("cache", "warm 4:12");
	h.statuses.set("agents", "● 2");
	h.statuses.set("mcp", h.theme.fg("error", "MCP: 1/2 connection failed"));
	for (const width of [1, 2, 5, 10, 20, 33, 40, 60, 80, 120, 200]) {
		for (const line of h.shelf(width)!) assert.ok(visibleWidth(line) <= width, `shelf ${width}`);
		const footer = h.footer.render(width);
		assert.equal(footer.length, 2, `footer height at ${width}`);
		for (const line of footer) assert.ok(visibleWidth(line) <= width, `footer ${width}`);
		const heading = shelfModule.sectionHeading(h.theme, "Agents", "● 2 running", width);
		assert.ok(visibleWidth(heading) <= width);
	}
	assert.equal(shelfModule.sectionHeading(h.theme, "Agents", "x", 0), "");
	await h.emit("session_shutdown");
});

test("footer fields drop by rank instead of wrapping, and plugin statuses stay", async () => {
	const h = harness();
	await h.emit("session_start");
	h.statuses.set("conv-summary", "Build the shelf drawer");
	h.statuses.set("limits", `${h.theme.fg("dim", "5h ")}12%  ${h.theme.fg("dim", "7d ")}34%`);
	h.statuses.set("cache", "warm 4:12");
	h.statuses.set("agents", "● 2");
	h.statuses.set("other", "ready");
	const row = (width: number) => layout.plain(h.footer.render(width)[0]);
	const fields = (width: number) => {
		const text = row(width);
		return ["5h", "cache", "out", "cost", "agents", "shelf"].filter((name) => text.includes(name));
	};
	assert.deepEqual(fields(140), ["5h", "cache", "out", "cost", "agents", "shelf"]);
	assert.match(row(140), /^ctx [█░┃]{20} +38% \/ 128k  5h 12%  7d 34%  cache warm 4:12  out +0  cost +\$0\.000 +agents ● 2  shelf ▸$/);
	// The documented drop order: cache, out, limits, agents, cost, shelf.
	const seen: string[][] = [];
	for (let width = 140; width >= 1; width--) {
		const now = fields(width);
		if (JSON.stringify(now) !== JSON.stringify(seen.at(-1))) seen.push(now);
		assert.equal(h.footer.render(width).length, 2);
	}
	const dropped = seen.slice(1).map((now, index) => seen[index].find((name) => !now.includes(name)));
	assert.deepEqual(dropped, ["cache", "out", "5h", "agents", "cost", "shelf"]);
	assert.doesNotMatch(row(140), /limits/, "limits carries its own labels");
	assert.match(row(140), /agents ● 2/, "agents gets a dim label");

	const second = layout.plain(h.footer.render(80)[1]);
	assert.match(second, /^» Build the shelf drawer +other ready$/);
	for (let index = 0; index < 12; index++) h.statuses.set(`plugin-${index}`, `status ${index}`);
	h.statuses.set("broken", h.theme.fg("error", "failed"));
	const crowded = layout.plain(h.footer.render(80)[1]);
	assert.match(crowded, /^» Build the shelf.*broken failed.*\+\d+$/, "errors first; the rest collapse to +n");
	await h.emit("session_shutdown");
});

test("Codex limits show in the footer and shelf, refresh at most every five minutes, and toast once per window", async () => {
	allowance.resetCodexAllowanceCache();
	let clock = Date.parse("2026-10-23T12:00:00Z");
	let fetches = 0;
	let fiveHour = 12;
	let reset = clock / 1000 + 3 * 3600;
	const fetcher = async () => {
		fetches++;
		return {
			rateLimits: {
				limitId: "codex",
				limitName: "Codex",
				planType: "plus",
				primary: { usedPercent: fiveHour, windowDurationMins: 300, resetsAt: reset },
				secondary: { usedPercent: 34, windowDurationMins: 10080, resetsAt: clock / 1000 + 4 * 86400 },
			},
		};
	};
	const limits = limitsModule.createCodexLimits({ fetcher, now: () => clock });
	const h = harness([footerModule.default, shelfModule.default, limits], { provider: "openai-codex", rows: 60 });
	await h.emit("session_start");
	await tick();
	assert.equal(fetches, 1);
	assert.equal(layout.plain(h.statuses.get("limits")), "5h 12%  7d 34%");
	assert.match(layout.plain(h.footer.render(120)[0]), /5h 12%  7d 34%/);
	assert.ok(h.statuses.get("limits")!.includes(h.theme.fg("text", "12%")));

	await h.commands.get("shelf").handler("open", h.ctx);
	const shelf = h.shelf(100)!.map(layout.plain).join("\n");
	assert.match(shelf, /^Limits ─+ 7d 34%$/m);
	assert.match(shelf, /5h +[█░]+ +12% +resets \d\d:\d\d \(in 3h 00m\)/);
	assert.match(shelf, /7d +[█░]+ +34% +resets \w{3} \d\d:\d\d \(in 4d\)/);
	assert.match(shelf, /plan plus · checked just now/);

	// Turn ends inside the five-minute cache do not refetch.
	fiveHour = 85;
	await h.emit("turn_end");
	await tick();
	assert.equal(fetches, 1);
	clock += 5 * 60 * 1000;
	await h.emit("turn_end");
	await tick();
	assert.equal(fetches, 2);
	assert.ok(h.statuses.get("limits")!.includes(h.theme.fg("error", "85%")));
	assert.equal(h.notices.length, 1);
	assert.match(h.notices[0].text, /5-hour allowance at 85%/);
	assert.equal(h.notices[0].level, "warning");

	clock += 5 * 60 * 1000;
	await h.emit("turn_end");
	await tick();
	assert.equal(h.notices.length, 1, "one toast per window per reset");
	reset += 5 * 3600;
	clock += 5 * 60 * 1000;
	await h.emit("turn_end");
	await tick();
	assert.equal(h.notices.length, 2, "a new reset window can toast again");

	// Leaving Codex clears the footer field and removes the section.
	await h.emit("model_select", { model: { provider: "openrouter", id: "x" } });
	assert.equal(h.statuses.get("limits"), undefined);
	assert.doesNotMatch(h.shelf(100)!.map(layout.plain).join("\n"), /^Limits/m);
	await h.emit("session_shutdown");
	allowance.resetCodexAllowanceCache();
});

test("limit colours change at 50% and 80%, and failures read unavailable", () => {
	const theme = makeTheme();
	assert.equal(limitsModule.limitColor(49), "text");
	assert.equal(limitsModule.limitColor(50), "warning");
	assert.equal(limitsModule.limitColor(80), "error");
	assert.equal(layout.plain(limitsModule.limitsStatus(theme, { fetchedAt: 0, error: "no codex" })), "limits unavailable");
	assert.match(layout.plain(limitsModule.limitsLines(theme, { fetchedAt: 0, error: "no codex" }, 60)[0]), /Unavailable: no codex/);
	for (const width of [1, 10, 30, 80]) {
		const lines = limitsModule.limitsLines(theme, {
			fetchedAt: 0,
			result: { rateLimits: { primary: { usedPercent: 60, windowDurationMins: 300, resetsAt: 100 } } },
		}, width, 0);
		assert.ok(lines.every((line: string) => visibleWidth(line) <= width));
	}
});

test("the allowance cache shares one fetch between concurrent callers", async () => {
	allowance.resetCodexAllowanceCache();
	let fetches = 0;
	const fetcher = async () => {
		fetches++;
		return { rateLimits: {} };
	};
	const [a, b] = await Promise.all([
		allowance.loadCodexAllowance({ fetcher }),
		allowance.loadCodexAllowance({ fetcher }),
	]);
	assert.equal(fetches, 1);
	assert.equal(a, b);
	assert.equal(allowance.peekCodexAllowance(), a);
	allowance.resetCodexAllowanceCache();
	await allowance.loadCodexAllowance({ fetcher: async () => { throw new Error("offline"); } });
	assert.equal(allowance.peekCodexAllowance().error, "offline");
	allowance.resetCodexAllowanceCache();
	assert.equal(allowance.shortDurationLabel(300, "p"), "5h");
	assert.equal(allowance.shortDurationLabel(10080, "s"), "7d");
	assert.equal(allowance.shortDurationLabel(1440, "s"), "1d");
});
