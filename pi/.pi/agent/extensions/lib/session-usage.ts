// Session usage read from the active branch, shared by the footer and the shelf.
// Reading the branch (not counting live events) keeps the figures right after
// reload, resume, and /tree navigation.

export type UsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
};

type Entry = { type?: string; customType?: string; data?: unknown; message?: any };

function assistantMessages(entries: readonly Entry[]): any[] {
	return entries
		.filter((entry) => entry.type === "message" && entry.message?.role === "assistant")
		.map((entry) => entry.message);
}

export function usageTotals(entries: readonly Entry[]): UsageTotals {
	const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
	for (const message of assistantMessages(entries)) {
		const usage = message.usage;
		if (!usage) continue;
		totals.input += Number(usage.input ?? 0) || 0;
		totals.output += Number(usage.output ?? 0) || 0;
		totals.cacheRead += Number(usage.cacheRead ?? usage.cachedInput ?? usage.cached_input_tokens ?? 0) || 0;
		totals.cacheWrite += Number(usage.cacheWrite ?? usage.cache_write_input_tokens ?? 0) || 0;
		totals.cost += Number(typeof usage.cost === "number" ? usage.cost : usage.cost?.total ?? 0) || 0;
	}
	return totals;
}

/** Model-issued tool calls on this branch, most used first. */
export function toolCallCounts(entries: readonly Entry[]): Array<[string, number]> {
	const counts = new Map<string, number>();
	for (const message of assistantMessages(entries)) {
		if (!Array.isArray(message.content)) continue;
		for (const part of message.content) {
			if (part?.type !== "toolCall" || typeof part.name !== "string") continue;
			counts.set(part.name, (counts.get(part.name) ?? 0) + 1);
		}
	}
	return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function latestCustomData<T>(entries: readonly Entry[], customType: string): T | undefined {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry.type === "custom" && entry.customType === customType) return entry.data as T;
	}
	return undefined;
}

export function latestAssistantModel(entries: readonly Entry[]): string | undefined {
	const messages = assistantMessages(entries);
	const model = messages.at(-1)?.model;
	return typeof model === "string" && model ? model : undefined;
}
