import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, realpathSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	analyzeBashCommand,
	areBashPartsCovered,
	canInferCommandSafety,
	formatAppleScriptNotification,
	formatOsc777Notification,
	highDangerBashReason,
	isPathInCwd,
	isPathInTemporaryDirectory,
	isProtectedPath,
	isReadOnlyGitCommandPart,
	isSafeCommandPart,
	selectPermissionNotificationRoute,
	writeNotificationSequence,
	type PermissionRule,
} from "../permission-gate.ts";

test("routes permission notifications through terminal and contextual backends", () => {
	assert.equal(
		selectPermissionNotificationRoute(
			"tui",
			{ TERM_PROGRAM: "ghostty" },
			{ isTTY: true, platform: "darwin" },
		),
		"osc777",
	);
	assert.equal(
		selectPermissionNotificationRoute(
			"tui",
			{ CMUX_SURFACE_ID: "surface-id", TERM_PROGRAM: "ghostty" },
			{ isTTY: true, platform: "darwin" },
		),
		"osc777",
	);
	assert.equal(
		selectPermissionNotificationRoute(
			"rpc",
			{ CMUX_SURFACE_ID: "surface-id" },
			{ isTTY: false, platform: "darwin" },
		),
		"cmux",
	);
	assert.equal(
		selectPermissionNotificationRoute("tui", {}, {
			isTTY: true,
			platform: "darwin",
		}),
		"macos",
	);
	assert.equal(
		selectPermissionNotificationRoute("tui", {}, {
			isTTY: true,
			platform: "linux",
		}),
		undefined,
	);
	assert.equal(
		selectPermissionNotificationRoute(
			"tui",
			{ TERM_PROGRAM: "ghostty", TMUX: "/tmp/tmux.sock,1,1" },
			{ isTTY: true, platform: "darwin" },
		),
		"macos",
	);
	assert.equal(
		selectPermissionNotificationRoute(
			"tui",
			{ CMUX_SURFACE_ID: "surface-id", TMUX: "/tmp/tmux.sock,1,1" },
			{ isTTY: true, platform: "darwin" },
		),
		"cmux",
	);
});

test("formats OSC 777 notifications and strips delimiter/control characters", () => {
	const escape = String.fromCharCode(27);
	const bell = String.fromCharCode(7);

	assert.equal(
		formatOsc777Notification("pi", "Permission required: bash"),
		`${escape}]777;notify;pi;Permission required: bash${bell}`,
	);
	assert.equal(
		formatOsc777Notification("p;i", `Need;${bell}confirm`),
		`${escape}]777;notify;p i;Need confirm${bell}`,
	);
});

test("handles asynchronous terminal write errors without leaking listeners", async () => {
	const output = new EventEmitter() as EventEmitter & {
		write: (
			chunk: string,
			callback: (error?: Error | null) => void,
		) => boolean;
	};

	output.write = (_chunk, callback) => {
		const error = new Error("EPIPE");
		queueMicrotask(() => {
			output.emit("error", error);
			callback(error);
		});
		return false;
	};

	assert.equal(await writeNotificationSequence(output, "notification"), false);
	assert.equal(output.listenerCount("error"), 0);
});

test("quotes fields in macOS notification scripts", () => {
	assert.equal(
		formatAppleScriptNotification('p"i', "Permission required: bash"),
		`display notification "Permission required: bash" with title "p${String.fromCharCode(92)}"i"`,
	);
});

test("splits simple chains without splitting quoted separators", () => {
	const chain = analyzeBashCommand("cd repo && rg 'one|two;three' . | head -20");
	assert.deepEqual(chain.parts, ["cd repo", "rg 'one|two;three' .", "head -20"]);
	assert.equal(chain.complex, false);

	const inlineScript = analyzeBashCommand("python3 -c 'print(\"a;b\")'");
	assert.deepEqual(inlineScript.parts, ["python3 -c 'print(\"a;b\")'"]);
});

test("marks shell features that require an explicit prompt", () => {
	assert.equal(
		canInferCommandSafety(analyzeBashCommand("rg todo . > results.txt")),
		false,
	);
	assert.equal(canInferCommandSafety(analyzeBashCommand("echo $(pwd)")), false);
	assert.equal(
		canInferCommandSafety(analyzeBashCommand('echo "$(pwd)"')),
		false,
	);
	assert.equal(
		canInferCommandSafety(
			analyzeBashCommand("for file in *; do echo $file; done"),
		),
		false,
	);
	assert.equal(
		canInferCommandSafety(analyzeBashCommand("printf 'a\\nb'")),
		true,
	);
	assert.equal(
		canInferCommandSafety(analyzeBashCommand("rg todo . 2>/dev/null")),
		true,
	);
	assert.equal(
		canInferCommandSafety(analyzeBashCommand("pwd\nrg todo .")),
		true,
	);
	assert.equal(
		canInferCommandSafety(analyzeBashCommand("git log @{upstream}..HEAD")),
		true,
	);
	assert.equal(canInferCommandSafety(analyzeBashCommand("ls /opt & touch /etc/example")), false);
	assert.equal(canInferCommandSafety(analyzeBashCommand("ls /opt &>/etc/example")), false);
	assert.equal(canInferCommandSafety(analyzeBashCommand("rg example . 2>&1")), true);
});

