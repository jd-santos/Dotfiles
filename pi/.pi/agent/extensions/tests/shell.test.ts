import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Use the installed Pi runtime, including its actual editor and ANSI renderer.
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
const layout = await jiti.import(file("../lib/shell-layout.ts"));
const footerModule = await jiti.import(file("../footer.ts"));
const editorModule = await jiti.import(file("../ui-read-and-shortcuts.ts"));
const gateModule = await jiti.import(file("../permission-gate.ts"));
const { Theme } = await import(join(piDir, "dist/index.js"));
const { KeybindingsManager } = await import(
	join(piDir, "dist/core/keybindings.js")
);
const { visibleWidth } = await import(tuiPath);

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

function harness(order = [footerModule.default, editorModule.default]) {
	const theme = makeTheme();
	const listeners = new Map<string, Set<(value: any) => void>>();
	const handlers = new Map<string, Array<(event: any, ctx: any) => void>>();
	const commands = new Map<string, any>();
	const statuses = new Map([["permission-gate", "ask"]]);
	const entries: any[] = [];
	const branches = new Set<() => void>();
	let branch = "feature/design";
	let footer: any;
	let editor: any;
	let title = "";
	let renders = 0;
	const events = {
		on(name: string, callback: (value: any) => void) {
			if (!listeners.has(name)) listeners.set(name, new Set());
			listeners.get(name)!.add(callback);
			return () => listeners.get(name)!.delete(callback);
		},
		emit(name: string, value: any) {
			for (const callback of listeners.get(name) ?? []) callback(value);
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
		registerTool() {},
		getThinkingLevel: () => "xhigh",
		getSessionName: () => "Refine the shell layout",
		appendEntry(customType: string, data: any) {
			entries.push({ type: "custom", customType, data });
		},
	};
	const tui = {
		requestRender() {
			renders++;
		},
		terminal: { rows: 24 },
	};
	const data = {
		getGitBranch: () => branch,
		getExtensionStatuses: () => statuses,
		onBranchChange(callback: () => void) {
			branches.add(callback);
			return () => branches.delete(callback);
		},
	};
	const ctx = {
		cwd: "/workspace/projects/Dotfiles",
		hasUI: true,
		model: {
			id: "openai/gpt-5.6-luna",
			provider: "openrouter",
			contextWindow: 128000,
		},
		modelRegistry: { isUsingOAuth: () => false },
		getContextUsage: () => ({
			tokens: 48640,
			percent: 38,
			contextWindow: 128000,
		}),
		sessionManager: { getBranch: () => entries },
		ui: {
			theme,
			setStatus(name: string, text: string) {
				statuses.set(name, text);
			},
			setTitle(text: string) {
				title = text;
			},
			setFooter(factory: any) {
				footer?.dispose();
				footer = factory?.(tui, theme, data);
			},
			setEditorComponent(factory: any) {
				editor = factory(
					tui,
					{
						borderColor: (text: string) => theme.fg("border", text),
						selectList: {
							selectedPrefix: (text: string) => text,
							selectedText: (text: string) => text,
							description: (text: string) => text,
							scrollInfo: (text: string) => text,
							noMatch: (text: string) => text,
						},
					},
					new KeybindingsManager(),
				);
			},
			addAutocompleteProvider() {},
			notify() {},
		},
	};
	for (const factory of order) factory(pi);
	const emit = async (name: string, event = {}) => {
		for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
	};
	return {
		ctx,
		theme,
		statuses,
		entries,
		branches,
		listeners,
		commands,
		emit,
		get footer() {
			return footer;
		},
		get editor() {
			return editor;
		},
		get title() {
			return title;
		},
		get renders() {
			return renders;
		},
		changeBranch(value: string) {
			branch = value;
			for (const callback of branches) callback();
		},
	};
}

test("long paths, branches, Unicode, and narrow borders stay within terminal width", () => {
	const theme = makeTheme();
	for (const width of [1, 8, 20, 40, 60, 80, 120]) {
		const data = {
			getGitBranch: () => "feature/very-long-branch-修正-design",
			getExtensionStatuses: () => new Map([["permission-gate", "yolo | +3"]]),
		};
		const label = layout.workspaceLabel(
			theme,
			"/a/very/long/parent/directory/项目👩‍💻",
			data,
			Math.max(0, width - 4),
		);
		assert.ok(visibleWidth(layout.border(theme, label, width)) <= width);
		if (width >= 40) assert.match(layout.plain(label), /git .*perm yolo/);
	}
	assert.equal(
		layout.plain(layout.location(theme, "/long/parent/Dotfiles", 13)),
		"…/Dotfiles",
	);
});

test("context thresholds and unknown capacity match the planning rules", () => {
	const theme = makeTheme();
	for (const [percent, color] of [
		[49, "syntaxOperator"],
		[50, "warning"],
		[79, "warning"],
		[80, "error"],
	] as const) {
		const line = layout.contextMeter(theme, { percent }, 128000, 60);
		assert.ok(line.includes(theme.fg(color, `${percent}%`.padStart(4))));
	}
	for (const percent of [null, undefined, NaN, Infinity]) {
		const text = layout.plain(
			layout.contextMeter(theme, { percent }, 128000, 60),
		);
		assert.match(text, /unavailable/);
		assert.doesNotMatch(text, /0%|█/);
	}
	assert.match(
		layout.plain(
			layout.contextMeter(theme, { tokens: null, percent: 0 }, 128000, 60),
		),
		/unavailable/,
	);
});

test("model and thinking expense tiers use the shared palette", async () => {
	for (const [model, color] of [
		["anthropic/claude-astra-4.6", "error"],
		["anthropic/claude-fable-4.6", "error"],
		["openai/gpt-5.6-sol", "mdHeading"],
		["anthropic/claude-opus-4.6", "mdHeading"],
		["moonshotai/kimi-k3", "mdHeading"],
		["openai/gpt-5.6-luna", "success"],
		["openai/gpt-5.6-terra", "success"],
		["anthropic/claude-sonnet-4.6", "success"],
		["deepseek/deepseek-v4-flash", "success"],
		["z-ai/glm-5.3-flash", "success"],
		["qwen/qwen3.8-27b", "mdLink"],
		["local/model-32b", "mdLink"],
		["openai/gpt-mini", "mdLink"],
		["unknown/model-70b", "text"],
		["mistral/mixtral-8x7b", "text"],
	] as const) {
		assert.equal(editorModule.modelCostColor(model), color);
	}
	assert.equal(
		editorModule.modelCostColor("anthropic/claude-astra-7b"),
		"error",
	);
	assert.equal(
		editorModule.modelCostColor("anthropic/claude-sonnet-14b"),
		"success",
	);

	for (const [level, color] of [
		["off", "dim"],
		["minimal", "dim"],
		["low", "mdLink"],
		["medium", "success"],
		["high", "mdHeading"],
		["xhigh", "error"],
		["max", "error"],
	] as const) {
		assert.equal(editorModule.thinkingCostColor(level), color);
	}

	const h = harness();
	await h.emit("session_start");
	const banner = h.editor.renderBottomBorder(100, 0);
	assert.ok(banner.includes(h.theme.fg("success", "gpt-5.6-luna")));
	assert.ok(banner.includes(h.theme.fg("dim", "think ")));
	assert.ok(banner.includes(h.theme.fg("error", "xhigh")));
	const rendersBeforeThinkingChange = h.renders;
	await h.emit("thinking_level_select", { level: "high" });
	assert.ok(h.renders > rendersBeforeThinkingChange);
	await h.emit("session_shutdown");
});

test("plugin labels are quiet while colored failures survive and sort first", () => {
	const theme = makeTheme();
	const error = theme.fg("error", "LSP Inactive");
	const lines = footerModule.pluginStatuses(
		new Map([
			["other", "ready"],
			["pi-lens-lsp", error],
			["usage", "usage: 123 records"],
		]),
		theme,
		false,
	);
	assert.equal(lines.length, 2);
	assert.match(layout.plain(lines[0]), /^lsp inactive/);
	assert.ok(lines[0].includes(theme.fg("dim", "lsp ")));
	assert.ok(lines[0].includes(theme.fg("error", "inactive")));
	assert.equal(
		layout.styledStatus(`\x1b[2J${error}\x1b]0;new title\x07`),
		error,
	);
	const failure = footerModule.pluginStatuses(
		new Map([
			["mcp", theme.fg("error", "MCP: 1/1 connection failed")],
			["usage", theme.fg("warning", "usage: 123 records, warning")],
		]),
		theme,
		false,
	);
	assert.equal(failure.length, 2);
});

test("the permission gate publishes its actual initial and toggled modes", async () => {
	const h = harness([
		footerModule.default,
		editorModule.default,
		gateModule.default,
	]);
	h.statuses.delete("permission-gate");
	await h.emit("session_start");
	assert.match(layout.plain(h.editor.render(80)[0]), /perm ask/);
	await h.commands.get("yolo").handler("", h.ctx);
	assert.match(layout.plain(h.editor.render(80)[0]), /perm yolo/);
	await h.commands.get("reset-rules").handler("", h.ctx);
	assert.match(layout.plain(h.editor.render(80)[0]), /perm ask/);
	await h.emit("session_shutdown");
});

test("the prompt receives live branch and permission data regardless of load order", async () => {
	for (const order of [
		[footerModule.default, editorModule.default],
		[editorModule.default, footerModule.default],
	]) {
		const h = harness(order);
		await h.emit("session_start");
		assert.match(
			layout.plain(h.editor.render(100)[0]),
			/Dotfiles.*git feature\/design.*perm ask/,
		);
		h.changeBranch("main");
		h.statuses.set("permission-gate", "readonly");
		assert.match(
			layout.plain(h.editor.render(100)[0]),
			/git main.*perm readonly/,
		);
		assert.equal(h.title, "Pi · Dotfiles · main");
		assert.ok(h.renders > 0);
		await h.emit("session_shutdown");
		assert.equal(h.branches.size, 0);
		assert.ok([...h.listeners.values()].every((set) => set.size === 0));
	}
});

test("autocomplete rows, cursor marker, and scroll indicators survive shell styling", async () => {
	const h = harness();
	await h.emit("session_start");
	h.editor.setText("/mod");
	h.editor.focused = true;
	h.editor.autocompleteState = "request";
	h.editor.autocompleteList = {
		render: () => ["/model  select model", "/models  scope models"],
	};
	const lines = h.editor.render(80);
	assert.match(layout.plain(lines.at(-1)), /\/models  scope models/);
	assert.ok(lines.some((line: string) => line.includes("\x1b_pi:c")));
	assert.match(layout.plain(h.editor.renderTopBorder(80, 12)), /↑12/);
	assert.match(layout.plain(h.editor.renderBottomBorder(80, 7)), /↓7/);
	await h.emit("session_shutdown");
});

test("footer keeps summary emphasis, wraps narrow layouts, and restores details on reload", async () => {
	const h = harness();
	await h.emit("session_start");
	h.statuses.set("conv-summary", "A useful session summary");
	h.statuses.set("tps", "42 tok/s (123 tok / 2.9s)");
	for (const width of [20, 40, 60, 80, 120]) {
		const lines = h.footer.render(width);
		assert.ok(lines.every((line: string) => visibleWidth(line) <= width));
		assert.ok(lines.some((line: string) => layout.plain(line).includes("cost")));
	}
	assert.ok(
		h.footer.render(80).at(-1).includes(h.theme.bold("A useful session summary")),
	);
	assert.doesNotMatch(
		h.footer.render(120).map(layout.plain).join("\n"),
		/cache read/,
	);
	await h.commands.get("shell").handler("details", h.ctx);
	await h.emit("session_shutdown");
	await h.emit("session_start");
	assert.match(h.footer.render(120).map(layout.plain).join("\n"), /cache read/);
	assert.equal(h.branches.size, 1);
	await h.emit("session_shutdown");
});

test("all bundled palettes render the shell with valid color references", () => {
	for (const name of [
		"catppuccin-mocha",
		"catppuccin-macchiato",
		"catppuccin-frappe",
		"catppuccin-latte",
		"dracula",
		"quiet-ink",
	]) {
		const theme = makeTheme(name);
		assert.ok(layout.contextMeter(theme, { percent: 50 }, 128000, 60));
		assert.ok(layout.workspaceLabel(theme, "/workspace/Dotfiles", undefined, 60));
	}
});
