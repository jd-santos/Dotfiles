// @ts-nocheck

/**
 * Pure helpers for the Herdr agent title.
 *
 * Kept free of Pi imports so the parsing, cleaning, and composition logic can be
 * unit tested with node:test.
 */

export const MAX_AGENT_TITLE_CHARS = 80;
export const MAX_SUMMARY_CHARS = 120;

export function collapseWhitespace(value: unknown): string {
	return String(value ?? "")
		.replace(/\s+/g, " ")
		.trim();
}

export function cleanPhrase(value: unknown, maxChars: number): string {
	return collapseWhitespace(value)
		.replace(/^[-*\s]+/, "")
		.replace(/^['"`]+|['"`]+$/g, "")
		.replace(/[.!?]+$/g, "")
		.slice(0, maxChars)
		.trim();
}

export function truncatePhrase(value: unknown, maxChars: number): string {
	const text = collapseWhitespace(value);
	if (text.length <= maxChars) return text;

	const slice = text.slice(0, Math.max(0, maxChars - 1));
	const lastSpace = slice.lastIndexOf(" ");
	const base = (
		lastSpace > maxChars * 0.5 ? slice.slice(0, lastSpace) : slice
	).trimEnd();
	return `${base}…`;
}

export function parseSummaryResponse(raw: unknown): {
	title?: string;
	summary?: string;
} {
	const text = String(raw ?? "").trim();
	if (!text) return {};

	const titleMatch = text.match(/^title\s*:\s*(.+)$/im);
	const summaryMatch = text.match(/^summary\s*:\s*(.+)$/im);

	if (!titleMatch && !summaryMatch) {
		const summary = cleanPhrase(text, MAX_SUMMARY_CHARS);
		return summary ? { summary } : {};
	}

	const title = titleMatch
		? cleanPhrase(titleMatch[1], MAX_AGENT_TITLE_CHARS)
		: "";
	const summary = summaryMatch
		? cleanPhrase(summaryMatch[1], MAX_SUMMARY_CHARS)
		: "";

	return {
		...(title ? { title } : {}),
		...(summary ? { summary } : {}),
	};
}

export function formatForkSuffix(parentTitle: unknown): string {
	const parent = cleanPhrase(parentTitle, MAX_AGENT_TITLE_CHARS);
	return parent ? ` ↳ ${parent}` : "";
}

export function composeAgentTitle(options: {
	title: unknown;
	parentTitle?: unknown;
	maxChars?: number;
}): string {
	const maxChars = options.maxChars ?? MAX_AGENT_TITLE_CHARS;
	const title = cleanPhrase(options.title, MAX_AGENT_TITLE_CHARS);
	if (!title) return "";

	const suffix = formatForkSuffix(options.parentTitle);
	const available = maxChars - suffix.length;

	if (available <= 2) {
		return truncatePhrase(`${title}${suffix}`, maxChars);
	}

	return `${truncatePhrase(title, available)}${suffix}`;
}