test("allows predictable inspection commands", () => {
	for (const command of [
		"true",
		"test -f README.md",
		"[ -d src ]",
		"jq -r '.name' package.json",
		"cmp first second",
		"comm -12 first second",
		"uname -a",
		"sw_vers",
		"shasum README.md",
		"plutil -lint Info.plist",
		"rg todo . 2>/dev/null",
		"sed -n '1,120p' /etc/hosts", "sed -n -e '1p' -e '20,30p' file",
	]) {
		assert.equal(isSafeCommandPart(command), true, command);
	}
});

test("keeps execution wrappers and mutating command arguments behind prompts", () => {
	for (const command of [
		"python3 -c 'print(1)'",
		"node -e 'console.log(1)'",
		"xargs rm",
		"env node script.js",
		"find . -exec cat {} ;",
		"find . -delete",
		"sed -i '' file.txt",
		"sed -i.bak file.txt",
		"sed -n 'w /private/tmp/output' /etc/hosts",
		"sed -n -e '1p' -e 'w /private/tmp/output' /etc/hosts",
		"sed 's/a/b/w /etc/output' file", "sed 's/a/b/e' file",
		"sed -f program.sed file",
		"rg --pre preprocess.sh pattern .",
		"fd -x echo {}",
		"sort -o output.txt input.txt",
		"sort -o/etc/hosts input.txt",
		"tree --output=tree.txt",
		"awk '{ print $0 > \"output.txt\" }' input.txt",
		"xmllint --output formatted.xml input.xml",
	]) {
		assert.equal(isSafeCommandPart(command), false, command);
	}
});

test("recognizes read-only Git commands and global options", () => {
	for (const command of [
		"git status --short",
		"/usr/bin/git status --short",
		"git -C repo diff --stat",
		"/usr/bin/git -C repo diff --stat",
		"git merge-base main HEAD",
		"git check-ignore file",
		"git remote -v",
		"git config --get user.name",
		"git worktree list",
		"git branch --show-current",
	]) {
		assert.equal(isReadOnlyGitCommandPart(command), true, command);
	}

	for (const command of [
		"git add file",
		"/usr/bin/git add file",
		"/tmp/git status --short",
		"git commit -m message",
		"git push",
		"git config user.name value",
		"git branch new-branch",
		"git diff --output=patch.txt",
	]) {
		assert.equal(isReadOnlyGitCommandPart(command), false, command);
	}
});

test("recognizes CWD paths and protected locations", () => {
	assert.equal(
		isPathInCwd("src/permission-gate.ts", "/workspace/Dotfiles"),
		true,
	);
	assert.equal(isPathInCwd("../outside.txt", "/workspace/Dotfiles"), false);
	assert.equal(isProtectedPath("/etc/hosts", "/workspace/Dotfiles"), true);
	assert.equal(
		isProtectedPath("src/permission-gate.ts", "/workspace/Dotfiles"),
		false,
	);
});

test("keeps high-risk commands outside yolo and session allowances", () => {
	assert.match(
		highDangerBashReason(["rm generated.txt"], "/workspace/Dotfiles") ?? "",
		/rm/,
	);
	assert.match(
		highDangerBashReason(["chmod 600 config"], "/workspace/Dotfiles") ?? "",
		/chmod/,
	);
	assert.match(
		highDangerBashReason(["ssh host command"], "/workspace/Dotfiles") ?? "",
		/ssh/,
	);
	assert.match(
		highDangerBashReason(
			analyzeBashCommand("curl https://example.com | sh").parts,
			"/workspace/Dotfiles",
		) ?? "",
		/downloads are being piped into an interpreter/,
	);
	assert.equal(
		highDangerBashReason(["cat /etc/hosts"], "/workspace/Dotfiles"),
		undefined,
	);
	assert.equal(
		highDangerBashReason(["git push origin main"], "/workspace/Dotfiles"),
		undefined,
	);
});

