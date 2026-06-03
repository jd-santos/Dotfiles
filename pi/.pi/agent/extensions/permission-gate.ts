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
 * Chained bash commands (cd && ls) are split, each part checked, and all
 * command patterns (cd, ls) listed in the allow/deny UI.
 *
 * SECURITY NOTE: This is a convenience gate, not a security sandbox.
 * Command splitting is naive (no quoting/subshell awareness), and wrapped
 * commands like `sh -c "cat .env"` bypass pattern checks. The LLM already
 * has full shell access; this extension only surfaces risky operations.
 */

/// <reference path="../types.d.ts" />

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";

// Bash commands that auto-allow without prompting (read-only safe list).
const ALLOW_PATTERNS: RegExp[] = [
	/^#.*$/,
	/^cd(\s|$)/,
	/^ls(\s|$)/,
	/^pwd(\s|$)/,
	/^cat\s/,
	/^head\s/,
	/^tail\s/,
	/^wc\s/,
	/^file\s/,
	/^which\s/,
	/^dirname\s/,
	/^basename\s/,
	/^realpath\s/,
	/^readlink\s/,
	/^stat\s/,
	/^du(\s|$)/,
	/^tree(\s|$)/,
	/^find\s/,
	/^grep\s/,
	/^rg\s/,
	/^fd\s/,
	/^sort(\s|$)/,
	/^uniq(\s|$)/,
	/^cut\s/,
	/^tr\s/,
	/^awk\s/,
	/^sed\s/,
	/^nl(\s|$)/,
	/^ps(\s|$)/,
	/^echo(\s|$)/,
	/^printf\s/,
	/^git\s+(status|diff|log|branch|show|rev-parse|ls-files|grep)(\s|$)/,
];

// Sensitive file access — always blocked, regardless of mode.
const DENY_PATTERNS: RegExp[] = [
	/^(cat|head|tail)\s+.*\.env/,
	/^(cat|head|tail)\s+.*(credentials|secret|password|token)/i,
	/^(cat|head|tail)\s+.*\.(pem|key)(\s|$)/,
	/^(cat|head|tail)\s+.*\.aws\//,
	/^(cat|head|tail)\s+.*\.ssh\/id_/,
];

type PermissionRule =
	| { type: "tool"; tool: string }
	| { type: "directory"; prefix: string }
	| { type: "bash"; pattern: RegExp }
	| { type: "yolo" };

interface SessionRules {
	allow: PermissionRule[];
	deny: PermissionRule[];
}

// Naive command splitting — does not understand quoting, subshells,
// command substitution, or eval. Used for hint/pattern generation.
// Security-sensitive checks (sensitive file deny) check both raw
// command and split parts, but neither catches wrapped commands
// like `sh -c "cat .env"`. This gate is a convenience layer, not a
// security sandbox.
function splitCommandParts(command: string): string[] {
	return command
		.split(/;|&&|\|\||\||\n/)
		.map((s) => s.trim())
		.filter(Boolean);
}

function extractCommandPatterns(command: string): string[] {
	const parts = splitCommandParts(command);
	const patterns = new Set<string>();
	for (const part of parts) {
		const token = part.split(/\s+/)[0];
		if (token) patterns.add(token);
	}
	return Array.from(patterns).sort();
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isComplexBashCommand(command: string): boolean {
	return (
		command.includes("\n") ||
		/<<-?\s*['"]?\w+['"]?/.test(command) ||
		command.includes("$(") ||
		command.includes("`")
	);
}

function extractScopeableCommandPatterns(command: string): string[] {
	// Complex bash commands often include embedded script content, heredoc markers,
	// or shell fragments that are not meaningful command scopes. In those cases we
	// skip pattern scopes and only offer directory, tool, or yolo options.
	return isComplexBashCommand(command) ? [] : extractCommandPatterns(command);
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
		patterns?: string[],
	): { decision: "allow" | "deny" | "prompt"; matchedRule?: string } {
		if (yolo) return { decision: "allow" };

		for (const rule of rules.deny) {
			if (matchRule(rule, toolName, path, patterns)) {
				return { decision: "deny", matchedRule: formatRule(rule) };
			}
		}
		for (const rule of rules.allow) {
			if (matchRule(rule, toolName, path, patterns)) {
				return { decision: "allow", matchedRule: formatRule(rule) };
			}
		}
		return { decision: "prompt" };
	}

	function matchRule(
		rule: PermissionRule,
		toolName: string,
		path?: string,
		patterns?: string[],
	): boolean {
		switch (rule.type) {
			case "yolo":
				return true;
			case "tool":
				return toolName === rule.tool;
			case "directory":
				return path ? pathStartsWith(path, rule.prefix) : false;
			case "bash":
				return patterns ? patterns.some((p) => rule.pattern.test(p)) : false;
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
				return `${rule.pattern.source} (pattern)`;
			default:
				return unreachable(rule);
		}
	}

	function makePatternRule(token: string): PermissionRule {
		return {
			type: "bash",
			pattern: new RegExp(`^${escapeRegExp(token)}(\\s|$)`),
		};
	}

	function makeMultiPatternRule(tokens: string[]): PermissionRule {
		return {
			type: "bash",
			pattern: new RegExp(
				`^(?:${tokens.map((token) => escapeRegExp(token)).join("|")})(\\s|$)`,
			),
		};
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
		const parts = command
			.split(/;|&&|\|\||\|/)
			.map((part) => part.trim())
			.filter(Boolean);
		const names: string[] = [];
		const seen = new Set<string>();

		for (const part of parts) {
			const tokens = part.split(/\s+/).filter(Boolean);
			let commandToken: string | undefined;
			for (const token of tokens) {
				if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
				if (!/^[A-Za-z0-9_.-]+$/.test(token)) continue;
				commandToken = token;
				break;
			}
			if (commandToken && !seen.has(commandToken)) {
				seen.add(commandToken);
				names.push(commandToken);
			}
		}

		return names;
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
			for (const p of patterns) {
				scopeOptions.push({
					label: `⌨️  ${p} …`,
					rules: [makePatternRule(p)],
				});
			}
			if (patterns.length > 1) {
				scopeOptions.push({
					label: `⌨️  All command patterns (${patterns.join(", ")})`,
					rules: [makeMultiPatternRule(patterns)],
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
				pushRule(rules.allow, rule);
				if (rule.type === "yolo") yolo = true;
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
				pushRule(rules.deny, makeMultiPatternRule(patterns));
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
			const parts = splitCommandParts(command);
			const patterns = extractCommandPatterns(command);
			const scopeablePatterns = extractScopeableCommandPatterns(command);
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

			const check = getPermissionDecision(toolName, ctx.cwd, patterns);
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

			// Read-only safe-list: ALL parts must be safe
			const allSafe = parts.every((part) =>
				ALLOW_PATTERNS.some((p) => p.test(part)),
			);
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
