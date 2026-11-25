import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const piDir = process.env.PI_TEST_PACKAGE_DIR ?? join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
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
const gate = await jiti.import(fileURLToPath(new URL("../permission-gate.ts", import.meta.url)));
const { KeybindingsManager } = await import(join(piDir, "dist/core/keybindings.js"));
const { visibleWidth } = await import(tuiPath);
const { Theme } = await import(join(piDir, "dist/index.js"));
const palette = JSON.parse(readFileSync(new URL("../../themes/catppuccin-mocha.json", import.meta.url), "utf8"));
const resolveColor = (value: string): string => palette.vars[value] ? resolveColor(palette.vars[value]) : value;
const colors = Object.fromEntries(Object.entries(palette.colors).map(([key, value]) => [key, resolveColor(value as string)]));
const theme = new Theme(colors, colors, "truecolor");

function harness(options: { mode?: string; keys?: Record<string, string[]> } = {}) {
	const handlers = new Map<string, any>();
	const commands = new Map<string, any>();
	const statuses: string[] = [];
	const widgets = new Map<string, unknown>();
	const messages: string[] = [];
	const customKeys: string[][] = [];
	const selections: Array<(title: string, items: string[]) => string | undefined> = [];
	const inputs: Array<string | undefined> = [];
	const screens: string[][] = [];
	const customOptions: any[] = [];
	const keys = new KeybindingsManager(options.keys);
	const ui = {
		theme,
		setStatus: (_name: string, value: string) => statuses.push(value),
		setWidget: (name: string, value: unknown) => widgets.set(name, value),
		notify: () => {},
		select: async (title: string, items: string[]) => {
			const select = selections.shift();
			assert.ok(select, `Unexpected selector: ${title}`);
			return select(title, items);
		},
		input: async () => {
			assert.ok(inputs.length, "Unexpected note input");
			return inputs.shift();
		},
		custom: async (factory: any, config: any) => {
			customOptions.push(config);
			const data = customKeys.shift();
			assert.ok(data, "Unexpected custom prompt");
			let completed = false;
			let value: string | undefined;
			const component = factory({ requestRender() {} }, theme, keys, (result: string | undefined) => { completed = true; value = result; });
			for (const width of [18, 40, 100]) {
				const lines = component.render(width);
				assert.ok(lines.every((line: string) => visibleWidth(line) <= width), `Overflow at ${width}: ${lines.join("\n")}`);
			}
			screens.push(component.render(100));
			for (const key of data) {
				assert.equal(completed, false, "Keys remained after dialog closed");
				component.handleInput(key);
				component.invalidate();
				component.render(40);
			}
			assert.equal(completed, true, "Dialog did not resolve");
			return value;
		},
	};
	const ctx = { mode: options.mode ?? "tui", hasUI: true, cwd: "/workspace/demo", ui };
	gate.default({
		on: (name: string, handler: any) => handlers.set(name, handler),
		registerCommand: (name: string, command: any) => commands.set(name, command),
		exec: async () => ({ code: 0, stdout: "", stderr: "" }),
		sendUserMessage: (message: string) => messages.push(message),
	});
	return {
		ctx, customKeys, selections, inputs, screens, customOptions, statuses, widgets, messages,
		command: (name: string) => commands.get(name).handler("", ctx),
		call: (command = "npm test") => handlers.get("tool_call")({ toolName: "bash", input: { command } }, ctx),
		write: (path: string) => handlers.get("tool_call")({ toolName: "write", input: { path } }, ctx),
		edit: (path: string) => handlers.get("tool_call")({ toolName: "edit", input: { path } }, ctx),
		result: (command: string, output: string, isError = false) => handlers.get("tool_result")({
			toolName: "bash", input: { command }, isError, content: [{ type: "text", text: output }],
		}, ctx),
	};
}
const choose = (prefix: string) => (_title: string, items: string[]) => {
	const selected = items.find((item) => item.startsWith(prefix));
	assert.ok(selected, `Missing ${prefix}: ${items.join(", ")}`);
	return selected;
};
const plain = (screen: string[]) => screen.join("\n").replace(/\x1b\[[0-9;]*m/g, "");

test("Enter and a approve once without enabling YOLO; prompt reports blocked permission status", async () => {
	const h = harness();
	for (const key of ["\r", "a"]) {
		h.customKeys.push([key]);
		assert.equal(await h.call(), undefined);
		assert.notEqual(h.statuses.at(-1), "yolo");
	}
	assert.match(plain(h.screens[0]), /→ \[a\] Allow once/);
	assert.match(plain(h.screens[0]), /\[y\] Enable YOLO for this session/);
	assert.deepEqual(h.customOptions[0], { blocked: { kind: "permission", message: "Tool approval required" } });
	assert.equal(h.widgets.get("permission-gate-alert"), undefined);
});

test("y explicitly enables session YOLO; subsequent ordinary calls stop prompting", async () => {
	const h = harness();
	h.customKeys.push(["y"]);
	assert.equal(await h.call(), undefined);
	assert.equal(h.statuses.at(-1), "yolo");
	assert.equal(await h.call("python3 demo.py"), undefined);
	assert.equal(await h.write("../other/demo.txt"), undefined);
	assert.equal(h.screens.length, 1);
});

test("deny, Escape, and Ctrl+C deny once without opening another selector", async () => {
	for (const key of ["d", "\x1b", "\x03"]) {
		const h = harness();
		h.customKeys.push([key], ["a"]);
		assert.equal((await h.call()).block, true);
		assert.equal(await h.call(), undefined);
		assert.equal(h.screens.length, 2);
		assert.equal(h.widgets.get("permission-gate-alert"), undefined);
	}
});

test("arrows select actions; injected selection bindings are honored", async () => {
	const h = harness();
	h.customKeys.push(["\x1b[B", "\r"]);
	assert.equal(await h.call(), undefined);
	assert.equal(h.statuses.at(-1), "yolo");
	const remapped = harness({ keys: { "tui.select.down": ["ctrl+j"], "tui.select.confirm": ["ctrl+l"], "tui.select.cancel": ["ctrl+q"] } });
	remapped.customKeys.push(["\n", "\x0c"]);
	assert.equal(await remapped.call(), undefined);
	assert.equal(remapped.statuses.at(-1), "yolo");
	remapped.customKeys.push(["\x11"]);
	assert.equal((await remapped.call("rm demo.txt")).block, true);
});

test("unknown keys and pasted text do not grant permission", async () => {
	const h = harness();
	h.customKeys.push(["z", "\x19", "\x1b[200~y\x1b[201~", "d"]);
	assert.equal((await h.call()).block, true);
	assert.notEqual(h.statuses.at(-1), "yolo");
});

test("More options cancels back to the prompt, never silently approving", async () => {
	const h = harness();
	h.customKeys.push(["m"], ["m"], ["m"], ["d"]);
	h.selections.push(() => undefined, choose("Allow for"), () => undefined, choose("Block for"), () => undefined);
	assert.equal((await h.call()).block, true);
	assert.equal(h.screens.length, 4);
});

test("narrow session allow rules remain available, with no YOLO or ancestor ladder", async () => {
	const h = harness();
	h.customKeys.push(["m"]);
	h.selections.push(choose("Allow for"), (_title, items) => {
		assert.equal(items.filter((item) => item.startsWith("📁")).length, 1);
		assert.ok(items.includes("📁 This directory (/workspace/demo/)"));
		assert.ok(!items.some((item) => /yolo|parent directory/i.test(item)));
		return items[0];
	});
	assert.equal(await h.call(), undefined);
	assert.equal(await h.call(), undefined);
	assert.equal(h.statuses.at(-1), "+1");
	h.customKeys.push(["d"]);
	assert.equal((await h.call("npm install")).block, true);
});

test("relative file directory scopes resolve against CWD and do not allow siblings", async () => {
	const h = harness();
	h.customKeys.push(["m"]);
	h.selections.push(choose("Allow for"), choose("📁 This directory (/workspace/other/)"));
	assert.equal(await h.write("../other/first.txt"), undefined);
	assert.equal(await h.write("/workspace/other/second.txt"), undefined);
	h.customKeys.push(["d"]);
	assert.equal((await h.write("/workspace/sibling/third.txt")).block, true);
});

test("persistent deny rules require explicit advanced selection and block matching calls", async () => {
	const h = harness();
	h.customKeys.push(["m"]);
	h.selections.push(choose("Block for"), (_title, items) => {
		assert.equal(items.filter((item) => item.startsWith("📁")).length, 1);
		assert.ok(!items.some((item) => /parent directory/i.test(item)));
		return choose("⌨️  npm")(_title, items);
	});
	assert.equal((await h.call()).block, true);
	assert.equal(h.statuses.at(-1), "-1");
	assert.match((await h.call("npm install")).reason, /session rule/);
	assert.equal(h.screens.length, 1);
});

test("enabling YOLO from a prompt clears granular rules just like /yolo", async () => {
	const h = harness();
	h.customKeys.push(["m"], ["y"]);
	h.selections.push(choose("Block for"), choose("⌨️  npm"));
	await h.call();
	assert.equal(await h.call("python3 demo.py"), undefined);
	assert.equal(h.statuses.at(-1), "yolo");
	await h.command("yolo");
	assert.equal(h.statuses.at(-1), "ask");
	h.customKeys.push(["a"]);
	assert.equal(await h.call(), undefined);
});

test("view and notes return to allow-once default; canceling a note preserves guidance", async () => {
	const h = harness();
	h.customKeys.push(["v"], ["n"], ["n"], ["\r"]);
	h.inputs.push("Please check the result", undefined);
	const command = "npm test\n# second\n# third\n# fourth\n# fifth\n# sixth";
	assert.equal(await h.call(command), undefined);
	assert.match(plain(h.screens[1]), /# sixth/);
	assert.match(plain(h.screens[1]), /→ \[a\] Allow once/);
	assert.match(plain(h.screens[3]), /Edit note: Please check the result/);
	assert.deepEqual(h.messages, ["Please check the result"]);
});

test("notes on denial are returned as the blocking reason", async () => {
	const h = harness();
	h.customKeys.push(["n"], ["d"]);
	h.inputs.push("Use the local fixture instead");
	assert.match((await h.call()).reason, /Use the local fixture instead/);
});

test("high-risk prompts cannot enable YOLO or session rules, even when YOLO is active", async () => {
	const h = harness();
	await h.command("yolo");
	for (const command of ["rm demo.txt", "chmod 755 demo.sh", "ssh example.invalid", "touch /etc/demo",
		"git reset --hard", "git clean -fd", "git push --force", "git push --force-with-lease",
		"git push origin +HEAD:main", "git push --mirror"]) {
		h.customKeys.push(["y", "m", "d"]);
		assert.equal((await h.call(command)).block, true);
		assert.doesNotMatch(plain(h.screens.at(-1)!), /\[y\]|\[m\]/);
	}
	h.customKeys.push(["a"], ["d"]);
	assert.equal(await h.call("rm demo.txt"), undefined);
	assert.equal((await h.call("rm demo.txt")).block, true);
	h.customKeys.push(["y", "m", "d"]);
	assert.equal((await h.write("/etc/demo")).block, true);
	assert.equal(h.statuses.at(-1), "yolo");
});

test("sensitive reads and read-only mode remain blocked without a prompt", async () => {
	const h = harness();
	await h.command("yolo");
	assert.equal((await h.call("cat .env")).block, true);
	await h.command("readonly");
	assert.equal((await h.call()).block, true);
	assert.equal((await h.write("demo.txt")).block, true);
	assert.equal(h.screens.length, 0);
});

test("system inspection does not prompt in default, YOLO, or readonly modes", async () => {
	for (const mode of [undefined, "yolo", "readonly"]) {
		const h = harness();
		if (mode) await h.command(mode);
		for (const command of ["ls /opt/homebrew/lib", "git -C /private/tmp/example status", "git -C /usr/lib diff --stat"]) {
			assert.equal(await h.call(command), undefined);
		}
		assert.equal(h.screens.length, 0);
	}
});

test("destructive Git cannot bypass an all-Git session scope or headless execution", async () => {
	const h = harness();
	h.customKeys.push(["m"]);
	h.selections.push(choose("Allow for"), choose("⌨️  All Git"));
	assert.equal(await h.call("git add demo.txt"), undefined);
	h.customKeys.push(["d"]);
	assert.equal((await h.call("git reset --hard")).block, true);
	h.ctx.hasUI = false;
	await h.command("yolo");
	assert.equal((await h.call("git push --force")).block, true);
});

test("wrapped destructive Git still requires one-time approval under YOLO", async () => {
	const h = harness();
	await h.command("yolo");
	for (const command of [
		"nice git reset --hard", "nice -n 10 git clean -fd",
		"timeout 30s git push --force-with-lease", "nohup git push origin +HEAD:main",
		"xargs git reset --hard", "git clean -e -n -f", "git clean -n --no-dry-run -f",
		"env -a bogus git reset --hard", "env --argv0 bogus git push --force",
	]) {
		h.customKeys.push(["y", "m", "d"]);
		assert.equal((await h.call(command)).block, true);
		assert.doesNotMatch(plain(h.screens.at(-1)!), /\[y\]|\[m\]/);
	}
});

test("mutating sed cannot qualify as protected-path or readonly inspection", async () => {
	const h = harness();
	const command = "sed -n 'w /private/tmp/gate-output' /etc/hosts";
	await h.command("yolo");
	h.customKeys.push(["d"]);
	assert.equal((await h.call(command)).block, true);
	await h.command("readonly");
	assert.match((await h.call(command)).reason, /Read-only mode/);
	assert.equal(await h.call("sed -n '1,20p' /etc/hosts"), undefined);
	assert.equal(h.screens.length, 1);
});

test("authentication stores remain blocked in every mode without reading them", async () => {
	for (const mode of [undefined, "yolo", "readonly"]) {
		const h = harness();
		if (mode) await h.command(mode);
		for (const command of [
			"cat /etc/shadow", "head '/private/etc/master.passwd'",
			"rg pattern /etc/gshadow", "cat /etc/security/opasswd",
			"ls /var/db/dslocal/nodes/Default/users",
			"cat /private/var/db/dslocal/nodes/Default/users/example.plist",
			"cat /etc/./shadow", "cat /etc/../etc/shadow", "cat /etc//gshadow",
			"head /private/etc/security/../master.passwd",
			"cat /var/db/dslocal/nodes/Default/./users/example.plist",
			"cat /private/var/db/dslocal/nodes/Default/users/../users/example.plist",
			"cd /etc && cat shadow",
		]) {
			assert.match((await h.call(command)).reason, /sensitive files/);
		}
		assert.equal(h.screens.length, 0);
		assert.equal(await h.call("cat /etc/passwd"), undefined);
		h.ctx.cwd = "/etc";
		assert.match((await h.call("cat ./shadow")).reason, /sensitive files/);
		assert.equal(h.screens.length, 0);
	}
});

test("readonly blocks destructive commands before any confirmation", async () => {
	const h = harness();
	await h.command("readonly");
	for (const command of ["git reset --hard", "git clean -fd", "git push --force", "rm demo.txt", "touch /etc/demo"]) {
		assert.match((await h.call(command)).reason, /Read-only mode/);
	}
	assert.equal(h.screens.length, 0);
});

test("YOLO recognizes session-created scratch directories, not arbitrary temp output", async (t) => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "pi-gate-hook-test-")));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const h = harness();
	await h.command("yolo");
	h.result("mktemp -d", root + "\n");
	assert.equal(await h.call(`touch ${root}/new.txt`), undefined);
	assert.equal(await h.write(`${root}/new/deep/file.txt`), undefined);
	assert.equal(await h.edit(`${root}/new/deep/file.txt`), undefined);
	assert.equal(h.screens.length, 0);
	// Existing and new targets under a symlink out of scratch remain protected.
	symlinkSync("/etc", join(root, "escape"));
	for (const operation of [() => h.write(`${root}/escape/example`), () => h.call(`touch ${root}/escape/example`)]) {
		h.customKeys.push(["d"]);
		assert.equal((await operation()).block, true);
	}
	h.customKeys.push(["d"]);
	assert.equal((await h.call(`rm ${root}/new.txt`)).block, true);
	await h.command("yolo");
	// Without YOLO a protected scratch path still requires high-risk approval.
	if (gate.isProtectedPath(root, h.ctx.cwd)) {
		h.customKeys.push(["d"]);
		assert.equal((await h.write(`${root}/new.txt`)).block, true);
		const unregistered = harness();
		await unregistered.command("yolo");
		for (const [command, output, failed] of [
			["mktemp -d", root, true], ["echo scratch", root, false],
			["mktemp -d && pwd", root, false], ["mktemp -d", tmpdir(), false],
			["mktemp -d", root + "\nextra", false],
		] as const) {
			unregistered.result(command, output, failed);
		}
		unregistered.customKeys.push(["d"]);
		assert.equal((await unregistered.write(`${root}/new.txt`)).block, true);
		await h.command("reset-rules");
		await h.command("yolo");
		h.customKeys.push(["d"]);
		assert.equal((await h.write(`${root}/new.txt`)).block, true);
	}
});

test("complex commands do not gain executable-pattern scopes", async () => {
	const h = harness();
	h.customKeys.push(["m"]);
	h.selections.push(choose("Allow for"), (_title, items) => {
		assert.ok(!items.some((item) => item.startsWith("⌨️")));
		return items[0];
	});
	assert.equal(await h.call("python3 <<'PY'\nprint('demo')\nPY"), undefined);
});

test("RPC retains ordinary selection dialogs and cancellation denies once", async () => {
	const h = harness({ mode: "rpc" });
	h.selections.push(choose("[y]"));
	assert.equal(await h.call(), undefined);
	assert.equal(h.statuses.at(-1), "yolo");
	assert.equal(h.screens.length, 0);
	h.selections.push(() => undefined);
	assert.equal((await h.call("rm demo.txt")).block, true);
});
