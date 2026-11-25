/**
 * Permission gate for file writes and bash commands.
 *
 * Commands:
 *   /readonly    Toggle hard block on all writes + restrict bash to allowlist
 *   /yolo        Auto-allow ordinary operations (sensitive and high-risk work stays gated)
 *   /rules       Show active session permission rules
 *   /reset-rules Clear all session permission rules
 *
 * Default mode: allows writes and edits inside the working directory, then
 * prompts for other file operations and unrecognized bash commands.
 * Prompt-local hotkeys approve once, enable session YOLO, deny, or open narrower rules.
 *
 * Chained bash commands (cd && ls) are split with quote awareness, each part
 * is checked, and all command patterns (cd, ls) are listed in the rule UI.
 * Complex shell syntax and command families that can execute arbitrary code
 * stay behind an explicit permission prompt.
 *
 * SECURITY NOTE: This is a convenience gate, not a security sandbox. The
 * analysis is conservative but is not a complete shell parser. The LLM already
 * has full shell access; this extension surfaces risky operations before they run.
 */

import { lstatSync, realpathSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { PermissionChoice } from "./lib/permission-prompt.ts";

// Commands with predictable, inspection-only behavior. Commands that can
// execute another program or mutate through their own arguments are handled by
// explicit validators below or left behind the permission prompt.
const SAFE_INSPECTION_PATTERNS: RegExp[] = [
	/^#.*$/,
	/^cd(\s|$)/,
	/^ls(\s|$)/,
	/^pwd(\s|$)/,
	/^cat(\s|$)/,
	/^head(\s|$)/,
	/^tail(\s|$)/,
	/^wc(\s|$)/,
	/^file(\s|$)/,
	/^which(\s|$)/,
	/^type(\s|$)/,
	/^command\s+-v(\s|$)/,
	/^dirname(\s|$)/,
	/^basename(\s|$)/,
	/^realpath(\s|$)/,
	/^readlink(\s|$)/,
	/^stat(\s|$)/,
	/^du(\s|$)/,
	/^tree(\s|$)/,
	/^find(\s|$)/,
	/^grep(\s|$)/,
	/^rg(\s|$)/,
	/^fd(\s|$)/,
	/^sort(\s|$)/,
	/^uniq(\s|$)/,
	/^cut(\s|$)/,
	/^tr(\s|$)/,
	/^awk(\s|$)/,
	/^sed(\s|$)/,
	/^nl(\s|$)/,
	/^ps(\s|$)/,
	/^pgrep(\s|$)/,
	/^echo(\s|$)/,
	/^printf(\s|$)/,
	/^true$/,
	/^false$/,
	/^test(\s|$)/,
	/^\[(\s|$)/,
	/^jq(\s|$)/,
	/^cmp(\s|$)/,
	/^comm(\s|$)/,
	/^uname(\s|$)/,
	/^sw_vers(\s|$)/,
	/^shasum(\s|$)/,
	/^md5(\s|$)/,
	/^xmllint(\s|$)/,
	/^pdfinfo(\s|$)/,
	/^plutil\s+(-lint|-p)(\s|$)/,
];

// These command families are intentionally never inferred as safe. They can
// execute arbitrary code, install packages, use the network, or mutate state.
const HIGH_DANGER_COMMANDS = new Set([
	"chgrp",
	"chmod",
	"chown",
	"dd",
	"diskutil",
	"doas",
	"halt",
	"mkfs",
	"poweroff",
	"reboot",
	"rmdir",
	"rm",
	"shutdown",
	"sudo",
	"unlink",
]);

const REMOTE_EXECUTION_COMMANDS = new Set(["scp", "sftp", "ssh"]);

const PROTECTED_PATH_PREFIXES = [
	"/Applications",
	"/Library",
	"/System",
	"/bin",
	"/boot",
	"/etc",
	"/opt",
	"/private",
	"/sbin",
	"/usr",
	"/var",
];

const PROMPT_ONLY_COMMANDS = new Set([
	".",
	"bash",
	"bun",
	"curl",
	"dash",
	"deno",
	"env",
	"eval",
	"fish",
	"gh",
	"make",
	"node",
	"npm",
	"npx",
	"parallel",
	"perl",
	"pip",
	"pip3",
	"pnpm",
	"python",
	"python3",
	"ruby",
	"sh",
	"source",
	"ssh",
	"uv",
	"uvx",
	"wget",
	"xargs",
	"yarn",
	"zsh",
]);

const READ_ONLY_GIT_COMMANDS = new Set([
	"cat-file",
	"check-ignore",
	"cherry",
	"count-objects",
	"describe",
	"diff",
	"diff-index",
	"diff-tree",
	"for-each-ref",
	"grep",
	"log",
	"ls-files",
	"ls-tree",
	"merge-base",
	"name-rev",
	"rev-list",
	"rev-parse",
	"show",
	"show-ref",
	"status",
]);

// These stores are never inspection targets, including normalized aliases.
const AUTHENTICATION_PATH_PATTERNS: RegExp[] = [
	/(?:^|[\s'"=])\/(?:private\/)?etc\/(?:shadow|gshadow|master\.passwd|security\/opasswd)(?=[\s'";|&)]|$)/,
	/(?:^|[\s'"=])\/(?:private\/)?var\/db\/dslocal\/nodes\/(?:Default|default)\/users(?:\/|[\s'";|&)]|$)/,
];

// Sensitive file access is always blocked, regardless of mode.
const DENY_PATTERNS: RegExp[] = [
	/^(cat|head|tail)\s+.*\.env/,
	/^(cat|head|tail)\s+.*(credentials|secret|password|token)/i,
	/^(cat|head|tail)\s+.*\.(pem|key)(\s|$)/,
	/^(cat|head|tail)\s+.*\.aws\//,
	/^(cat|head|tail)\s+.*\.ssh\/id_/,
	...AUTHENTICATION_PATH_PATTERNS,
];

type BashPolicy = "git-read" | "git-all";

export type PermissionRule =
	| { type: "tool"; tool: string }
	| { type: "directory"; prefix: string }
	| { type: "operation"; tool: string; signature: string }
	| { type: "bash"; commands: string[] }
	| { type: "bashPolicy"; policy: BashPolicy }
	| { type: "yolo" };

interface SessionRules {
	allow: PermissionRule[];
	deny: PermissionRule[];
}

export interface BashCommandAnalysis {
	parts: string[];
	complex: boolean;
	reasons: string[];
}

function isShellOperatorBoundary(char: string | undefined): boolean {
	return char === undefined || /\s|[;&|(){}]/.test(char);
}

function isNonMutatingDevNullRedirect(command: string, index: number): boolean {
	const suffix = command.slice(index);
	return (
		/^(?:>>?|<)\s*\/dev\/null(?:\s|$|[;&|])/.test(suffix) || /^>&\d/.test(suffix)
	);
}

/**
 * Split common shell chains without treating quoted separators as operators.
 * This is intentionally conservative rather than a complete shell parser.
 */
export function analyzeBashCommand(command: string): BashCommandAnalysis {
	const parts: string[] = [];
	const reasons = new Set<string>();
	let current = "";
	let quote: "'" | '"' | undefined;
	let escaped = false;

	const pushPart = () => {
		const part = current.trim();
		if (part) parts.push(part);
		current = "";
	};

	for (let i = 0; i < command.length; i++) {
		const char = command[i];
		const next = command[i + 1];

		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}

		if (char === "\\" && quote !== "'") {
			current += char;
			escaped = true;
			continue;
		}

		if (quote) {
			if (quote === '"' && (char === "`" || (char === "$" && next === "("))) {
				reasons.add("command substitution");
			}
			current += char;
			if (char === quote) quote = undefined;
			continue;
		}

		if (char === "'" || char === '"') {
			quote = char;
			current += char;
			continue;
		}

		if (char === "`" || (char === "$" && next === "(")) {
			reasons.add("command substitution");
			current += char;
			continue;
		}

		if (char === "\n") {
			reasons.add("multiline shell");
			pushPart();
			continue;
		}

		if (char === ";") {
			pushPart();
			continue;
		}

		if ((char === "&" && next === "&") || (char === "|" && next === "|")) {
			pushPart();
			i++;
			continue;
		}

		if (char === "|") {
			pushPart();
			continue;
		}

		if (char === "&" && command[i - 1] !== ">") {
			if (next === ">") {
				reasons.add("redirection");
				current += char;
			} else {
				reasons.add("background execution");
				pushPart();
			}
			continue;
		}

		if (
			(char === ">" || char === "<") &&
			!isNonMutatingDevNullRedirect(command, i)
		) {
			reasons.add("redirection");
		}

		if (char === "(" || char === ")") {
			reasons.add("shell grouping");
		}
		if (
			(char === "{" || char === "}") &&
			isShellOperatorBoundary(command[i - 1]) &&
			isShellOperatorBoundary(next)
		) {
			reasons.add("shell grouping");
		}

		current += char;
	}

	pushPart();
	if (quote || escaped) reasons.add("incomplete quoting");

	if (
		parts.some((part) =>
			/^(if|then|elif|else|fi|for|while|until|do|done|case|esac|function)\b/.test(
				part,
			),
		)
	) {
		reasons.add("shell control flow");
	}

	return { parts, complex: reasons.size > 0, reasons: Array.from(reasons) };
}

function splitShellWords(command: string): string[] {
	const words: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let escaped = false;

	const pushWord = () => {
		if (current) words.push(current);
		current = "";
	};

	for (const char of command.trim()) {
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}
		if (char === "\\" && quote !== "'") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (char === quote) quote = undefined;
			else current += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) pushWord();
		else current += char;
	}
	pushWord();
	return words;
}

function commandWordIndex(words: string[]): number | undefined {
	let index = 0;
	while (index < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index])) {
		index++;
	}
	return index < words.length ? index : undefined;
}

function extractCommandPattern(part: string): string | undefined {
	const words = splitShellWords(part);
	const index = commandWordIndex(words);
	return index === undefined ? undefined : words[index];
}

function commandName(command: string): string {
	return basename(command);
}

function isGitExecutable(command: string): boolean {
	return command === "git" || command === "/usr/bin/git";
}

function extractCommandPatterns(parts: string[]): string[] {
	const patterns = new Set<string>();
	for (const part of parts) {
		const token = extractCommandPattern(part);
		if (token) patterns.add(token);
	}
	return Array.from(patterns).sort((a, b) => a.localeCompare(b));
}

// Only proven print-only sed scripts qualify as static inspection. Parsing
// arbitrary sed programs would otherwise miss w/W files and e execution.
function isInspectionSed(part: string): boolean {
	const words = splitShellWords(part).slice(1);
	const scripts: string[] = [];
	let optionsEnded = false;
	for (let index = 0; index < words.length; index++) {
		const word = words[index];
		if (!optionsEnded && word === "--") { optionsEnded = true; continue; }
		if (!optionsEnded && /^-[nEr]+$|^--(?:quiet|silent|regexp-extended)$/.test(word)) continue;
		if (!optionsEnded && ["-e", "--expression"].includes(word)) {
			scripts.push(words[++index] ?? "");
		} else if (!optionsEnded && (word.startsWith("-e") || word.startsWith("--expression="))) {
			scripts.push(word.startsWith("-e") ? word.slice(2) : word.slice(13));
		} else if (!optionsEnded && word.startsWith("-") && word !== "-") {
			return false;
		} else if (scripts.length === 0) scripts.push(word);
	}
	return scripts.length > 0 && scripts.every((script) =>
		/^\s*(?:(?:\d+|\$)(?:\s*,\s*(?:\d+|\$))?\s*)?p\s*$/.test(script));
}

function hasPromptOnlyArguments(part: string): boolean {
	const commandPattern = extractCommandPattern(part);
	if (!commandPattern) return true;
	const command = commandName(commandPattern);
	if (
		PROMPT_ONLY_COMMANDS.has(command) ||
		/^python\d+(?:\.\d+)*$/.test(command)
	) {
		return true;
	}
	if (
		/^find\b/.test(part) &&
		/\s-(delete|exec|execdir|ok|okdir|fprint|fprintf|fls)\b/.test(part)
	) {
		return true;
	}
	if (command === "sed" && !isInspectionSed(part)) return true;
	if (/^rg\b/.test(part) && /(?:^|\s)--pre(?:\s|=|$)/.test(part)) return true;
	if (
		/^fd\b/.test(part) &&
		/(?:^|\s)(?:-x|-X|--exec|--exec-batch)(?:\s|=|$)/.test(part)
	) {
		return true;
	}
	if (/^sort\b/.test(part) && /(?:^|\s)(?:-o\S*|--output(?:=\S*)?)(?:\s|$)/.test(part))
		return true;
	if (
		/^tree\b/.test(part) &&
		/(?:^|\s)(?:-o\S*|--output(?:=\S*)?)(?:\s|$)/.test(part)
	) {
		return true;
	}
	if (/^file\b/.test(part) && /(?:^|\s)(?:-C|--compile)(?:\s|$)/.test(part))
		return true;
	if (
		/^awk\b/.test(part) &&
		(/\bsystem\s*\(|\|\s*getline\b/.test(part) || />/.test(part))
	) {
		return true;
	}
	if (
		/^xmllint\b/.test(part) &&
		/(?:^|\s)(?:--shell|--output)(?:\s|=|$)/.test(part)
	) {
		return true;
	}
	return false;
}

function gitSubcommandIndex(words: string[]): number | undefined {
	if (!words[0] || !isGitExecutable(words[0])) return undefined;
	const optionsWithValues = new Set([
		"-C",
		"-c",
		"--config-env",
		"--git-dir",
		"--namespace",
		"--work-tree",
	]);
	let index = 1;
	while (index < words.length) {
		const word = words[index];
		if (word === "--") return index + 1;
		if (optionsWithValues.has(word)) {
			index += 2;
			continue;
		}
		if (/^--(config-env|git-dir|namespace|work-tree)=/.test(word)) {
			index++;
			continue;
		}
		if (word.startsWith("-")) {
			index++;
			continue;
		}
		return index;
	}
	return undefined;
}

export function isReadOnlyGitCommandPart(part: string): boolean {
	const words = splitShellWords(part);
	const subcommandIndex = gitSubcommandIndex(words);
	if (subcommandIndex === undefined || subcommandIndex >= words.length)
		return false;
	const subcommand = words[subcommandIndex];
	const args = words.slice(subcommandIndex + 1);

	if (
		args.some((arg) => /^(--output(?:=|$)|--ext-diff$|--textconv$)/.test(arg))
	) {
		return false;
	}
	if (READ_ONLY_GIT_COMMANDS.has(subcommand)) return true;
	if (subcommand === "remote") {
		return (
			args.length === 0 ||
			args.every((arg) => ["-v", "--verbose"].includes(arg)) ||
			args[0] === "get-url"
		);
	}
	if (subcommand === "config") {
		if (
			args.some((arg) =>
				/^(--add|--edit|--remove-section|--rename-section|--replace-all|--unset|--unset-all|set|unset|rename-section|remove-section)$/.test(
					arg,
				),
			)
		) {
			return false;
		}
		if (
			args.some((arg) =>
				/^(--get|--get-all|--get-regexp|--get-urlmatch|--list|get|get-all|get-regexp|get-urlmatch|list)$/.test(
					arg,
				),
			)
		) {
			return true;
		}
		return args.filter((arg) => !arg.startsWith("-")).length === 1;
	}
	if (subcommand === "worktree") return args[0] === "list";
	if (subcommand === "stash") return args[0] === "list" || args[0] === "show";
	if (subcommand === "tag") {
		return (
			args.length === 0 || args.some((arg) => arg === "-l" || arg === "--list")
		);
	}
	if (subcommand === "branch") {
		if (
			args.some((arg) =>
				/^(-d|-D|-m|-M|-c|-C|--delete|--move|--copy|--edit-description|--set-upstream-to|--unset-upstream)(?:=|$)/.test(
					arg,
				),
			)
		) {
			return false;
		}
		const hasListMode = args.some((arg) => arg === "-l" || arg === "--list");
		const positional = args.filter((arg) => !arg.startsWith("-"));
		return positional.length === 0 || hasListMode;
	}
	if (subcommand === "reflog") {
		return !args.some((arg) =>
			["delete", "drop", "expire", "write"].includes(arg),
		);
	}
	return false;
}

function isAllGitCommandPart(part: string): boolean {
	const command = splitShellWords(part)[0];
	return Boolean(command && isGitExecutable(command));
}

export function canInferCommandSafety(analysis: BashCommandAnalysis): boolean {
	return analysis.reasons.every((reason) => reason === "multiline shell");
}

export function isSafeCommandPart(part: string): boolean {
	if (hasPromptOnlyArguments(part)) return false;
	if (isReadOnlyGitCommandPart(part)) return true;
	if (/^date(?:\s|$)/.test(part)) {
		const args = splitShellWords(part).slice(1);
		return args.every(
			(arg) => arg === "-u" || arg === "-j" || arg.startsWith("+"),
		);
	}
	return SAFE_INSPECTION_PATTERNS.some((pattern) => pattern.test(part));
}

function absolutePathArgument(word: string): string | undefined {
	if (word.startsWith("/")) return word;

	const equalsIndex = word.indexOf("=");
	if (equalsIndex >= 0 && word[equalsIndex + 1] === "/") {
		return word.slice(equalsIndex + 1);
	}

	return word.match(/^-[A-Za-z]+(\/.*)$/)?.[1];
}

// Keep option values out of risk flags: clean -e -n excludes the filename
// '-n'; it is not a dry run. Expand short clusters only until a valued option.
function gitRiskArguments(args: string[], subcommand: string): { options: string[]; operands: string[] } {
	const shortValues = subcommand === "clean" ? ["e"] : subcommand === "push" ? ["o"] : [];
	const longValues = subcommand === "clean" ? ["--exclude"] : subcommand === "push"
		? ["--push-option", "--repo", "--receive-pack", "--exec"] : ["--pathspec-from-file"];
	const options: string[] = [];
	const operands: string[] = [];
	let positional = false;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (positional || !arg.startsWith("-") || arg === "-") { operands.push(arg); continue; }
		if (arg === "--") { positional = true; continue; }
		if (arg.startsWith("--")) {
			options.push(arg);
			if (!arg.includes("=") && longValues.some((option) => option.startsWith(arg))) index++;
			continue;
		}
		for (let offset = 1; offset < arg.length; offset++) {
			const flag = arg[offset];
			options.push(`-${flag}`);
			if (shortValues.includes(flag)) {
				if (offset === arg.length - 1) index++;
				break;
			}
		}
	}
	return { options, operands };
}

const EXECUTION_WRAPPER_VALUE_OPTIONS: Record<string, readonly string[]> = {
	command: [],
	env: ["-u", "--unset", "-C", "--chdir", "-a", "--argv0"],
	exec: ["-a"],
	nice: ["-n", "--adjustment"],
	nohup: [],
	time: ["-o", "--output", "-f", "--format"],
	timeout: ["-k", "--kill-after", "-s", "--signal"],
	gtimeout: ["-k", "--kill-after", "-s", "--signal"],
	stdbuf: ["-i", "--input", "-o", "--output", "-e", "--error"],
	xargs: ["-a", "--arg-file", "-E", "-I", "-L", "-n", "--max-args", "-P", "--max-procs", "-s", "--max-chars"],
};

function unwrappedCommandIndex(words: string[]): number | undefined {
	let index = commandWordIndex(words);
	// Do not search arbitrary operands or quoted scripts for the word git.
	while (index !== undefined) {
		const wrapper = commandName(words[index]);
		if (!Object.hasOwn(EXECUTION_WRAPPER_VALUE_OPTIONS, wrapper)) return index;
		const valuedOptions = EXECUTION_WRAPPER_VALUE_OPTIONS[wrapper];
		let next = index + 1;
		while (next < words.length) {
			const word = words[next];
			if (wrapper === "command" && ["-v", "-V"].includes(word)) return undefined;
			if (word === "--") { next++; break; }
			if (valuedOptions.includes(word)) next += 2;
			else if (word.startsWith("-") || wrapper === "env" && /^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) next++;
			else break;
		}
		// timeout's first positional argument is a duration, not the executable.
		if (wrapper === "timeout" || wrapper === "gtimeout") next++;
		index = next < words.length ? next : undefined;
	}
	return undefined;
}

function destructiveGitReason(words: string[]): string | undefined {
	const commandIndex = unwrappedCommandIndex(words);
	if (commandIndex === undefined || commandName(words[commandIndex]) !== "git")
		return undefined;
	// Risk checks also cover alternate absolute Git executables and env assignments.
	const gitWords = ["git", ...words.slice(commandIndex + 1)];
	const index = gitSubcommandIndex(gitWords);
	if (index === undefined) return undefined;
	const subcommand = gitWords[index];
	const { options, operands } = gitRiskArguments(gitWords.slice(index + 1), subcommand);
	if (subcommand === "reset" && options.some((option) => option.startsWith("--") && "--hard".startsWith(option))) {
		return "git reset --hard discards uncommitted work";
	}
	if (subcommand === "clean") {
		let dryRun = false;
		let understood = true;
		for (const option of options) {
			if (option === "-n" || option === "--dry-run") dryRun = true;
			else if (option === "--no-dry-run") dryRun = false;
			else if (!/^-[dfiqxXe]$|^--(?:force|interactive|quiet|exclude(?:=.*)?)$/.test(option)) understood = false;
		}
		if (!dryRun || !understood) return "git clean can permanently delete untracked files";
	}
	if (
		subcommand === "push" &&
		(options.some((arg) => arg === "-f" || arg === "-d" ||
			arg.startsWith("--") && ["--force", "--force-with-lease", "--force-if-includes", "--mirror", "--delete"]
				.some((option) => option.startsWith(arg.split("=")[0])),
		) || operands.some((arg) => arg.startsWith("+") || arg.startsWith(":")))
	) {
		return "git push can overwrite or delete remote history";
	}
	return undefined;
}

export function highDangerBashReason(
	parts: string[],
	cwd: string,
	temporaryDirectories: readonly string[] = [],
): string | undefined {
	const commandTokens = parts.flatMap((part) => {
		const command = extractCommandPattern(part);
		return command ? [commandName(command)] : [];
	});
	if (
		commandTokens.some((command) => ["curl", "wget"].includes(command)) &&
		commandTokens.some((command) =>
			["bash", "dash", "fish", "node", "python", "python3", "sh", "zsh"].includes(
				command,
			),
		)
	) {
		return "downloads are being piped into an interpreter";
	}

	const inspectionOnly = parts.every((part) =>
		canInferCommandSafety(analyzeBashCommand(part)) && isSafeCommandPart(part),
	);
	for (const part of parts) {
		const words = splitShellWords(part);
		const gitReason = destructiveGitReason(words);
		if (gitReason) return gitReason;
		const commandIndex = commandWordIndex(words);
		const rawCommand = commandIndex === undefined ? undefined : words[commandIndex];
		const command = rawCommand ? commandName(rawCommand) : undefined;
		if (command && HIGH_DANGER_COMMANDS.has(command)) {
			return `${command} can delete files, change permissions, or alter the system`;
		}
		if (command && REMOTE_EXECUTION_COMMANDS.has(command)) {
			return `${command} can execute or transfer data on another machine`;
		}
		// Inspection does not modify protected arguments. A cd only qualifies if
		// the whole chain is inspection-only, since it changes later targets.
		const inspection = (command !== "cd" || inspectionOnly) &&
			canInferCommandSafety(analyzeBashCommand(part)) && isSafeCommandPart(part);
		// Leading environment assignments and the executable are not file targets.
		const protectedPath = words
			.map((word, index) =>
				commandIndex !== undefined && index <= commandIndex
					? undefined
					: absolutePathArgument(word),
			)
			.find((path) => {
				if (path === undefined || !isProtectedPath(path, cwd)) return false;
				if (isSensitiveDirectory(path, cwd)) return true;
				return !inspection && !temporaryDirectories.some((directory) =>
					isPathInTemporaryDirectory(path, cwd, directory));
			});
		if (protectedPath) {
			return `${protectedPath} is a protected system path`;
		}
	}
	return undefined;
}

function isBashRule(rule: PermissionRule): boolean {
	return rule.type === "bash" || rule.type === "bashPolicy";
}

export function bashRuleMatchesPart(
	rule: PermissionRule,
	part: string,
): boolean {
	if (rule.type === "bash") {
		const command = extractCommandPattern(part);
		return command
			? rule.commands.includes(command) ||
				rule.commands.includes("git") && isGitExecutable(command)
			: false;
	}
	if (rule.type === "bashPolicy") {
		return rule.policy === "git-read"
			? isReadOnlyGitCommandPart(part)
			: isAllGitCommandPart(part);
	}
	return false;
}

export function areBashPartsCovered(
	parts: string[],
	rules: PermissionRule[],
): boolean {
	return (
		parts.length > 0 &&
		parts.every(
			(part) =>
				isSafeCommandPart(part) ||
				rules.some((rule) => isBashRule(rule) && bashRuleMatchesPart(rule, part)),
		)
	);
}

function getScopeDirectory(path: string | undefined, cwd: string): string | undefined {
	if (!path) return undefined;
	const directory = dirname(resolvePath(path, cwd));
	return directory === "/" ? undefined : directory;
}

function scopePathForDirectory(dir?: string): string | undefined {
	if (!dir) return undefined;
	const normalized = dir.replace(/\/+$/, "") || "/";
	return normalized === "/"
		? "/__pi_permission_gate_scope__"
		: `${normalized}/__pi_permission_gate_scope__`;
}

function pathStartsWith(path: string, prefix: string): boolean {
	const n = path.replace(/\/$/, "");
	const p = prefix.replace(/\/$/, "");
	return n === p || n.startsWith(p + "/");
}

function resolvePath(path: string, cwd: string): string {
	return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
}

export function isPathInCwd(path: string, cwd: string): boolean {
	return pathStartsWith(resolvePath(path, cwd), resolve(cwd));
}

// Resolve existing components before processing '..', matching symlink
// traversal in shell paths. Missing components may be new write targets.
// This inspects metadata only and is not protection against filesystem races.
function canonicalPath(path: string): string | undefined {
	const absolute = isAbsolute(path) ? path : `${process.cwd()}/${path}`;
	let current = "/";
	for (const component of absolute.split("/")) {
		if (!component || component === ".") continue;
		if (component === "..") { current = dirname(current); continue; }
		const candidate = resolve(current, component);
		try {
			current = realpathSync(candidate);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined;
			try {
				// A dangling symlink is not a creatable in-scope path.
				if (lstatSync(candidate).isSymbolicLink()) return undefined;
			} catch (statError) {
				if ((statError as NodeJS.ErrnoException).code !== "ENOENT") return undefined;
			}
			current = candidate;
		}
	}
	return current;
}

function isSensitiveDirectory(path: string, cwd: string): boolean {
	const resolved = resolvePath(path, cwd);
	const canonical = canonicalPath(isAbsolute(path) ? path : `${cwd}/${path}`);
	return [resolved, canonical].some((target) => target !== undefined &&
		[".ssh", ".aws"].some((directory) => pathStartsWith(target, resolve(homedir(), directory))));
}

export function isPathInTemporaryDirectory(path: string, cwd: string, directory: string): boolean {
	const target = canonicalPath(isAbsolute(path) ? path : `${cwd}/${path}`);
	const root = resolve(directory);
	return target !== undefined && canonicalPath(root) === root && pathStartsWith(target, root);
}

function hasSensitiveBashAccess(command: string, parts: string[], cwd: string): boolean {
	if ([command, ...parts].some((part) => DENY_PATTERNS.some((pattern) => pattern.test(part)))) return true;
	let directory = cwd;
	for (const part of parts) {
		const words = splitShellWords(part);
		const index = commandWordIndex(words);
		if (index === undefined) continue;
		const args = words.slice(index + 1);
		for (const word of args) {
			const path = absolutePathArgument(word) ?? (!word.startsWith("-") ? word : undefined);
			if (!path) continue;
			// Normalize dot components before inspection exemptions. Check the
			// lexical path first, without touching authentication-store contents.
			const normalized = resolvePath(path, directory);
			if (AUTHENTICATION_PATH_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
			const canonical = canonicalPath(isAbsolute(path) ? path : `${directory}/${path}`);
			if (canonical && AUTHENTICATION_PATH_PATTERNS.some((pattern) => pattern.test(canonical))) return true;
		}
		// A simple cd changes the meaning of relative arguments later in a chain.
		if (words[index] === "cd") {
			const target = args.at(-1);
			if (target && !target.startsWith("-")) directory = resolvePath(target, directory);
		}
	}
	return false;
}

export function isProtectedPath(path: string, cwd: string): boolean {
	const resolved = resolvePath(path, cwd);
	const canonical = canonicalPath(isAbsolute(path) ? path : `${cwd}/${path}`);
	return isSensitiveDirectory(path, cwd) || [resolved, canonical].some((target) =>
		target !== undefined && PROTECTED_PATH_PREFIXES.some((prefix) => pathStartsWith(target, prefix)));
}

export type PermissionNotificationRoute = "osc777" | "cmux" | "macos";

export function selectPermissionNotificationRoute(
	mode: string,
	env: Record<string, string | undefined>,
	options: { isTTY: boolean; platform: string },
): PermissionNotificationRoute | undefined {
	const inCmux = Boolean(env.CMUX_SURFACE_ID || env.CMUX_WORKSPACE_ID);
	const isGhostty = env.TERM_PROGRAM?.toLowerCase() === "ghostty";

	// tmux does not forward OSC sequences by default, so use the OS fallback there.
	if (
		mode === "tui" &&
		options.isTTY &&
		!env.TMUX &&
		(inCmux || isGhostty)
	) {
		return "osc777";
	}
	if (inCmux) return "cmux";
	if (options.platform === "darwin") return "macos";
	return undefined;
}

export function formatOsc777Notification(title: string, body: string): string {
	const clean = (value: string) =>
		value
			.replace(/[;\x00-\x1f\x7f-\x9f]/g, " ")
			.replace(/\s+/g, " ")
			.trim();

	return `\x1b]777;notify;${clean(title)};${clean(body)}\x07`;
}

export function formatAppleScriptNotification(title: string, body: string): string {
	const quote = (value: string) =>
		`"${value
			.replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
			.replace(/\\/g, "\\\\")
			.replace(/"/g, '\\"')
			.replace(/\s+/g, " ")}"`;

	return `display notification ${quote(body)} with title ${quote(title)}`;
}

interface NotificationOutput {
	write(chunk: string, callback: (error?: Error | null) => void): boolean;
	once(event: "error", listener: (error: Error) => void): NotificationOutput;
	removeListener(event: "error", listener: (error: Error) => void): NotificationOutput;
}

export function writeNotificationSequence(
	output: NotificationOutput,
	sequence: string,
): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (success: boolean) => {
			if (settled) return;
			settled = true;
			output.removeListener("error", onError);
			resolve(success);
		};
		const onError = () => finish(false);

		output.once("error", onError);
		try {
			output.write(sequence, (error) => finish(!error));
		} catch {
			finish(false);
		}
	});
}

