// @ts-nocheck

/**
 * Conversation Summary Extension
 *
 * Generates a short summary for the active interactive session and publishes it
 * to the shared footer. The summary also becomes the session name shown in the
 * session selector.
 *
 * Guardrails:
 *   - Runs only when UI is available, so print-mode runs cannot trigger it
 *   - Calls the summary model directly with complete(), never by spawning pi
 *   - Uses a dedicated primary model with a configured fallback
 *   - Triggers after agent_end, once per user request instead of once per turn
 *   - Disables thinking and caps update frequency
 */
import { complete } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const SUMMARY_ENTRY_TYPE = "conversation-summary";
const SUMMARY_STATUS_KEY = "conv-summary";
const PRIMARY_SUMMARY_PROVIDER = "openai-codex";
const PRIMARY_SUMMARY_MODEL_ID = "gpt-5.4-mini";
const FALLBACK_SUMMARY_PROVIDER = "anthropic";
const FALLBACK_SUMMARY_MODEL_ID = "claude-haiku-4-5";
const PRIMARY_SUMMARY_MODEL_LABEL = `${PRIMARY_SUMMARY_PROVIDER}/${PRIMARY_SUMMARY_MODEL_ID}`;
const FALLBACK_SUMMARY_MODEL_LABEL = `${FALLBACK_SUMMARY_PROVIDER}/${FALLBACK_SUMMARY_MODEL_ID}`;

const MIN_TURNS_BETWEEN_UPDATES = 2;
const MIN_MS_BETWEEN_UPDATES = 60_000;
const MAX_AUTOMATIC_SUMMARIES_PER_SESSION = 25;
const SUMMARY_TIMEOUT_MS = 20_000;
const MAX_SKETCH_MESSAGES = 40;
const MAX_SKETCH_CHARS = 12_000;
const MAX_MESSAGE_SNIPPET_CHARS = 300;
const MAX_SUMMARY_CHARS = 120;

type SessionEntry = {
	type: string;
	customType?: string;
	data?: Record<string, unknown>;
	message?: {
		role?: string;
		content?: unknown;
	};
};

type ContentBlock = {
	type?: string;
	text?: string;
};

function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return (content as ContentBlock[])
		.filter((block) => block?.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n");
}

function buildConversationLines(entries: SessionEntry[]): string[] {
	const lines: string[] = [];

	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const role = entry.message?.role;
		if (role !== "user" && role !== "assistant") continue;

		const text = extractText(entry.message?.content).trim();
		if (!text) continue;

		const snippet =
			text.length > MAX_MESSAGE_SNIPPET_CHARS
				? `${text.slice(0, MAX_MESSAGE_SNIPPET_CHARS)}…`
				: text;
		lines.push(`${role === "user" ? "User" : "Assistant"}: ${snippet}`);
	}

	return lines;
}

function buildSketch(entries: SessionEntry[]): string {
	const lines = buildConversationLines(entries);
	const selected: string[] = [];
	let size = 0;

	for (let index = lines.length - 1; index >= 0; index -= 1) {
		if (selected.length >= MAX_SKETCH_MESSAGES) break;

		const line = lines[index];
		const nextSize = size + line.length + (selected.length > 0 ? 2 : 0);
		if (nextSize > MAX_SKETCH_CHARS && selected.length > 0) break;

		selected.unshift(
			line.length > MAX_SKETCH_CHARS
				? `${line.slice(0, MAX_SKETCH_CHARS)}…`
				: line,
		);
		size = nextSize;
	}

	if (selected.length < lines.length) {
		selected.unshift(
			`[${lines.length - selected.length} earlier messages omitted]`,
		);
	}

	return selected.join("\n\n");
}

function buildSummaryPrompt(sketch: string): string {
	return [
		"Write a very short summary (8-15 words max) of what this conversation is about.",
		"Focus on the main task or goal. No quotes, no punctuation at the end, no preamble.",
		"Just the summary phrase itself.",
		"",
		"<conversation>",
		sketch,
		"</conversation>",
	].join("\n");
}

