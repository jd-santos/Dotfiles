/**
 * Session cost tracker.
 *
 * Counts tool calls per tool and accumulates token usage from each
 * assistant message. Run /costs to see the breakdown.
 *
 * Token attribution is per-message (not per-tool-call) — Pi doesn't
 * expose per-tool token data. The tool call counts show which tools
 * are being used most, and the message totals show actual spend.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface ToolStats {
	calls: number;
}

interface MessageStats {
	inputTokens: number;
	outputTokens: number;
	cost: number;
}

export default function (pi: ExtensionAPI) {
	const tools: Record<string, ToolStats> = {};
	const messages: MessageStats[] = [];

	// Count every tool invocation.
	pi.on("tool_call", async (event) => {
		const name = event.toolName as string;
		if (!tools[name]) tools[name] = { calls: 0 };
		tools[name].calls++;
	});

	// Accumulate token usage from each assistant message.
	pi.on("message_end", async (event) => {
		const msg = event.message as { role?: string; usage?: { input?: number; output?: number; cost?: { total?: number } } };
		if (msg.role !== "assistant" || !msg.usage) return;

		messages.push({
			inputTokens: msg.usage.input ?? 0,
			outputTokens: msg.usage.output ?? 0,
			cost: msg.usage.cost?.total ?? 0,
		});
	});

	pi.registerCommand("costs", {
		description: "Show session token usage and tool call counts",
		handler: async (_args, ctx) => {
			const totalInput = messages.reduce((s, m) => s + m.inputTokens, 0);
			const totalOutput = messages.reduce((s, m) => s + m.outputTokens, 0);
			const totalCost = messages.reduce((s, m) => s + m.cost, 0);

			const sortedTools = Object.entries(tools).sort(([, a], [, b]) => b.calls - a.calls);

			const lines: string[] = [
				"  Session Cost Report",
				"  ─────────────────────────────────────",
			];

			if (sortedTools.length === 0) {
				lines.push("  No tool calls recorded yet.");
			} else {
				lines.push("  Tool              Calls");
				lines.push("  ─────────────────────────────────────");
				for (const [name, stats] of sortedTools) {
					const padded = name.padEnd(18);
					lines.push(`  ${padded}  ${stats.calls}`);
				}
			}

			lines.push("  ─────────────────────────────────────");
			lines.push(
				`  Messages: ${messages.length}   Input: ${totalInput.toLocaleString()} tok   Output: ${totalOutput.toLocaleString()} tok`
			);
			lines.push(`  Estimated cost: $${totalCost.toFixed(4)}`);
			lines.push("");
			lines.push("  (Clears in 15s — run /costs again to refresh)");

			ctx.ui.setWidget("cost-tracker", lines, { placement: "belowEditor" });
			setTimeout(() => ctx.ui.setWidget("cost-tracker", undefined), 15_000);
		},
	});
}