function unreachable(value: never): never {
	throw new Error(`Unhandled permission rule: ${JSON.stringify(value)}`);
}

export default function (pi: ExtensionAPI) {
	let readonly = false;
	let yolo = false;
	const temporaryDirectories = new Set<string>();
	// Session rules are intentionally ephemeral — they reset between Pi sessions.
	let rules: SessionRules = { allow: [], deny: [] };

	// ─── Commands ─────────────────────────────────────────────────────

	pi.registerCommand("readonly", {
		description: "Toggle read-only mode — blocks all file writes",
		handler: async (_args, ctx) => {
			readonly = !readonly;
			if (readonly && yolo) yolo = false;
			updateStatus(ctx);
			ctx.ui.notify(
				readonly
					? "Read-only mode on. Writes and edits are blocked."
					: "Read-only mode off. CWD writes and edits allow automatically.",
				"info",
			);
		},
	});

	pi.registerCommand("yolo", {
		description: "Toggle yolo mode — auto-allow ordinary operations",
		handler: async (_args, ctx) => {
			if (!yolo) {
				enableYolo(ctx);
				return;
			}
			yolo = false;
			updateStatus(ctx);
			ctx.ui.notify(
				yolo
					? "Yolo mode on. Ordinary operations auto-allow; high-risk operations still confirm."
					: "Yolo mode off. Prompts restored.",
				"info",
			);
		},
	});

	pi.registerCommand("rules", {
		description: "Show active session permission rules",
		handler: async (_args, ctx) => {
			const lines: string[] = [];
			if (readonly) lines.push("🔒 Read-only mode: ON");
			if (yolo) lines.push("⚡ Yolo mode: ON");
			if (rules.allow.length > 0) {
				lines.push("Allow rules:");
				for (const r of rules.allow) lines.push(`  • ${formatRule(r)}`);
			}
			if (rules.deny.length > 0) {
				lines.push("Deny rules:");
				for (const r of rules.deny) lines.push(`  • ${formatRule(r)}`);
			}
			if (lines.length === 0) {
				ctx.ui.notify("No session rules active.", "info");
				return;
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("reset-rules", {
		description: "Clear all session permission rules",
		handler: async (_args, ctx) => {
			yolo = false;
			readonly = false;
			rules = { allow: [], deny: [] };
			temporaryDirectories.clear();
			updateStatus(ctx);
			ctx.ui.notify(
				"Session permission rules cleared. Rules are ephemeral and reset between sessions.",
				"info",
			);
		},
	});

	function enableYolo(ctx: ExtensionContext) {
		yolo = true;
		readonly = false;
		rules = { allow: [], deny: [] };
		updateStatus(ctx);
		ctx.ui.notify("YOLO on for this session. Ordinary operations auto-approve; risky operations still ask.", "info");
	}

	function updateStatus(ctx: ExtensionContext) {
		const parts: string[] = [];
		if (readonly) parts.push("readonly");
		if (yolo) parts.push("yolo");
		if (rules.allow.length > 0) parts.push(`+${rules.allow.length}`);
		if (rules.deny.length > 0) parts.push(`-${rules.deny.length}`);
		ctx.ui.setStatus("permission-gate", parts.length ? parts.join(" | ") : "ask");
	}

	pi.on("session_start", (_event, ctx) => {
		if (ctx.hasUI) updateStatus(ctx);
	});

	pi.on("before_agent_start", (event) => {
		if (!yolo) return;
		return { systemPrompt: `${event.systemPrompt}\nPermission gate: YOLO permits ordinary operations. For scratch work, use a standalone mktemp -d Bash call; its successful output registers a session-owned temporary directory. Protected system mutations and destructive Git still require one-time approval.` };
	});

	// Only standalone mktemp -d results establish session-owned scratch roots.
	// Do not infer ownership from arbitrary output, path names, or all of /tmp.
	pi.on("tool_result", (event) => {
		if (event.toolName !== "bash" || event.isError ||
			!/^(?:\/usr\/bin\/)?mktemp -d$/.test(String(event.input.command ?? "").trim())) return;
		const output = event.content.filter((item) => item.type === "text")
			.map((item) => item.text).join("").trim();
		if (!isAbsolute(output) || /[\r\n]/.test(output)) return;
		const directory = canonicalPath(output);
		if (!directory) return;
		const roots = [tmpdir(), "/tmp"].map(canonicalPath);
		if (!roots.some((root) => root !== undefined && directory !== root && pathStartsWith(directory, root))) return;
		try {
			const info = statSync(directory);
			if (info.isDirectory() && (process.getuid === undefined || info.uid === process.getuid())) {
				temporaryDirectories.add(directory);
			}
		} catch { /* A removed or inaccessible directory is not a scratch root. */ }
	});

	// ─── Rule helpers ─────────────────────────────────────────────────

	function getPermissionDecision(
		toolName: string,
		path?: string,
		parts?: string[],
		allowBashRules = true,
		operationSignature?: string,
	): { decision: "allow" | "deny" | "prompt"; matchedRule?: string } {
		if (yolo) return { decision: "allow" };

		for (const rule of rules.deny) {
			if (matchRule(rule, toolName, path, parts, operationSignature)) {
				return { decision: "deny", matchedRule: formatRule(rule) };
			}
		}

		for (const rule of rules.allow) {
			if (
				!isBashRule(rule) &&
				matchRule(rule, toolName, path, parts, operationSignature)
			) {
				return { decision: "allow", matchedRule: formatRule(rule) };
			}
		}

		if (
			toolName === "bash" &&
			allowBashRules &&
			parts &&
			areBashPartsCovered(parts, rules.allow)
		) {
			return { decision: "allow", matchedRule: "covered bash commands" };
		}

		return { decision: "prompt" };
	}

	function matchRule(
		rule: PermissionRule,
		toolName: string,
		path?: string,
		parts?: string[],
		operationSignature?: string,
	): boolean {
		switch (rule.type) {
			case "yolo":
				return true;
			case "tool":
				return toolName === rule.tool;
			case "directory":
				return path ? pathStartsWith(path, rule.prefix) : false;
			case "operation":
				return rule.tool === toolName && rule.signature === operationSignature;
			case "bash":
			case "bashPolicy":
				return parts
					? parts.some((part) => bashRuleMatchesPart(rule, part))
					: false;
			default:
				return unreachable(rule);
		}
	}

	function formatRule(rule: PermissionRule): string {
		switch (rule.type) {
			case "yolo":
				return "yolo (all)";
			case "tool":
				return `${rule.tool} (tool)`;
			case "directory":
				return `${rule.prefix} (dir)`;
			case "operation":
				return `${rule.tool} (exact operation)`;
			case "bash":
				return `${rule.commands.join(", ")} (commands)`;
			case "bashPolicy":
				return rule.policy === "git-read" ? "read-only Git" : "all Git operations";
			default:
				return unreachable(rule);
		}
	}

	function ruleKey(rule: PermissionRule): string {
		return rule.type === "operation"
			? `${formatRule(rule)}:${rule.signature}`
			: formatRule(rule);
	}

	function makePatternRule(token: string): PermissionRule {
		return { type: "bash", commands: [token] };
	}

	function makeMultiPatternRules(tokens: string[]): PermissionRule[] {
		const commandTokens = tokens.filter((token) => token !== "git");
		const result: PermissionRule[] = [];
		if (commandTokens.length > 0) {
			result.push({
				type: "bash",
				commands: [...new Set(commandTokens)].sort((a, b) => a.localeCompare(b)),
			});
		}
		if (tokens.includes("git")) {
			result.push({ type: "bashPolicy", policy: "git-all" });
		}
		return result;
	}

	function pushRule(target: PermissionRule[], rule: PermissionRule): void {
		const key = ruleKey(rule);
		for (const existing of target) {
			if (ruleKey(existing) === key) return;
		}
		target.push(rule);
	}

	// ─── Permission prompt ────────────────────────────────────────────

	const PERMISSION_WIDGET_ID = "permission-gate-alert";

	function truncateInline(text: string, limit = 140): string {
		return text.length > limit ? `${text.slice(0, limit)}…` : text;
	}

	function previewFormattedLines(
		text: string,
		maxLines = 5,
		maxColumns = 96,
	): string[] {
		const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
		const preview = lines.slice(0, maxLines);
		if (preview.length === 0) return [""];
		const rendered = preview.map((line) => truncateInline(line, maxColumns));
		if (lines.length > maxLines) {
			rendered[rendered.length - 1] = `${rendered[rendered.length - 1]} …`;
		}
		return rendered;
	}

	function extractDisplayCommandNames(command: string): string[] {
		const analysis = analyzeBashCommand(command);
		return extractCommandPatterns(analysis.parts).slice(0, 6);
	}

	function permissionPromptTitle(
		ctx: ExtensionContext,
		title: string,
		toolName: string,
		path?: string,
		command?: string,
		expanded = false,
	): string {
		const lines = [ctx.ui.theme.fg("accent", "Permission required"), title];

		if (toolName === "bash" && command) {
			const commands = extractDisplayCommandNames(command);
			if (commands.length > 0) {
				lines.push(
					`${ctx.ui.theme.fg("muted", "Summary:")} ${commands.join(", ")}`,
				);
			}
			lines.push(ctx.ui.theme.fg("muted", "Raw command:"));
			const rawCommandLines = expanded
				? command.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
				: previewFormattedLines(command);
			for (const line of rawCommandLines) {
				lines.push(`  ${ctx.ui.theme.fg("dim", line)}`);
			}
		} else if (path) {
			lines.push(ctx.ui.theme.fg("muted", "Target:"));
			lines.push(`  ${ctx.ui.theme.fg("dim", truncateInline(path))}`);
		}

		return lines.join("\n");
	}

	function permissionWidgetLines(_toolName: string): string[] {
		return ["Permission required. Choose an action above."];
	}

	function showPermissionWidget(ctx: ExtensionContext, toolName: string): void {
		ctx.ui.setWidget(PERMISSION_WIDGET_ID, permissionWidgetLines(toolName), {
			placement: "belowEditor",
		});
	}

	function clearPermissionWidget(ctx: ExtensionContext): void {
		ctx.ui.setWidget(PERMISSION_WIDGET_ID, undefined);
	}

	async function runNotificationCommand(
		command: string,
		args: string[],
	): Promise<void> {
		try {
			await pi.exec(command, args, { timeout: 2000 });
		} catch {
			// Notifications are best-effort. Unsupported backends should fail silently.
		}
	}

	function sendOsc777Notification(title: string, body: string): Promise<boolean> {
		return writeNotificationSequence(
			process.stdout,
			formatOsc777Notification(title, body),
		);
	}

	async function sendFallbackNotification(body: string): Promise<void> {
		const env = process.env;
		const route = selectPermissionNotificationRoute("fallback", env, {
			isTTY: false,
			platform: process.platform,
		});

		if (route === "cmux") {
			await runNotificationCommand("cmux", [
				"notify",
				"--title",
				"pi",
				"--body",
				body,
			]);
		} else if (route === "macos") {
			await runNotificationCommand("osascript", [
				"-e",
				formatAppleScriptNotification("pi", body),
			]);
		}
	}

	async function announce(
		ctx: ExtensionContext,
		toolName: string,
	): Promise<void> {
		showPermissionWidget(ctx, toolName);
		const body = `Permission required: ${toolName}`;
		const route = selectPermissionNotificationRoute(ctx.mode, process.env, {
			isTTY: process.stdout.isTTY === true,
			platform: process.platform,
		});

		if (route === "osc777") {
			void sendOsc777Notification("pi", body)
				.then((sent) => {
					if (!sent) return sendFallbackNotification(body);
				})
				.catch(() => sendFallbackNotification(body))
				.catch(() => {});
			return;
		}

		await sendFallbackNotification(body);
	}

	async function permissionPrompt(
		ctx: ExtensionContext,
		title: string,
		toolName: string,
		path?: string,
		patterns?: string[],
		command?: string,
		operationSignature?: string,
		allowPersistentScopes = true,
	): Promise<{
		allow: boolean;
		message?: string;
		expanded?: boolean;
	}> {
		if (!ctx.hasUI) return { allow: true };

		await announce(ctx, toolName);

		let message: string | undefined;
		let expanded = false;

		// Load the TUI only when prompting so policy helpers stay usable without Pi.
		const { selectPermissionChoice } = await import("./lib/permission-prompt.ts");
		while (true) {
			const choices: PermissionChoice[] = [{ value: "once", key: "a", label: "Allow once" }];
			if (allowPersistentScopes) {
				choices.push({ value: "yolo", key: "y", label: "Enable YOLO for this session" });
			}
			choices.push({ value: "deny", key: "d", label: "Deny" });
			if (allowPersistentScopes) {
				choices.push({ value: "more", key: "m", label: "More options…" });
			}
			if (toolName === "bash" && command) {
				choices.push({ value: "view", key: "v", label: expanded ? "Hide full command" : "View full command" });
			}
			choices.push({ value: "note", key: "n", label: message ? `Edit note: ${truncateInline(message, 40)}` : "Add note…" });
			const primaryChoice = await selectPermissionChoice(
				ctx,
				permissionPromptTitle(ctx, title, toolName, path, command, expanded),
				choices,
				allowPersistentScopes
					? "YOLO auto-approves ordinary operations. Risky operations still ask."
					: "One-time approval only. Session permissions cannot bypass this check.",
			);
			if (!primaryChoice || primaryChoice === "deny") {
				return { allow: false, message, expanded };
			}
			if (primaryChoice === "once") return { allow: true, message, expanded };
			if (primaryChoice === "yolo" && allowPersistentScopes) {
				enableYolo(ctx);
				return { allow: true, message, expanded };
			}
			if (primaryChoice === "view") {
				expanded = !expanded;
				continue;
			}
			if (primaryChoice === "note") {
				const input = await ctx.ui.input("Note to model (optional)", "denial reason, or guidance for the model…");
				if (input !== undefined) message = input || undefined;
				continue;
			}
			if (primaryChoice !== "more" || !allowPersistentScopes) continue;
			const advanced = await ctx.ui.select("Session permissions", [
				"Allow for this session…",
				"Block for this session…",
				"Back",
			]);
			if (advanced === "Allow for this session…") {
				if (await allowSessionScope(ctx, toolName, path, patterns, command, operationSignature, expanded)) {
					return { allow: true, message, expanded };
				}
			} else if (advanced === "Block for this session…") {
				if (await denyPrompt(ctx, toolName, path, patterns, command, expanded)) {
					return { allow: false, message, expanded };
				}
			}
		}
	}

	async function allowSessionScope(
		ctx: ExtensionContext,
		toolName: string,
		path?: string,
		patterns?: string[],
		command?: string,
		operationSignature?: string,
		expanded = false,
	): Promise<boolean> {
		const isBash = toolName === "bash";
		const scopeOptions: {
			label: string;
			rules: PermissionRule[];
			notifyLabel?: string;
		}[] = [];

		if (operationSignature) {
			scopeOptions.push({
				label: "📌 This exact operation for this session",
				rules: [
					{
						type: "operation",
						tool: toolName,
						signature: operationSignature,
					},
				],
				notifyLabel: "this exact operation",
			});
		}

		scopeOptions.push({
			label: "✍️  All write + edit operations",
			rules: [
				{ type: "tool", tool: "write" },
				{ type: "tool", tool: "edit" },
			],
			notifyLabel: "write + edit (tool types)",
		});

		scopeOptions.push({
			label: `🔧 This tool type (${toolName})`,
			rules: [{ type: "tool", tool: toolName }],
		});

		if (isBash && patterns && patterns.length > 0) {
			for (const pattern of patterns) {
				if (pattern === "git") {
					scopeOptions.push(
						{
							label: "🔎 Read-only Git inspection",
							rules: [{ type: "bashPolicy", policy: "git-read" }],
							notifyLabel: "read-only Git inspection",
						},
						{
							label: "⌨️  All Git operations for this session",
							rules: [{ type: "bashPolicy", policy: "git-all" }],
							notifyLabel: "all Git operations",
						},
					);
					continue;
				}
				scopeOptions.push({
					label: `⌨️  ${pattern} for this session`,
					rules: [makePatternRule(pattern)],
				});
			}
			if (patterns.length > 1) {
				scopeOptions.push({
					label: `⌨️  All listed executables (${patterns.join(", ")})`,
					rules: makeMultiPatternRules(patterns),
				});
			}
		}

		const directory = getScopeDirectory(path, ctx.cwd);
		if (directory) {
			scopeOptions.push({
				label: `📁 This directory (${directory}/)`,
				rules: [{ type: "directory", prefix: directory }],
			});
		}

		const scopeChoice = await ctx.ui.select(
			permissionPromptTitle(
				ctx,
				"Allow for this session:",
				toolName,
				path,
				command,
				expanded,
			),
			scopeOptions.map((o) => o.label),
		);

		if (!scopeChoice) return false;

		const selected = scopeOptions.find((o) => o.label === scopeChoice);
		if (selected) {
			for (const rule of selected.rules) {
				pushRule(rules.allow, rule);
			}
			const notifyLabel =
				selected.notifyLabel ??
				(selected.rules.length === 1
					? formatRule(selected.rules[0])
					: selected.rules.map((rule) => formatRule(rule)).join(", "));
			ctx.ui.notify(`🟢 ${notifyLabel} — auto-allowed from now on.`, "info");
			updateStatus(ctx);
		}

		return Boolean(selected);
	}

	async function confirmHighRisk(
		ctx: ExtensionContext,
		toolName: string,
		reason: string,
		path?: string,
		command?: string,
		operationSignature?: string,
	): Promise<{ allow: boolean; message?: string }> {
		if (!ctx.hasUI) return { allow: false };
		const result = await permissionPrompt(
			ctx,
			`High-risk operation requires confirmation:\n${reason}`,
			toolName,
			path,
			undefined,
			command,
			operationSignature,
			false,
		);
		clearPermissionWidget(ctx);
		return result;
	}

	async function denyPrompt(
		ctx: ExtensionContext,
		toolName: string,
		path?: string,
		patterns?: string[],
		command?: string,
		expanded = false,
	): Promise<boolean> {
		if (!ctx.hasUI) return false;

		const scopeOptions: string[] = ["Back"];
		const directory = getScopeDirectory(path, ctx.cwd);

		if (toolName === "bash" && patterns && patterns.length > 0) {
			for (const p of patterns) {
				scopeOptions.push(`⌨️  ${p} …`);
			}
			if (patterns.length > 1) {
				scopeOptions.push(`⌨️  All listed executables (${patterns.join(", ")})`);
			}
		}

		scopeOptions.push(`🔧 This tool type (${toolName})`);
		if (directory) scopeOptions.push(`📁 This directory (${directory}/)`);

		const scopeChoice = await ctx.ui.select(
			permissionPromptTitle(
				ctx,
				"Scope for deny:",
				toolName,
				path,
				command,
				expanded,
			),
			scopeOptions,
		);

		if (!scopeChoice || scopeChoice === "Back") return false;

		if (scopeChoice === `🔧 This tool type (${toolName})`) {
			pushRule(rules.deny, { type: "tool", tool: toolName });
			ctx.ui.notify(`🔴 ${toolName} (tool) — blocked from now on.`, "warning");
			updateStatus(ctx);
			return true;
		}

		if (directory && scopeChoice === `📁 This directory (${directory}/)`) {
			pushRule(rules.deny, { type: "directory", prefix: directory });
			ctx.ui.notify(`🔴 ${directory}/ (dir) blocked for this session.`, "warning");
			updateStatus(ctx);
			return true;
		}

		// Pattern deny
		if (toolName === "bash" && patterns) {
			for (const p of patterns) {
				if (scopeChoice === `⌨️  ${p} …`) {
					pushRule(rules.deny, makePatternRule(p));
					ctx.ui.notify(`🔴 ${p} (pattern) — blocked from now on.`, "warning");
					updateStatus(ctx);
					return true;
				}
			}
			if (
				patterns.length > 1 &&
				scopeChoice === `⌨️  All listed executables (${patterns.join(", ")})`
			) {
				for (const rule of makeMultiPatternRules(patterns)) {
					pushRule(rules.deny, rule);
				}
				ctx.ui.notify(`🔴 All patterns — blocked from now on.`, "warning");
				updateStatus(ctx);
				return true;
			}
		}
		return false;
	}

	// ─── Tool call handler ────────────────────────────────────────────

	pi.on("tool_call", async (event, ctx) => {
		const toolName = event.toolName as string;
		const input = event.input as Record<string, unknown>;

		// ── Write / Edit ─────────────────────────────────────────────
		if (toolName === "write" || toolName === "edit") {
			if (readonly) {
				return {
					block: true,
					reason: "Read-only mode is active. Use /readonly to disable.",
				};
			}

			const path = String(input.path ?? input.file_path ?? "unknown path");
			const operationSignature = resolvePath(path, ctx.cwd);
			const check = getPermissionDecision(
				toolName,
				path,
				undefined,
				true,
				operationSignature,
			);
			if (check.decision === "deny") {
				if (ctx.hasUI && check.matchedRule) {
					ctx.ui.notify(`Blocked by rule: ${check.matchedRule}`, "warning");
				}
				return {
					block: true,
					reason: check.matchedRule
						? `Blocked by session rule: ${check.matchedRule}.`
						: "Blocked by session rule.",
				};
			}

			const temporary = yolo && [...temporaryDirectories].some((directory) =>
				isPathInTemporaryDirectory(path, ctx.cwd, directory));
			if (isProtectedPath(path, ctx.cwd) && (!temporary || isSensitiveDirectory(path, ctx.cwd))) {
				const result = await confirmHighRisk(
					ctx,
					toolName,
					`${operationSignature} is a protected system path`,
					path,
					undefined,
					operationSignature,
				);
				if (!result.allow) {
					const reason = result.message
						? `Blocked by user: ${result.message}`
						: "High-risk operation requires an interactive confirmation.";
					return { block: true, reason };
				}
				if (result.message) {
					pi.sendUserMessage(result.message, { deliverAs: "steer" });
				}
				return undefined;
			}

			if (check.decision === "allow" || isPathInCwd(path, ctx.cwd)) {
				return undefined;
			}
			if (!ctx.hasUI) return undefined;

			const result = await permissionPrompt(
				ctx,
				`Allow ${toolName}?`,
				toolName,
				path,
				undefined,
				undefined,
				operationSignature,
			);

			if (!result.allow) {
				clearPermissionWidget(ctx);
				const reason = result.message
					? `Blocked by user: ${result.message}`
					: "Blocked by user.";
				return { block: true, reason };
			}

			clearPermissionWidget(ctx);
			if (result.message) {
				pi.sendUserMessage(result.message, { deliverAs: "steer" });
			}
			return undefined;
		}

		// ── Bash ─────────────────────────────────────────────────────
		if (toolName === "bash") {
			const command = String(input.command ?? "").trim();
			const analysis = analyzeBashCommand(command);
			const parts = analysis.parts;
			const canInferSafety = canInferCommandSafety(analysis);
			const scopeablePatterns = analysis.complex
				? []
				: extractCommandPatterns(parts);
			const bashDirectoryPath = scopePathForDirectory(ctx.cwd);

			// Raw patterns plus normalized literal arguments catch known sensitive
			// paths before any static-inspection or YOLO exemptions are considered.
			if (hasSensitiveBashAccess(command, parts, ctx.cwd)) {
				if (ctx.hasUI) ctx.ui.notify("Blocked: sensitive file access.", "warning");
				return { block: true, reason: "Access to sensitive files is not allowed." };
			}

			// Read-only mode must not offer a way to approve a mutating operation.
			const allSafe = canInferSafety && parts.length > 0 &&
				parts.every((part) => isSafeCommandPart(part));
			if (readonly && !allSafe) {
				return { block: true, reason: "Read-only mode is active. Only read commands are allowed." };
			}
			const highDangerReason = highDangerBashReason(parts, ctx.cwd,
				yolo ? [...temporaryDirectories] : []);
			if (highDangerReason) {
				const result = await confirmHighRisk(
					ctx,
					toolName,
					highDangerReason,
					bashDirectoryPath,
					command,
					command,
				);
				if (!result.allow) {
					const reason = result.message
						? `Blocked by user: ${result.message}`
						: "High-risk operation requires an interactive confirmation.";
					return { block: true, reason };
				}
				if (result.message) {
					pi.sendUserMessage(result.message, { deliverAs: "steer" });
				}
				return undefined;
			}

			const check = getPermissionDecision(
				toolName,
				ctx.cwd,
				parts,
				canInferSafety,
				command,
			);
			if (check.decision === "deny") {
				if (ctx.hasUI && check.matchedRule) {
					ctx.ui.notify(`Blocked by rule: ${check.matchedRule}`, "warning");
				}
				return {
					block: true,
					reason: check.matchedRule
						? `Blocked by session rule: ${check.matchedRule}.`
						: "Blocked by session rule.",
				};
			}

			// Static safety requires every command part and simple shell syntax.
			if (allSafe) return undefined;

			if (readonly) {
				return {
					block: true,
					reason: "Read-only mode is active. Only read commands are allowed.",
				};
			}

			if (check.decision === "allow") return undefined;
			if (!ctx.hasUI) return undefined;

			const result = await permissionPrompt(
				ctx,
				"Allow bash command?",
				toolName,
				bashDirectoryPath,
				scopeablePatterns,
				command,
				command,
			);

			if (!result.allow) {
				clearPermissionWidget(ctx);
				const reason = result.message
					? `Blocked by user: ${result.message}`
					: "Blocked by user.";
				return { block: true, reason };
			}

			clearPermissionWidget(ctx);
			if (result.message) {
				pi.sendUserMessage(result.message, { deliverAs: "steer" });
			}
			return undefined;
		}

		return undefined;
	});
}