function cleanSummary(summary: string): string {
	return summary
		.trim()
		.replace(/^[-*\s]+/, "")
		.replace(/^['"`]+|['"`]+$/g, "")
		.replace(/[.!?]+$/g, "")
		.slice(0, MAX_SUMMARY_CHARS)
		.trim();
}

function countAssistantMessages(entries: SessionEntry[]): number {
	return entries.filter(
		(entry) => entry.type === "message" && entry.message?.role === "assistant",
	).length;
}

function getStoredNumber(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return value;
}

export default function (pi: ExtensionAPI) {
	let currentSummary: string | undefined;
	let lastSummaryAtTurn = 0;
	let lastAttemptAt = 0;
	let automaticSummaryCount = 0;
	let capNoticeShown = false;
	let authNoticeShown = false;
	let generating = false;
	let sessionSerial = 0;
	let activeSummaryController: AbortController | undefined;

	// Restore summary state on session load.
	pi.on("session_start", (_event, ctx) => {
		sessionSerial += 1;
		currentSummary = undefined;
		lastSummaryAtTurn = 0;
		lastAttemptAt = 0;
		automaticSummaryCount = 0;
		capNoticeShown = false;
		authNoticeShown = false;
		generating = false;
		activeSummaryController?.abort();
		activeSummaryController = undefined;

		for (const entry of ctx.sessionManager.getEntries() as SessionEntry[]) {
			if (entry.type !== "custom" || entry.customType !== SUMMARY_ENTRY_TYPE) {
				continue;
			}

			const source = entry.data?.source;
			const stored = entry.data?.summary;
			if (source === "manual-clear") {
				currentSummary = undefined;
				lastSummaryAtTurn =
					getStoredNumber(entry.data?.turnCount) ?? lastSummaryAtTurn;
				automaticSummaryCount =
					getStoredNumber(entry.data?.automaticSummaryCount) ?? 0;
				continue;
			} else if (typeof stored === "string" && stored) {
				currentSummary = stored;
				lastSummaryAtTurn =
					getStoredNumber(entry.data?.turnCount) ?? lastSummaryAtTurn;
			}

			const storedCount = getStoredNumber(entry.data?.automaticSummaryCount);
			if (storedCount !== undefined) {
				automaticSummaryCount = Math.max(automaticSummaryCount, storedCount);
			} else if (source !== "manual" && source !== "manual-clear") {
				automaticSummaryCount += 1;
			}
		}

		if (ctx.hasUI) {
			ctx.ui.setStatus(
				SUMMARY_STATUS_KEY,
				currentSummary ?? "(awaiting first exchange)",
			);
			if (currentSummary) pi.setSessionName(currentSummary);
		}
	});

	pi.on("session_shutdown", (_event, ctx) => {
		sessionSerial += 1;
		activeSummaryController?.abort();
		activeSummaryController = undefined;
		if (ctx.hasUI) ctx.ui.setStatus(SUMMARY_STATUS_KEY, undefined);
	});

	async function generateSummary(
		sketch: string,
		turnCount: number,
		ctx: ExtensionContext,
		expectedSessionSerial: number,
	) {
		const candidates = [
			{
				provider: PRIMARY_SUMMARY_PROVIDER,
				modelId: PRIMARY_SUMMARY_MODEL_ID,
				label: PRIMARY_SUMMARY_MODEL_LABEL,
			},
			{
				provider: FALLBACK_SUMMARY_PROVIDER,
				modelId: FALLBACK_SUMMARY_MODEL_ID,
				label: FALLBACK_SUMMARY_MODEL_LABEL,
			},
		];

		let selectedModel;
		let auth;
		const errors: string[] = [];

		for (const candidate of candidates) {
			const model = ctx.modelRegistry.find(candidate.provider, candidate.modelId);
			if (!model) {
				errors.push(`Summary model not found: ${candidate.label}`);
				continue;
			}

			const candidateAuth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (!candidateAuth.ok || !candidateAuth.apiKey) {
				errors.push(
					candidateAuth.ok
						? `No API key for ${candidate.label}`
						: candidateAuth.error,
				);
				continue;
			}

			selectedModel = model;
			auth = candidateAuth;
			break;
		}

		if (!selectedModel || !auth) {
			if (ctx.hasUI && !authNoticeShown) {
				ctx.ui.notify(errors.join(" | "), "warning");
				authNoticeShown = true;
			}
			return;
		}

		if (expectedSessionSerial !== sessionSerial) return;

		const controller = new AbortController();
		activeSummaryController = controller;
		const timeout = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);

		try {
			if (ctx.hasUI) {
				ctx.ui.setStatus(
					SUMMARY_STATUS_KEY,
					currentSummary ? `${currentSummary} ↻` : "(generating summary...)",
				);
			}

			const response = await complete(
				selectedModel,
				{
					messages: [
						{
							role: "user" as const,
							content: [
								{ type: "text" as const, text: buildSummaryPrompt(sketch) },
							],
							timestamp: Date.now(),
						},
					],
				},
				{
					apiKey: auth.apiKey,
					headers: auth.headers,
					maxTokens: 64,
					thinkingEnabled: false,
					maxRetries: 0,
					maxRetryDelayMs: 5_000,
					signal: controller.signal,
					timeoutMs: SUMMARY_TIMEOUT_MS,
				},
			);

			if (expectedSessionSerial !== sessionSerial || controller.signal.aborted)
				return;
			if (response.stopReason === "error") {
				throw new Error(
					response.errorMessage ?? "summary model returned an error",
				);
			}

			const summary = cleanSummary(
				response.content
					.filter(
						(content): content is { type: "text"; text: string } =>
							content.type === "text",
					)
					.map((content) => content.text)
					.join("\n"),
			);

			if (!summary) {
				if (ctx.hasUI)
					ctx.ui.setStatus(
						SUMMARY_STATUS_KEY,
						currentSummary ?? "(empty summary)",
					);
				return;
			}

			automaticSummaryCount += 1;
			currentSummary = summary;
			lastSummaryAtTurn = turnCount;

			pi.appendEntry(SUMMARY_ENTRY_TYPE, {
				summary,
				turnCount,
				source: "auto",
				generatedAt: Date.now(),
				automaticSummaryCount,
			});
			pi.setSessionName(summary);
			if (ctx.hasUI) ctx.ui.setStatus(SUMMARY_STATUS_KEY, summary);
		} catch (err) {
			if (ctx.hasUI && expectedSessionSerial === sessionSerial) {
				const message = err instanceof Error ? err.message : String(err);
				ctx.ui.setStatus(
					SUMMARY_STATUS_KEY,
					currentSummary ?? `(summary error: ${message})`,
				);
			}
		} finally {
			clearTimeout(timeout);
			if (activeSummaryController === controller)
				activeSummaryController = undefined;
		}
	}

	// Trigger once after a full user request completes.
	pi.on("agent_end", (_event, ctx) => {
		if (!ctx.hasUI) return;
		if (generating) return;

		const branch = ctx.sessionManager.getBranch() as SessionEntry[];
		const turnCount = countAssistantMessages(branch);
		if (turnCount < 1) return;

		if (
			currentSummary &&
			turnCount - lastSummaryAtTurn < MIN_TURNS_BETWEEN_UPDATES
		) {
			return;
		}

		if (automaticSummaryCount >= MAX_AUTOMATIC_SUMMARIES_PER_SESSION) {
			if (!capNoticeShown) {
				ctx.ui.notify(
					`Automatic summaries paused after ${MAX_AUTOMATIC_SUMMARIES_PER_SESSION} updates in this session`,
					"warning",
				);
				capNoticeShown = true;
			}
			return;
		}

		const now = Date.now();
		if (now - lastAttemptAt < MIN_MS_BETWEEN_UPDATES) return;

		const sketch = buildSketch(branch);
		if (!sketch.trim()) return;

		lastAttemptAt = now;
		generating = true;
		const expectedSessionSerial = sessionSerial;
		void generateSummary(sketch, turnCount, ctx, expectedSessionSerial)
			.catch((err) => {
				if (ctx.hasUI && expectedSessionSerial === sessionSerial) {
					const message = err instanceof Error ? err.message : String(err);
					ctx.ui.setStatus(
						SUMMARY_STATUS_KEY,
						currentSummary ?? `(summary error: ${message})`,
					);
				}
			})
			.finally(() => {
				generating = false;
			});
	});

	// Manual control.
	pi.registerCommand("summary", {
		description:
			"Show, set, or clear (/summary clear) the conversation summary",
		handler: async (args, ctx) => {
			const text = String(args || "").trim();
			if (text === "clear") {
				currentSummary = undefined;
				lastSummaryAtTurn = 0;
				lastAttemptAt = 0;
				automaticSummaryCount = 0;
				capNoticeShown = false;
				authNoticeShown = false;
				generating = false;
				activeSummaryController?.abort();
				activeSummaryController = undefined;
				pi.setSessionName("");
				pi.appendEntry(SUMMARY_ENTRY_TYPE, {
					summary: "",
					turnCount: 0,
					source: "manual-clear",
					automaticSummaryCount,
				});
				if (ctx.hasUI) {
					ctx.ui.setStatus(SUMMARY_STATUS_KEY, "(awaiting next exchange)");
					ctx.ui.notify("Summary cleared", "info");
				}
			} else if (text) {
				currentSummary = text.slice(0, MAX_SUMMARY_CHARS);
				lastSummaryAtTurn = countAssistantMessages(
					ctx.sessionManager.getBranch() as SessionEntry[],
				);
				pi.appendEntry(SUMMARY_ENTRY_TYPE, {
					summary: currentSummary,
					turnCount: lastSummaryAtTurn,
					source: "manual",
					automaticSummaryCount,
				});
				pi.setSessionName(currentSummary);
				if (ctx.hasUI) {
					ctx.ui.setStatus(SUMMARY_STATUS_KEY, currentSummary);
					ctx.ui.notify(`Summary: ${currentSummary}`, "info");
				}
			} else if (ctx.hasUI && currentSummary) {
				ctx.ui.notify(`Summary: ${currentSummary}`, "info");
			} else if (ctx.hasUI) {
				ctx.ui.notify("No summary yet", "info");
			}
		},
	});
}
