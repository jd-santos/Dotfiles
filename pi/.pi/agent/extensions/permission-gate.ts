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

	// ─── Two-step prompt ──────────────────────────────────────────────

	type PrimaryChoice = "allow-once" | "always-allow" | "deny";
	type ScopeChoice = "directory" | "tool" | "pattern" | "yolo";

	async function twoStepPrompt(
		ctx: ExtensionContext,
		title: string,
		toolName: string,
		path?: string,
		command?: string,
	): Promise<{ allow: boolean; rule?: PermissionRule }> {
		if (!ctx.hasUI) return { allow: true };

		// Step 1: once / always / deny
		const primaryChoice = await ctx.ui.select(title, [
			"▶ Allow this once",
			"✓ Always allow…",
			"✕ Deny",
		]);

		if (!primaryChoice || primaryChoice === "✕ Deny") {
			return { allow: false };
		}

		if (primaryChoice === "▶ Allow this once") {
			return { allow: true };
		}

		// Step 2: scope selector for "always allow"
		const dir = path ? dirname(path) : undefined;
		const base = command?.split(/\s+/)[0];
		const isBash = toolName === "bash";

		const scopeOptions: { label: string; rule: PermissionRule }[] = [];

		if (dir) {
			scopeOptions.push({
				label: `📁 This directory (${dir}/)`,
				rule: { type: "directory", prefix: dir },
			});
		}

		scopeOptions.push({
			label: `🔧 This tool type (${toolName})`,
			rule: { type: "tool", tool: toolName },
		});

		if (isBash && base) {
			scopeOptions.push({
				label: `⌨️  This command pattern (${base} …)`,
				rule: { type: "bash", pattern: new RegExp(`^${base}(\\s|$)`) },
			});
		}

		scopeOptions.push({
			label: "⚡ Everything (full yolo)",
			rule: { type: "yolo" },
		});

		const scopeChoice = await ctx.ui.select(
			"Scope for always allow:",
			scopeOptions.map((o) => o.label),
		);

		if (!scopeChoice) return { allow: true };

		const selected = scopeOptions.find((o) => o.label === scopeChoice);
		if (selected) {
			rules.allow.push(selected.rule);
			if (selected.rule.type === "yolo") yolo = true;
			ctx.ui.notify(
				`🟢 ${formatRule(selected.rule)} — auto-allowed from now on.`,
				"info",
			);
			updateStatus(ctx);
		}

		return { allow: true };
	}

	async function denyPrompt(
		ctx: ExtensionContext,
		toolName: string,
		path?: string,
	): Promise<void> {
		if (!ctx.hasUI) return;

		const dir = path ? dirname(path) : undefined;

		const scopeOptions: string[] = ["Just this once"];

		if (dir) {
			scopeOptions.push(`📁 This directory (${dir}/)`);
		}

		scopeOptions.push(`🔧 This tool type (${toolName})`);

		const scopeChoice = await ctx.ui.select("Scope for deny:", scopeOptions);

		if (!scopeChoice || scopeChoice === "Just this once") return;

		if (scopeChoice === `🔧 This tool type (${toolName})`) {
			rules.deny.push({ type: "tool", tool: toolName });
			ctx.ui.notify(`🔴 ${toolName} (tool) — blocked from now on.`, "warning");
			updateStatus(ctx);
			return;
		}

		if (dir && scopeChoice === `📁 This directory (${dir}/)`) {
			rules.deny.push({ type: "directory", prefix: dir });
			ctx.ui.notify(`🔴 ${dir}/ (dir) — blocked from now on.`, "warning");
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
				return undefined;
			}

			const result = await twoStepPrompt(
				ctx,
				`Allow ${toolName}?\n\n  ${path}`,
				toolName,
				path,
			);

			if (!result.allow) {
				await denyPrompt(ctx, toolName, path);
				return { block: true, reason: "Blocked by user." };
			}

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

			const result = await twoStepPrompt(
				ctx,
				`Allow bash command?\n\n  ${preview}`,
				toolName,
				undefined,
				command,
			);

			if (!result.allow) {
				await denyPrompt(ctx, toolName);
				return { block: true, reason: "Blocked by user." };
			}

			return undefined;
		}

		return undefined;
	});
}
