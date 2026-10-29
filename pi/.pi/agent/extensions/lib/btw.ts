import { Buffer } from "node:buffer";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Message, Model } from "@earendil-works/pi-ai";

export const BTW_OUTPUT_LIMIT = 2048;
export const BTW_TIMEOUT_MS = 120_000;
export const BTW_USAGE = "Usage: /btw [--last [N]] question (bare --last means one exchange)";

export function parseBtwArgs(args: string): { question: string; last?: number } {
	let text = args.trim();
	let last: number | undefined;
	if (/^--last(?:\s|$)/.test(text)) {
		text = text.slice(6).trimStart();
		last = 1;
		const count = text.match(/^(-?\d+)(?:\s|$)/);
		if (count) {
			last = Number(count[1]);
			if (last === -1) last = 1;
			if (!Number.isSafeInteger(last) || last < 1) throw new Error(BTW_USAGE);
			text = text.slice(count[0].length).trimStart();
		}
	}
	if (text.startsWith("-- ")) text = text.slice(3).trimStart();
	else if (text.startsWith("--")) throw new Error(BTW_USAGE);
	if (!text) throw new Error(BTW_USAGE);
	return { question: text, last };
}

/** Count real user requests before converting injected messages into provider user messages. */
export function selectBtwMessages(messages: AgentMessage[], last?: number): AgentMessage[] {
	if (last === undefined) return structuredClone(messages);
	const starts = messages.flatMap((message, index) => message.role === "user" ? [index] : []);
	if (!starts.length) throw new Error("No user exchange is available yet.");
	const start = starts[Math.max(0, starts.length - last)];
	// Replay prompt/tool deltas, but exclude older conversation and compaction summaries.
	return structuredClone([
		...messages.slice(0, start).filter((message) => message.role === "system"),
		...messages.slice(start),
	]);
}

/** A running tool batch may have only some results. Never send an unmatched call/result. */
export function completeToolPairs(messages: Message[]): { messages: Message[]; omitted: number } {
	const calls = new Set<string>();
	const results = new Set<string>();
	for (const message of messages) {
		if (message.role === "assistant") {
			for (const block of message.content) if (block.type === "toolCall") calls.add(block.id);
		} else if (message.role === "toolResult") results.add(message.toolCallId);
	}
	let omitted = 0;
	const clean: Message[] = [];
	for (const message of structuredClone(messages)) {
		if (message.role === "toolResult" && !calls.has(message.toolCallId)) { omitted++; continue; }
		if (message.role === "assistant") {
			message.content = message.content.filter((block: AssistantMessage["content"][number]) => {
				if (block.type !== "toolCall" || results.has(block.id)) return true;
				omitted++;
				return false;
			});
			if (!message.content.length) continue;
		}
		clean.push(message);
	}
	return { messages: clean, omitted };
}

export type Payload = Record<string, unknown> & {
	thinking?: { type?: string; budget_tokens?: number };
};
export const SUPPORTED_APIS = new Set(["openai-responses", "openai-codex-responses", "openai-completions", "anthropic-messages"]);

/** Keep cache-sensitive controls from the main request, never its continuation state. */
export function prepareBtwPayload(generated: Payload, baseline: Payload | undefined, model: Model<Api>): Payload {
	const payload = structuredClone(generated);
	for (const key of ["reasoning", "reasoning_effort", "thinking", "output_config", "text", "temperature", "top_p", "service_tier", "prompt_cache_key", "prompt_cache_retention", "prompt_cache_options", "cache_control", "provider", "session_id"]) {
		if (baseline && key in baseline) payload[key] = structuredClone(baseline[key]);
	}
	// SSE plus no server-side continuation keeps the main connection/history independent.
	delete payload.previous_response_id;
	delete payload.conversation;
	delete payload.background;
	if ("store" in payload) payload.store = false;
	payload.tool_choice = model.api === "anthropic-messages" ? { type: "none" } : "none";
	if (model.api === "openai-responses") payload.max_output_tokens = BTW_OUTPUT_LIMIT;
	else if (model.api === "openai-completions") {
		if ("max_completion_tokens" in payload) payload.max_completion_tokens = BTW_OUTPUT_LIMIT;
		else payload.max_tokens = BTW_OUTPUT_LIMIT;
	} else if (model.api === "anthropic-messages") {
		payload.max_tokens = BTW_OUTPUT_LIMIT;
		// Explicit thinking budgets must be smaller than max_tokens.
		if (payload.thinking?.type === "enabled" && typeof payload.thinking.budget_tokens === "number" && payload.thinking.budget_tokens >= BTW_OUTPUT_LIMIT) {
			payload.thinking.budget_tokens = BTW_OUTPUT_LIMIT - 1;
		}
	}
	// Codex's subscription endpoint does not expose a supported max-output parameter.
	return payload;
}