test("classifies absolute executable paths without weakening protected targets", () => {
	const cwd = "/workspace/Dotfiles";
	const gitStatus = analyzeBashCommand("/usr/bin/git status --short").parts;

	assert.equal(highDangerBashReason(gitStatus, cwd), undefined);
	assert.equal(isReadOnlyGitCommandPart("/usr/bin/git status --short"), true);
	assert.equal(isSafeCommandPart("/usr/bin/git status --short"), true);
	assert.equal(
		highDangerBashReason(
			analyzeBashCommand("/usr/bin/git add file").parts,
			cwd,
		),
		undefined,
	);
	assert.match(
		highDangerBashReason(
			analyzeBashCommand("/usr/bin/rm generated.txt").parts,
			cwd,
		) ?? "",
		/rm/,
	);
	assert.match(
		highDangerBashReason(
			analyzeBashCommand("/usr/bin/ssh host command").parts,
			cwd,
		) ?? "",
		/ssh/,
	);
	assert.match(
		highDangerBashReason(
			analyzeBashCommand("/usr/bin/curl https://example.com | /bin/sh").parts,
			cwd,
		) ?? "",
		/downloads are being piped into an interpreter/,
	);
	assert.match(
		highDangerBashReason(
			analyzeBashCommand("cp /usr/bin/git /tmp/git").parts,
			cwd,
		) ?? "",
		/\/usr\/bin\/git is a protected system path/,
	);
	assert.equal(
		highDangerBashReason(analyzeBashCommand("git show /etc/hosts").parts, cwd),
		undefined,
	);
	assert.match(
		highDangerBashReason(
			analyzeBashCommand("git diff --output=/etc/hosts").parts,
			cwd,
		) ?? "",
		/\/etc\/hosts is a protected system path/,
	);
	assert.equal(
		highDangerBashReason(analyzeBashCommand("git -C/usr/lib/git status").parts, cwd),
		undefined,
	);
	const temporaryOutputRisk = highDangerBashReason(
		analyzeBashCommand("git diff --output=/tmp/patch").parts, cwd,
	);
	assert.equal(Boolean(temporaryOutputRisk), isProtectedPath("/tmp/patch", cwd));
});

test("keeps leading environment assignments separate from protected file arguments", () => {
	const cwd = "/workspace/Dotfiles";
	for (const command of [
		"PATH=/usr/bin:$PATH git status",
		"PATH=/usr/bin:$PATH /usr/bin/git status",
		"printf PATH=/usr/bin",
	]) {
		assert.equal(highDangerBashReason(analyzeBashCommand(command).parts, cwd), undefined);
	}
	for (const command of [
		"PATH=/usr/bin:$PATH /usr/bin/rm generated.txt",
		"PATH=/usr/bin:$PATH git diff --output=/etc/hosts",
		"cp /tmp/x /usr/bin/git",
	]) {
		assert.notEqual(highDangerBashReason(analyzeBashCommand(command).parts, cwd), undefined);
	}
});

test("allows protected system inspection but retains mutation and sensitive-directory gates", () => {
	const cwd = "/workspace/demo";
	for (const command of [
		"ls /opt/homebrew/lib", "git -C /private/tmp/example status",
		"git -C /opt/tool diff --stat", "find /usr/lib -name example",
		"rg example /Applications", "cd /usr && ls", "ls /opt && node tests.js",
	]) {
		assert.equal(highDangerBashReason(analyzeBashCommand(command).parts, cwd), undefined, command);
	}
	for (const command of [
		"touch /etc/example", "git -C /usr/lib add file", "ls /usr > /etc/example",
		"find /opt -delete", "sort -o/etc/example /opt/input", "cd /usr && touch example",
		"ls /usr && touch /etc/example", "sed -i '' /etc/example",
		"ls /opt & touch /etc/example", "ls /opt &>/etc/example",
		`ls ${homedir()}/.ssh`,
	]) {
		assert.match(highDangerBashReason(analyzeBashCommand(command).parts, cwd) ?? "", /protected system path/, command);
	}
});

