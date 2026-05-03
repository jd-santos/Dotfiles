/**
 * Permission gate for file writes and bash commands.
 *
 * Commands:
 *   /readonly   — Toggle hard block on all writes + restrict bash to allowlist
 *   /yolo       — Toggle skip-all-prompts mode (sensitive files still blocked)
 *   /rules      — Show active session permission rules
 *   /reset-rules — Clear all session permission rules
 *
 * Default mode: prompts for write/edit and unrecognized bash commands.
 * After each prompt, asks whether to remember the decision for the rest
 * of the session (tool type, directory, command pattern, or full yolo).
 */

import { dirname } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";

// Bash commands that auto-allow without prompting (read-only safe list).
const ALLOW_PATTERNS: RegExp[] = [
	/^ls(\s|$)/,
	/^pwd$/,
	/^cat\s/,
	/^head\s/,
	/^tail\s/,
	/^wc\s/,
	/^file\s/,
	/^which\s/,
	/^tree(\s|$)/,
	/^find\s/,
	/^grep\s/,
	/^rg\s/,
	/^fd\s/,
	/^echo(\s|$)/,
	/^git\s+(status|diff|log|branch|show|rev-parse)(\s|$)/,
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

function pathStartsWith(path: string, prefix: string): boolean {
	const n = path.replace(/\/$/, "");
	const p = prefix.replace(/\/$/, "");
	return n === p || n.startsWith(p + "/");
}

export default function (pi: ExtensionAPI) {
	let readonly = false;
	let yolo = false;
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
			if (yolo && readonly) readonly = false;
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
			ctx.ui.notify("Session permission rules cleared.", "info");
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

	function isAllowed(
		toolName: string,
		path?: string,
		command?: string,
	): { allowed: boolean; matchedRule?: string } {
		if (yolo) return { allowed: true };

		for (const rule of rules.deny) {
			if (matchRule(rule, toolName, path, command)) {
				return { allowed: false, matchedRule: formatRule(rule) };
			}
		}
		for (const rule of rules.allow) {
			if (matchRule(rule, toolName, path, command)) {
				return { allowed: true, matchedRule: formatRule(rule) };
			}
		}
		return { allowed: false };
	}

	function matchRule(
		rule: PermissionRule,
		toolName: string,
		path?: string,
		command?: string,
	): boolean {
		switch (rule.type) {
			case "yolo":
				return true;
			case "tool":
				return toolName === rule.tool;
			case "directory":
				return path ? pathStartsWith(path, rule.prefix) : false;
			case "bash":
				return command ? rule.pattern.test(command) : false;
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
		}
	}

	// ─── Prompt helpers ───────────────────────────────────────────────

	async function promptContinue(
		ctx: ExtensionContext,
		toolName: string,
		path?: string,
		command?: string,
	): Promise<void> {
		if (!ctx.hasUI) return;

		const dir = path ? dirname(path) : undefined;
		const options: string[] = [];

		if (command && toolName === "bash") {
			// Use first token as the "pattern" for bash commands
			const base = command.split(/\s+/)[0];
			if (base) options.push(`Pattern: ${base} …`);
		}
		if (dir) {
			options.push(`Directory: ${dir}/`);
		}
		options.push(`Tool type: ${toolName}`);
		options.push("⚡ Full yolo (everything)");
		options.push("Just this once");

		const choice = await ctx.ui.select(
			"💡 Continue this pattern for the rest of the session?",
			options,
		);

		if (!choice || choice === "Just this once") return;

		if (choice === "⚡ Full yolo (everything)") {
			rules.allow.push({ type: "yolo" });
			yolo = true;
			ctx.ui.notify("Yolo mode activated for this session.", "info");
			updateStatus(ctx);
			return;
		}

		if (choice === `Tool type: ${toolName}`) {
			rules.allow.push({ type: "tool", tool: toolName });
			ctx.ui.notify(
				`All ${toolName} operations will auto-allow from now on.`,
				"info",
			);
			updateStatus(ctx);
			return;
		}

		if (dir && choice === `Directory: ${dir}/`) {
			rules.allow.push({ type: "directory", prefix: dir });
			ctx.ui.notify(
				`Operations under ${dir}/ will auto-allow from now on.`,
				"info",
			);
			updateStatus(ctx);
			return;
		}

		if (command && choice.startsWith("Pattern: ")) {
			const base = command.split(/\s+/)[0];
			rules.allow.push({
				type: "bash",
				pattern: new RegExp(`^${base}(\\s|$)`),
			});
			ctx.ui.notify(
				`"${base} …" commands will auto-allow from now on.`,
				"info",
			);
			updateStatus(ctx);
			return;
		}
	}

	async function promptBlockContinue(
		ctx: ExtensionContext,
		toolName: string,
		path?: string,
		_command?: string, // unused, but kept for call-site compatibility
	): Promise<void> {
		if (!ctx.hasUI) return;

		const dir = path ? dirname(path) : undefined;
		const options: string[] = [];

		if (dir) options.push(`Directory: ${dir}/`);
		options.push(`Tool type: ${toolName}`);
		options.push("Just this time");

		const choice = await ctx.ui.select(
			"🚫 Block this pattern for the rest of the session?",
			options,
		);

		if (!choice || choice === "Just this time") return;

		if (choice === `Tool type: ${toolName}`) {
			rules.deny.push({ type: "tool", tool: toolName });
			ctx.ui.notify(
				`All ${toolName} operations will be blocked from now on.`,
				"warning",
			);
			updateStatus(ctx);
			return;
		}

		if (dir && choice === `Directory: ${dir}/`) {
			rules.deny.push({ type: "directory", prefix: dir });
			ctx.ui.notify(
				`Operations under ${dir}/ will be blocked from now on.`,
				"warning",
			);
			updateStatus(ctx);
			return;
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

			// Session rule match?
			const check = isAllowed(toolName, path);
			if (check.allowed) return undefined;

			if (!ctx.hasUI) {
				return undefined; // non-interactive: allow (unless readonly)
			}

			const choice = await ctx.ui.select(`Allow ${toolName}?\n\n  ${path}`, [
				"Allow",
				"Deny",
			]);

			if (choice !== "Allow") {
				await promptBlockContinue(ctx, toolName, path);
				return { block: true, reason: "Blocked by user." };
			}

			await promptContinue(ctx, toolName, path);
			return undefined;
		}

		// ── Bash ─────────────────────────────────────────────────────
		if (toolName === "bash") {
			const command = String(input.command ?? "").trim();

			// Sensitive files: always block
			if (DENY_PATTERNS.some((p) => p.test(command))) {
				if (ctx.hasUI) {
					ctx.ui.notify("Blocked: sensitive file access.", "warning");
				}
				return {
					block: true,
					reason: "Access to sensitive files is not allowed.",
				};
			}

			// Read-only safe-list: always pass
			if (ALLOW_PATTERNS.some((p) => p.test(command))) {
				return undefined;
			}

			if (readonly) {
				return {
					block: true,
					reason: "Read-only mode is active. Only read commands are allowed.",
				};
			}

			// Session rule match?
			const check = isAllowed(toolName, undefined, command);
			if (check.allowed) return undefined;

			if (!ctx.hasUI) {
				return undefined;
			}

			const preview =
				command.length > 80 ? command.slice(0, 80) + "…" : command;
			const choice = await ctx.ui.select(
				`Allow bash command?\n\n  ${preview}`,
				["Allow", "Deny"],
			);

			if (choice !== "Allow") {
				await promptBlockContinue(ctx, toolName, undefined, command);
				return { block: true, reason: "Blocked by user." };
			}

			await promptContinue(ctx, toolName, undefined, command);
			return undefined;
		}

		return undefined;
	});
}