export function prefixMatches(baseline: Payload | undefined, payload: Payload): boolean {
	if (!baseline) return false;
	for (const key of ["model", "instructions", "system", "tools", "reasoning", "reasoning_effort", "text", "service_tier", "prompt_cache_key", "prompt_cache_options", "prompt_cache_retention"]) {
		if (JSON.stringify(baseline[key]) !== JSON.stringify(payload[key])) return false;
	}
	const key = Array.isArray(payload.input) ? "input" : "messages";
	const before = baseline[key];
	const after = payload[key];
	return Array.isArray(before) && Array.isArray(after) && before.length <= after.length && before.every((value, index) => JSON.stringify(value) === JSON.stringify(after[index]));
}

export interface BtwEstimate {
	inputBytes: number;
	cost?: number;
	subscription: boolean;
}

/** Serialized bytes are a deliberately pessimistic text-token proxy, not a billing guarantee. */
export function estimateBtwCost(payload: Payload, model: Model<Api>, isSubscription: boolean): BtwEstimate {
	const inputBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
	const subscription = isSubscription || model.api === "openai-codex-responses";
	const estimate: BtwEstimate = { inputBytes, subscription };
	if (subscription) return estimate;
	const rates = [model.cost, ...(model.cost?.tiers ?? [])];
	if (!model.cost || rates.some((rate) => ![rate.input, rate.output, rate.cacheWrite].every((value) => Number.isFinite(value) && value >= 0))) return estimate;
	const input = Math.max(...rates.flatMap((rate) => [rate.input * 2.5, rate.cacheWrite]));
	const output = Math.max(...rates.map((rate) => rate.output));
	if (input === 0 || output === 0) return estimate;
	// Allow for 1-hour cache-write premiums not represented by base catalog rates.
	const serviceMultiplier = payload.service_tier === "priority" ? 2.5 : 1;
	estimate.cost = ((inputBytes * input + BTW_OUTPUT_LIMIT * output) * serviceMultiplier) / 1_000_000;
	return estimate;
}

export function positiveBudget(value: unknown, fallback: number): number {
	if (value === undefined) return fallback;
	const number = Number(value);
	if (!Number.isFinite(number) || number <= 0) throw new Error("BTW budgets must be positive dollar amounts.");
	return number;
}

export class BtwBudget {
	reserved = 0;
	reserve(cost: number | undefined, perRequest: number, perSession: number): void {
		if (cost === undefined) throw new Error("Cannot estimate API cost for this model; no request sent.");
		if (cost > perRequest || this.reserved + cost > perSession) throw new Error(`Uncached estimate $${cost.toFixed(4)} exceeds the BTW budget ($${perRequest}/request, $${perSession}/session; $${this.reserved.toFixed(4)} already reserved). No request sent. Use --last to send less context or change the launch flags.`);
		this.reserved += cost;
	}
}

export function usageReceipt(response: AssistantMessage | undefined, nativeUsageSeen: boolean, subscription: boolean): string {
	if (!response || !nativeUsageSeen) return "Usage unknown; the request may still have been charged.";
	const usage = response.usage;
	const input = usage.input + usage.cacheRead + usage.cacheWrite;
	const counts = `${input.toLocaleString()} input · ${usage.cacheRead.toLocaleString()} cached · ${usage.cacheWrite.toLocaleString()} cache write · ${usage.output.toLocaleString()} output`;
	return subscription ? `${counts} · subscription quota impact unknown` : `${counts} · $${usage.cost.total.toFixed(4)} catalog estimate (not a billing receipt)`;
}