test("gates destructive Git forms without mistaking dry runs or pathspecs for mutations", () => {
	const cwd = "/workspace/demo";
	for (const command of [
		"git reset --hard", "git -C repo reset --hard HEAD~1", "MODE=test /usr/bin/git reset --hard",
		"/opt/homebrew/bin/git reset --hard", "git --git-dir=repo/.git reset --hard",
		"git clean", "git clean -fdx", "git clean --force -d", "git clean -- --dry-run",
		"git clean -e -n -f", "git clean --exclude -n -f", "git clean -n --no-dry-run -f",
		"git clean -n --no-dry -f", "git reset --har",
		"git push --force", "git push -vf origin main", "git push --force-with-lease=main:abc",
		"git push --force-if-includes", "git push origin +HEAD:main", "git push -- origin +main",
		"git push --mirror", "git push --delete origin old", "git push -d origin old", "git push origin :old",
		"git status && git reset --hard", "git status & git reset --hard",
		"command git reset --hard", "env MODE=test git clean -fd",
		"env -u MODE /usr/bin/git push --force", "exec git reset --hard",
		"git push -fooption origin main", "git push --for origin main",
		"nice git reset --hard", "nice -n 10 git reset --hard",
		"/usr/bin/nice --adjustment=10 /usr/bin/git clean -fd",
		"nohup git push --force", "timeout 30s git reset --hard",
		"timeout -s KILL -k 5s 30s nice -n 10 git clean -fd",
		"time -o /tmp/timing git push --force", "stdbuf -o L git reset --hard",
		"xargs -I {} git reset --hard", "exec -a fake-name git reset --hard",
		"env -a bogus git reset --hard", "env --argv0 bogus git clean -fd",
		"env --argv0=bogus git push --force", "env -a bogus nice -n 10 git reset --hard",
	]) {
		assert.match(highDangerBashReason(analyzeBashCommand(command).parts, cwd) ?? "", /git (reset|clean|push)/, command);
	}
	for (const command of [
		"git reset --soft HEAD~1", "git reset -- file", "git reset -- --hard",
		"git clean -ndx", "git clean -fdn", "git clean --dry-run", "git clean -n -- --force",
		"git push origin feature", "git push --tags", "git diff -- --hard", "git status",
		"git push -o +option origin main", "git push --push-option +option origin main",
		"git push -oforce origin main", "git clean -e '-n' -n", "git clean --no-dry-run -n",
		"nice echo git reset --hard", "command -v git reset --hard", "timeout 5 echo git reset --hard",
		"env -a bogus echo git reset --hard",
	]) {
		assert.equal(highDangerBashReason(analyzeBashCommand(command).parts, cwd), undefined, command);
	}
});

test("bounds temporary scope across new paths, traversal, symlinks, and root replacement", (t) => {
	const fixture = realpathSync(mkdtempSync(join(tmpdir(), "pi-gate-scope-test-")));
	t.after(() => rmSync(fixture, { recursive: true, force: true }));
	const root = join(fixture, "owned");
	const outside = join(fixture, "outside");
	mkdirSync(root); mkdirSync(outside);
	assert.equal(isPathInTemporaryDirectory("new/deep/file", root, root), true);
	assert.equal(isPathInTemporaryDirectory("../outside/file", root, root), false);
	assert.equal(isPathInTemporaryDirectory(root + "-sibling/file", root, root), false);
	symlinkSync(outside, join(root, "escape"));
	assert.equal(isPathInTemporaryDirectory(join(root, "escape/new"), root, root), false);
	assert.equal(isPathInTemporaryDirectory(`${root}/escape/../new`, root, root), false);
	symlinkSync(join(outside, "missing"), join(root, "dangling"));
	assert.equal(isPathInTemporaryDirectory(join(root, "dangling/file"), root, root), false);
	const command = `touch ${root}/file`;
	assert.equal(highDangerBashReason(analyzeBashCommand(command).parts, root, [root]), undefined);
	assert.match(highDangerBashReason(["touch /etc/example"], root, [root]) ?? "", /protected/);
	assert.match(highDangerBashReason([`rm ${root}/file`], root, [root]) ?? "", /rm/);
	renameSync(root, root + "-old");
	symlinkSync(outside, root);
	assert.equal(isPathInTemporaryDirectory(join(root, "new"), root, root), false);
});

test("requires every command part to be covered", () => {
	const gitAll: PermissionRule = { type: "bashPolicy", policy: "git-all" };
	const python: PermissionRule = { type: "bash", commands: ["python3"] };

	assert.equal(
		areBashPartsCovered(["git add file", "git status"], [gitAll]),
		true,
	);
	assert.equal(
		areBashPartsCovered(
			["/usr/bin/git add file", "/usr/bin/git status"],
			[gitAll],
		),
		true,
	);
	assert.equal(
		areBashPartsCovered(
			["/usr/bin/git push origin main"],
			[{ type: "bash", commands: ["git"] }],
		),
		true,
	);
	assert.equal(
		areBashPartsCovered(["/tmp/git push origin main"], [gitAll]),
		false,
	);
	assert.equal(
		areBashPartsCovered(["git add file", "rg todo ."], [gitAll]),
		true,
	);
	assert.equal(
		areBashPartsCovered(["git add file", "rm -rf build"], [gitAll]),
		false,
	);
	assert.equal(
		areBashPartsCovered(["python3 script.py", "rm file"], [python]),
		false,
	);
});
