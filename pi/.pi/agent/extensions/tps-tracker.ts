// @ts-nocheck

/**
 * Tracks tokens per second during model generation.
 *
 * The live value replaces Pi's working message while the assistant streams.
 * It uses provider usage when available, otherwise it estimates tokens from
 * streamed characters. When the run ends, a turn line is written into the
 * transcript as a custom entry, which is stored with the session but never
 * sent to the model.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { keyText } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatCount, formatMoney } from "./lib/shell-layout.ts";

export const TURN_ENTRY = "turn-receipt";

export interface TurnReceipt {
	elapsedMs: number;
	output: number;
	tps: number;
	cost: number;
	contextPercent?: number;
}

export function formatElapsed(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
	return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function formatReceipt(receipt: TurnReceipt): string {
	const parts = [
		formatElapsed(receipt.elapsedMs),
		`${formatCount(receipt.output)} out`,
		receipt.tps > 0 ? `${receipt.tps} t/s` : undefined,
		receipt.cost > 0 ? formatMoney(receipt.cost) : undefined,
		typeof receipt.contextPercent === "number" && Number.isFinite(receipt.contextPercent)
			? `ctx ${Math.round(receipt.contextPercent)}%`
			: undefined,
	];
	return parts.filter(Boolean).join(" · ");
}

function messageCost(message: any): number {
	const cost = message?.usage?.cost;
	return Number(typeof cost === "number" ? cost : cost?.total ?? 0) || 0;
}

export default function (pi: ExtensionAPI) {
	let runStart: number | null = null;
	let messageStart: number | null = null;
	let streamStart: number | null = null;
	let estimatedStreamedTokens = 0;
	let totalOutputTokens = 0;
	let totalStreamMs = 0;

	pi.registerEntryRenderer<TurnReceipt>(TURN_ENTRY, (entry, _options, theme) => {
		if (!entry.data) return undefined;
		return new Text(theme.fg("dim", `✓ ${formatReceipt(entry.data)}`), 0, 0);
	});

	pi.on("agent_start", async () => {
		runStart = Date.now();
		totalOutputTokens = 0;
		totalStreamMs = 0;
		messageStart = null;
		streamStart = null;
		estimatedStreamedTokens = 0;
	});

	pi.on("message_start", async (event) => {
		if (event.message.role !== "assistant") return;
		messageStart = Date.now();
		streamStart = null;
		estimatedStreamedTokens = 0;
	});

	pi.on("message_update", async (event, ctx) => {
		if (!ctx.hasUI || event.message.role !== "assistant") return;

		const streamEvent = event.assistantMessageEvent;
		const delta = streamEvent?.delta;
		const isOutputDelta =
			streamEvent?.type === "text_delta" ||
			streamEvent?.type === "thinking_delta" ||
			streamEvent?.type === "toolcall_delta";

		if (!isOutputDelta || typeof delta !== "string") return;

		const now = Date.now();
		streamStart ??= now;
		estimatedStreamedTokens += Math.max(0, delta.length / 4);

		const elapsed = (now - streamStart) / 1000;
		const officialTokens = event.message.usage?.output ?? 0;
		const currentTokens =
			officialTokens > 0 ? officialTokens : estimatedStreamedTokens;

		if (elapsed > 0 && currentTokens > 0) {
			const tps = Math.round(currentTokens / elapsed);
			ctx.ui.setWorkingMessage(
				`Working · ${tps} t/s (${keyText("app.interrupt")} to interrupt)`,
			);
		}
	});

	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;
		// Between messages (tool calls), drop the stale rate.
		if (ctx.hasUI) ctx.ui.setWorkingMessage();

		const messageTokens = event.message.usage?.output ?? 0;
		const timingStart = streamStart ?? messageStart;
		if (!timingStart || messageTokens <= 0) {
			messageStart = null;
			streamStart = null;
			estimatedStreamedTokens = 0;
			return;
		}

		totalOutputTokens += messageTokens;
		totalStreamMs += Math.max(0, Date.now() - timingStart);

		messageStart = null;
		streamStart = null;
		estimatedStreamedTokens = 0;
	});

	pi.on("agent_end", async (event, ctx) => {
		if (ctx.hasUI) ctx.ui.setWorkingMessage();
		if (runStart === null) return;

		const elapsed = totalStreamMs / 1000;
		const cost = (event.messages ?? [])
			.filter((message: any) => message.role === "assistant")
			.reduce((sum: number, message: any) => sum + messageCost(message), 0);
		const receipt: TurnReceipt = {
			elapsedMs: Date.now() - runStart,
			output: totalOutputTokens,
			tps: totalOutputTokens > 0 && elapsed > 0 ? Math.round(totalOutputTokens / elapsed) : 0,
			cost,
			contextPercent: ctx.getContextUsage?.()?.percent ?? undefined,
		};
		runStart = null;
		if (ctx.hasUI) pi.appendEntry<TurnReceipt>(TURN_ENTRY, receipt);
	});
}
