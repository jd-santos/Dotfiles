/**
 * Permission gate for file writes and bash commands.
 *
 * Commands:
 *   /readonly    Toggle hard block on all writes + restrict bash to allowlist
 *   /yolo        Toggle skip-all-prompts mode (sensitive files still blocked)
 *   /rules       Show active session permission rules
 *   /reset-rules Clear all session permission rules
 *
 * Default mode: prompts for write/edit and unrecognized bash commands.
 * Two-step prompt: first choose once/always/deny, then pick the scope.
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

/// <reference path="../types.d.ts" />

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";

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

// Sensitive file access is always blocked, regardless of mode.
const DENY_PATTERNS: RegExp[] = [
	/^(cat|head|tail)\s+.*\.env/,
	/^(cat|head|tail)\s+.*(credentials|secret|password|token)/i,
	/^(cat|head|tail)\s+.*\.(pem|key)(\s|$)/,
	/^(cat|head|tail)\s+.*\.aws\//,
	/^(cat|head|tail)\s+.*\.ssh\/id_/,
];

type BashPolicy = "git-read" | "git-all";

export type PermissionRule =
	| { type: "tool"; tool: string }
	| { type: "directory"; prefix: string }
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
		/^(?:>>?|<)\s*\/dev\/null(?:\s|$|[;&|])/.test(suffix) ||
		/^>&\d/.test(suffix)
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

function extractCommandPattern(part: string): string | undefined {
	const words = splitShellWords(part);
	let index = 0;
	while (
		index < words.length &&
		/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index])
	) {
		index++;
	}
	return words[index];
}

function extractCommandPatterns(parts: string[]): string[] {
	const patterns = new Set<string>();
	for (const part of parts) {
		const token = extractCommandPattern(part);
		if (token) patterns.add(token);
	}
	return Array.from(patterns).sort((a, b) => a.localeCompare(b));
}

function hasPromptOnlyArguments(part: string): boolean {
	const command = extractCommandPattern(part);
	if (!command) return true;
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
	if (
		/^sed\b/.test(part) &&
		/(?:^|\s)(?:-i\S*|--in-place(?:=\S*)?)(?:\s|$)/.test(part)
	) {
		return true;
	}
	if (/^rg\b/.test(part) && /(?:^|\s)--pre(?:\s|=|$)/.test(part)) return true;
	if (
		/^fd\b/.test(part) &&
		/(?:^|\s)(?:-x|-X|--exec|--exec-batch)(?:\s|=|$)/.test(part)
	) {
		return true;
	}
	if (/^sort\b/.test(part) && /(?:^|\s)(?:-o|--output)(?:\s|=|$)/.test(part))
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
	if (words[0] !== "git") return undefined;
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
	return splitShellWords(part)[0] === "git";
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

function isBashRule(rule: PermissionRule): boolean {
	return rule.type === "bash" || rule.type === "bashPolicy";
}

export function bashRuleMatchesPart(
	rule: PermissionRule,
	part: string,
): boolean {
	if (rule.type === "bash") {
		const command = extractCommandPattern(part);
		return command ? rule.commands.includes(command) : false;
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
				rules.some(
					(rule) => isBashRule(rule) && bashRuleMatchesPart(rule, part),
				),
		)
	);
}

function parentDir(path: string): string {
	const normalized = path.replace(/\/+$/, "");
	const slash = normalized.lastIndexOf("/");
	if (slash <= 0) return ".";
	return normalized.slice(0, slash);
}

function getDirChain(path?: string): string[] {
	if (!path) return [];
	const dirs: string[] = [];
	let d = parentDir(path);
	for (let i = 0; i < 3 && d && d !== "." && d !== "/"; i++) {
		dirs.push(d);
		const next = parentDir(d);
		if (next === d) break;
		d = next;
	}
	return dirs;
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

function unreachable(value: never): never {
	throw new Error(`Unhandled permission rule: ${JSON.stringify(value)}`);
}

export default function (pi: ExtensionAPI) {
	let readonly = false;
	let yolo = false;
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
					: "Read-only mode off. Writes will prompt for confirmation.",
				"info",
			);
		},
	});

	pi.registerCommand("yolo", {
		description: "Toggle yolo mode — skip all permission prompts",
		handler: async (_args, ctx) => {
			yolo = !yolo;
			if (yolo) {
				// Wipe session rules before toggling — avoids confusing
				// overlap between yolo and granular rules.
				rules = { allow: [], deny: [] };
				readonly = false;
			}
			updateStatus(ctx);
			ctx.ui.notify(
				yolo
					? "Yolo mode on. All write/edit/bash operations will auto-allow."
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
			updateStatus(ctx);
			ctx.ui.notify(
				"Session permission rules cleared. Rules are ephemeral and reset between sessions.",
				"info",
			);
		},
	});

	function updateStatus(ctx: ExtensionContext) {
		const parts: string[] = [];
		if (readonly) parts.push("readonly");
		if (yolo) parts.push("yolo");
		if (rules.allow.length > 0) parts.push(`+${rules.allow.length}`);
		if (rules.deny.length > 0) parts.push(`-${rules.deny.length}`);
		ctx.ui.setStatus(
			"permission-gate",
			parts.length ? parts.join(" | ") : undefined,
		);
	}

	// ─── Rule helpers ─────────────────────────────────────────────────

	function getPermissionDecision(
		toolName: string,
		path?: string,
		parts?: string[],
		allowBashRules = true,
	): { decision: "allow" | "deny" | "prompt"; matchedRule?: string } {
		if (yolo) return { decision: "allow" };

		for (const rule of rules.deny) {
			if (matchRule(rule, toolName, path, parts)) {
				return { decision: "deny", matchedRule: formatRule(rule) };
			}
		}

		for (const rule of rules.allow) {
			if (!isBashRule(rule) && matchRule(rule, toolName, path, parts)) {
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
	): boolean {
		switch (rule.type) {
			case "yolo":
				return true;
			case "tool":
				return toolName === rule.tool;
			case "directory":
				return path ? pathStartsWith(path, rule.prefix) : false;
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
			case "bash":
				return `${rule.commands.join(", ")} (commands)`;
			case "bashPolicy":
				return rule.policy === "git-read"
					? "read-only Git"
					: "all Git operations";
			default:
				return unreachable(rule);
		}
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
				commands: [...new Set(commandTokens)].sort((a, b) =>
					a.localeCompare(b),
				),
			});
		}
		if (tokens.includes("git")) {
			result.push({ type: "bashPolicy", policy: "git-all" });
		}
		return result;
	}

	function pushRule(target: PermissionRule[], rule: PermissionRule): void {
		const key = formatRule(rule);
		for (const existing of target) {
			if (formatRule(existing) === key) return;
		}
		target.push(rule);
	}

	// ─── Two-step prompt ──────────────────────────────────────────────

	const PERMISSION_WIDGET_ID = "permission-gate-alert";
	const PERMISSION_BOX_WIDTH = 56;
	let cmuxWarned = false;

	function boxLine(text: string): string {
		return `│ ${text.slice(0, PERMISSION_BOX_WIDTH - 4).padEnd(PERMISSION_BOX_WIDTH - 4)} │`;
	}

	function permissionTitleBox(title: string): string {
		const innerWidth = PERMISSION_BOX_WIDTH - 2;
		const heading = " 🔔 Permission required 🔔 ";
		const left = Math.floor((innerWidth - heading.length) / 2);
		const right = innerWidth - heading.length - left;
		return [
			`╭${"─".repeat(left)}${heading}${"─".repeat(right)}╮`,
			...title.split("\n").map(boxLine),
			`╰${"─".repeat(innerWidth)}╯`,
			"",
		].join("\n");
	}

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
		const lines = [permissionTitleBox(title)];

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
		return [
			"                 ▲ ▲ ▲",
			"                 │ │ │",
			"       Choose in the permission prompt above",
		];
	}

	function showPermissionWidget(ctx: ExtensionContext, toolName: string): void {
		ctx.ui.setWidget(PERMISSION_WIDGET_ID, permissionWidgetLines(toolName), {
			placement: "belowEditor",
		});
	}

	function clearPermissionWidget(ctx: ExtensionContext): void {
		ctx.ui.setWidget(PERMISSION_WIDGET_ID, undefined);
	}

	async function runCmuxCommand(args: string[]): Promise<string | undefined> {
		try {
			const result = await pi.exec("cmux", args, { timeout: 2000 });
			if (result.code === 0) return undefined;
			return `${args[0]} exited ${result.code}${result.stderr ? `: ${String(result.stderr).trim()}` : ""}`;
		} catch (error) {
			return `${args[0]} failed: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	async function alertCmux(ctx: ExtensionContext, body: string): Promise<void> {
		const failures = (
			await Promise.all([
				runCmuxCommand(["notify", "--title", "pi", "--body", body]),
				runCmuxCommand(["trigger-flash"]),
			])
		).filter(Boolean);

		if (failures.length > 0 && !cmuxWarned) {
			cmuxWarned = true;
			ctx.ui.notify(`cmux alert failed: ${failures.join("; ")}`, "warning");
		}
	}

	async function announce(
		ctx: ExtensionContext,
		toolName: string,
	): Promise<void> {
		showPermissionWidget(ctx, toolName);
		await alertCmux(ctx, `Permission required: ${toolName}`);
	}

	async function twoStepPrompt(
		ctx: ExtensionContext,
		title: string,
		toolName: string,
		path?: string,
		patterns?: string[],
		command?: string,
	): Promise<{
		allow: boolean;
		rule?: PermissionRule;
		message?: string;
		expanded?: boolean;
	}> {
		if (!ctx.hasUI) return { allow: true };

		await announce(ctx, toolName);

		let message: string | undefined;
		let expanded = false;

		while (true) {
			const noteLabel = message
				? `✏️  Edit note: “${message.length > 40 ? message.slice(0, 40) + "…" : message}”`
				: "✏️  Add note…";
			const toggleLabel =
				toolName === "bash" && command
					? expanded
						? "🙈  Hide full command"
						: "👁  Show full command"
					: undefined;
			const options = ["✅  Allow this once", "🔁  Always allow…", "🚫  Deny"];
			if (toggleLabel) options.push(toggleLabel);
			options.push(noteLabel);

			const primaryChoice = await ctx.ui.select(
				permissionPromptTitle(ctx, title, toolName, path, command, expanded),
				options,
			);

			if (!primaryChoice || primaryChoice === "🚫  Deny") {
				return { allow: false, message, expanded };
			}

			if (primaryChoice === "✅  Allow this once") {
				return { allow: true, message, expanded };
			}

			if (toggleLabel && primaryChoice === toggleLabel) {
				expanded = !expanded;
				continue;
			}

			if (primaryChoice === noteLabel) {
				const input = await ctx.ui.input(
					permissionTitleBox("Note to model (optional)"),
					"denial reason, or guidance for the model…",
				);
				message = input || undefined;
				continue;
			}

			break; // “✓ Always allow…” — fall through to scope picker
		}

		const isBash = toolName === "bash";
		const scopeOptions: {
			label: string;
			rules: PermissionRule[];
			notifyLabel?: string;
		}[] = [];

		// Directory hierarchy
		const dirChain = getDirChain(path);
		const dirIcons = ["📁", "📂", "📂📂"];
		const dirLabels = [
			"This directory",
			"Parent directory",
			"Grandparent directory",
		];

		for (let i = 0; i < dirChain.length; i++) {
			scopeOptions.push({
				label: `${dirIcons[i]} ${dirLabels[i]} (${dirChain[i]}/)`,
				rules: [{ type: "directory", prefix: dirChain[i] }],
			});
		}

		// Tool type
		scopeOptions.push({
			label: `🔧 This tool type (${toolName})`,
			rules: [{ type: "tool", tool: toolName }],
		});
		if (toolName === "write" || toolName === "edit") {
			scopeOptions.push({
				label: "🔧 Both write + edit tool types",
				rules: [
					{ type: "tool", tool: "write" },
					{ type: "tool", tool: "edit" },
				],
				notifyLabel: "write + edit (tool types)",
			});
		}

		// Command patterns
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
					label: `⌨️  ${pattern} …`,
					rules: [makePatternRule(pattern)],
				});
			}
			if (patterns.length > 1) {
				scopeOptions.push({
					label: `⌨️  All command patterns (${patterns.join(", ")})`,
					rules: makeMultiPatternRules(patterns),
				});
			}
		}

		// Yolo
		scopeOptions.push({
			label: "⚡ Everything (full yolo)",
			rules: [{ type: "yolo" }],
		});

		const scopeChoice = await ctx.ui.select(
			permissionPromptTitle(
				ctx,
				"Scope for always allow:",
				toolName,
				path,
				command,
				expanded,
			),
			scopeOptions.map((o) => o.label),
		);

		if (!scopeChoice) return { allow: true, message };

		const selected = scopeOptions.find((o) => o.label === scopeChoice);
		if (selected) {
			for (const rule of selected.rules) {
				if (rule.type === "yolo") yolo = true;
				else pushRule(rules.allow, rule);
			}
			const notifyLabel =
				selected.notifyLabel ??
				(selected.rules.length === 1
					? formatRule(selected.rules[0])
					: selected.rules.map((rule) => formatRule(rule)).join(", "));
			ctx.ui.notify(`🟢 ${notifyLabel} — auto-allowed from now on.`, "info");
			updateStatus(ctx);
		}

		return { allow: true, message: message || undefined, expanded };
	}

	async function denyPrompt(
		ctx: ExtensionContext,
		toolName: string,
		path?: string,
		patterns?: string[],
		command?: string,
		expanded = false,
	): Promise<void> {
		if (!ctx.hasUI) return;

		const scopeOptions: string[] = ["Just this once"];
		const dirChain = getDirChain(path);
		const dirIcons = ["📁", "📂", "📂📂"];
		const dirLabels = [
			"This directory",
			"Parent directory",
			"Grandparent directory",
		];

		for (let i = 0; i < dirChain.length; i++) {
			scopeOptions.push(`${dirIcons[i]} ${dirLabels[i]} (${dirChain[i]}/)`);
		}

		if (toolName === "bash" && patterns && patterns.length > 0) {
			for (const p of patterns) {
				scopeOptions.push(`⌨️  ${p} …`);
			}
			if (patterns.length > 1) {
				scopeOptions.push(`⌨️  All command patterns (${patterns.join(", ")})`);
			}
		}

		scopeOptions.push(`🔧 This tool type (${toolName})`);

		await announce(ctx, toolName);

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

		if (!scopeChoice || scopeChoice === "Just this once") return;

		if (scopeChoice === `🔧 This tool type (${toolName})`) {
			pushRule(rules.deny, { type: "tool", tool: toolName });
			ctx.ui.notify(`🔴 ${toolName} (tool) — blocked from now on.`, "warning");
			updateStatus(ctx);
			return;
		}

		// Directory deny
		for (let i = 0; i < dirChain.length; i++) {
			if (scopeChoice === `${dirIcons[i]} ${dirLabels[i]} (${dirChain[i]}/)`) {
				pushRule(rules.deny, { type: "directory", prefix: dirChain[i] });
				ctx.ui.notify(
					`🔴 ${dirChain[i]}/ (dir) — blocked from now on.`,
					"warning",
				);
				updateStatus(ctx);
				return;
			}
		}

		// Pattern deny
		if (toolName === "bash" && patterns) {
			for (const p of patterns) {
				if (scopeChoice === `⌨️  ${p} …`) {
					pushRule(rules.deny, makePatternRule(p));
					ctx.ui.notify(`🔴 ${p} (pattern) — blocked from now on.`, "warning");
					updateStatus(ctx);
					return;
				}
			}
			if (
				patterns.length > 1 &&
				scopeChoice === `⌨️  All command patterns (${patterns.join(", ")})`
			) {
				for (const rule of makeMultiPatternRules(patterns)) {
					pushRule(rules.deny, rule);
				}
				ctx.ui.notify(`🔴 All patterns — blocked from now on.`, "warning");
				updateStatus(ctx);
				return;
			}
		}
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
			const check = getPermissionDecision(toolName, path);
			if (check.decision === "allow") return undefined;
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
			if (!ctx.hasUI) return undefined;

			const result = await twoStepPrompt(
				ctx,
				`Allow ${toolName}?`,
				toolName,
				path,
			);

			if (!result.allow) {
				await denyPrompt(
					ctx,
					toolName,
					path,
					undefined,
					undefined,
					result.expanded,
				);
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

			// Sensitive files: check raw command first, then each split part.
			// Neither catches wrapped commands (sh -c, eval), but together they
			// catch more cases than either alone.
			if (DENY_PATTERNS.some((p) => p.test(command))) {
				if (ctx.hasUI) {
					ctx.ui.notify("Blocked: sensitive file access.", "warning");
				}
				return {
					block: true,
					reason: "Access to sensitive files is not allowed.",
				};
			}

			// Check each split part, block whole chain
			for (const part of parts) {
				if (DENY_PATTERNS.some((p) => p.test(part))) {
					if (ctx.hasUI) {
						ctx.ui.notify("Blocked: sensitive file access.", "warning");
					}
					return {
						block: true,
						reason: "Access to sensitive files is not allowed.",
					};
				}
			}

			const check = getPermissionDecision(
				toolName,
				ctx.cwd,
				parts,
				canInferSafety,
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
			const allSafe =
				canInferSafety &&
				parts.length > 0 &&
				parts.every((part) => isSafeCommandPart(part));
			if (allSafe) return undefined;

			if (readonly) {
				return {
					block: true,
					reason: "Read-only mode is active. Only read commands are allowed.",
				};
			}

			if (check.decision === "allow") return undefined;
			if (!ctx.hasUI) return undefined;

			const result = await twoStepPrompt(
				ctx,
				"Allow bash command?",
				toolName,
				bashDirectoryPath,
				scopeablePatterns,
				command,
			);

			if (!result.allow) {
				await denyPrompt(
					ctx,
					toolName,
					bashDirectoryPath,
					scopeablePatterns,
					command,
					result.expanded,
				);
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
