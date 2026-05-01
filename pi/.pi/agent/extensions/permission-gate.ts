/**
 * Permission gate for file writes and bash commands.
 *
 * /readonly (or the command) toggles a hard block on all writes and
 * restricts bash to the read-only allowlist. When readonly is off,
 * write/edit calls prompt for confirmation and unrecognized bash
 * commands prompt too. Sensitive file access is always blocked.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Bash commands that auto-allow without prompting.
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

export default function (pi: ExtensionAPI) {
	let readonly = false;

	// Toggle /readonly command.
	pi.registerCommand("readonly", {
		description: "Toggle read-only mode — blocks all file writes",
		handler: async (_args, ctx) => {
			readonly = !readonly;
			ctx.ui.setStatus("permission-gate", readonly ? "🔒 readonly" : undefined);
			ctx.ui.notify(
				readonly
					? "Read-only mode on. Writes and edits are blocked."
					: "Read-only mode off. Writes will prompt for confirmation.",
				"info"
			);
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		const toolName = event.toolName as string;
		const input = event.input as Record<string, unknown>;

		// Write / edit gate.
		if (toolName === "write" || toolName === "edit") {
			if (readonly) {
				return { block: true, reason: "Read-only mode is active. Use /readonly to disable." };
			}

			if (!ctx.hasUI) {
				return undefined;
			}

			const path = String(input.path ?? input.file_path ?? "unknown path");
			const choice = await ctx.ui.select(`Allow ${toolName}?\n\n  ${path}`, ["Allow", "Deny"]);

			if (choice !== "Allow") {
				return { block: true, reason: "Blocked by user." };
			}

			return undefined;
		}

		// Bash gate.
		if (toolName === "bash") {
			const command = String(input.command ?? "").trim();

			// Sensitive file access: always block.
			if (DENY_PATTERNS.some((p) => p.test(command))) {
				if (ctx.hasUI) {
					ctx.ui.notify("Blocked: sensitive file access.", "warning");
				}
				return { block: true, reason: "Access to sensitive files is not allowed." };
			}

			// Read-only allowlist: always pass through.
			if (ALLOW_PATTERNS.some((p) => p.test(command))) {
				return undefined;
			}

			// Hard block everything else in readonly mode.
			if (readonly) {
				return {
					block: true,
					reason: "Read-only mode is active. Only read commands are allowed.",
				};
			}

			// Otherwise prompt.
			if (!ctx.hasUI) {
				return undefined;
			}

			const preview = command.length > 80 ? command.slice(0, 80) + "…" : command;
			const choice = await ctx.ui.select(`Allow bash command?\n\n  ${preview}`, ["Allow", "Deny"]);

			return choice === "Allow"
				? undefined
				: { block: true, reason: "Blocked by user." };
		}

		return undefined;
	});
}
