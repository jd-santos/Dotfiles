import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Message, Model, ThinkingLevel } from "@earendil-works/pi-ai";
import {
	buildSessionContext,
	convertToLlm,
	sessionEntryToContextMessages,
	type ExtensionAPI,
	type ExtensionContext,
	type ExtensionCommandContext,
	type ContextWithSystemEvent,
	type BeforeProviderRequestEvent,
	type SessionEntry,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import {
	BtwBudget, BTW_OUTPUT_LIMIT, BTW_TIMEOUT_MS, BTW_USAGE, SUPPORTED_APIS,
	completeToolPairs, estimateBtwCost, parseBtwArgs, positiveBudget,
	prefixMatches, prepareBtwPayload, selectBtwMessages, usageReceipt,
	type Payload,
} from "./lib/btw.ts";
import { BtwOverlay } from "./lib/btw-ui.ts";

interface Snapshot {
	messages: AgentMessage[];
	leaf: string | null;
	sessionId: string;
	provider?: string;
	model?: string;
	payload?: Payload;
}

interface Operation {
	controller: AbortController;
	close?: () => void;
}

interface RequestPlan {
	model: Model<Api>;
	messages: Message[];
	baseline?: Payload;
	question: string;
	scope: string;
	partial: boolean;
	omitted: number;
	reasoning?: ThinkingLevel;
	sessionId: string;
	budget: BtwBudget;
	perRequest: number;
	perSession: number;
}

function isPayload(value: unknown): value is Payload {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function seesUsage(value: unknown): boolean {
	if (!isPayload(value)) return false;
	let usage = value.usage;
	if (!isPayload(usage) && isPayload(value.response)) usage = value.response.usage;
	if (!isPayload(usage) && isPayload(value.message)) usage = value.message.usage;
	if (!isPayload(usage)) return false;
	const validCount = (count: unknown): boolean => typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
	return (validCount(usage.input_tokens) && validCount(usage.output_tokens)) ||
		(validCount(usage.prompt_tokens) && validCount(usage.completion_tokens));
}

function snapshotMessages(snapshot: Snapshot | undefined, ctx: ExtensionContext): AgentMessage[] {
	const branch = ctx.sessionManager.getBranch();
	if (snapshot && snapshot.sessionId === ctx.sessionManager.getSessionId()) {
		const index = snapshot.leaf === null ? -1 : branch.findIndex((entry: SessionEntry) => entry.id === snapshot.leaf);
		if (snapshot.leaf === null || index >= 0) {
			return structuredClone([...snapshot.messages, ...branch.slice(index + 1).flatMap(sessionEntryToContextMessages)]);
		}
	}
	const messages = buildSessionContext(branch).messages;
	if (messages[0]?.role !== "system") {
		throw new Error("No effective prompt/tool snapshot is available. Send one main conversation request after /reload, then retry /btw.");
	}
	return structuredClone(messages);
}

function assistantText(message: AssistantMessage): string {
	return message.content.flatMap((part: AssistantMessage["content"][number]) => part.type === "text" ? [part.text] : []).join("\n");
}

async function runRequest(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	plan: RequestPlan,
	operation: Operation,
	view: BtwOverlay,
	isCurrent: () => boolean,
): Promise<void> {
	const { model, scope, partial, budget } = plan;
	const requestId = randomUUID();
	const subscription = model.api === "openai-codex-responses" || (
		ctx.modelRegistry.isUsingOAuth(model) &&
		ctx.modelRegistry.getProvider(model.provider)?.auth.oauth?.isSubscription === true
	);
	let response: AssistantMessage | undefined;
	let nativeUsageSeen = false;
	let dispatched = false;
	let reservedEstimate: number | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let localError: string | undefined;
	const block = (message: string): never => { localError = message; throw new Error(message); };

	try {
		const stream = ctx.modelRegistry.streamSimple(model, { messages: plan.messages }, {
			signal: operation.controller.signal,
			sessionId: plan.sessionId,
			transport: "sse",
			reasoning: plan.reasoning,
			toolChoice: "none",
			maxTokens: BTW_OUTPUT_LIMIT,
			maxRetries: 0,
			maxRetryDelayMs: 1,
			timeoutMs: BTW_TIMEOUT_MS,
			onProviderStreamEvent: (event: unknown) => { nativeUsageSeen ||= seesUsage(event); },
			onPayload: async (generated: unknown) => {
				if (!isPayload(generated)) return block("Unsupported request payload. No request sent.");
				const payload = prepareBtwPayload(generated, plan.baseline, model);
				const estimate = estimateBtwCost(payload, model, subscription);
				let price = "**Subscription quota impact is unknown. API dollar budgets do not apply.**";
				if (!subscription) {
					if (estimate.cost === undefined) return block("No usable API pricing is available. No request sent.");
					price = `**Conservative uncached catalog estimate: $${estimate.cost.toFixed(4)}**, including up to ${BTW_OUTPUT_LIMIT} output tokens and cache-write allowance. This is an estimate, not an enforceable billing cap. API budget: $${plan.perRequest}/request, $${plan.perSession}/session; $${budget.reserved.toFixed(4)} already reserved.`;
				}
				await view.requestApproval([
					`**${model.provider}/${model.id}** · ${scope}${partial ? " (partial exchange)" : ""}`,
					price,
					"Cache reuse is not guaranteed. Cancellation after dispatch may still incur charges.",
					`${estimate.inputBytes.toLocaleString()} serialized request bytes. ${plan.omitted ? `${plan.omitted} unmatched tool call/result blocks omitted.` : ""}`,
					prefixMatches(plan.baseline, payload) ? "Main request prefix matches locally. Cache reuse is still NOT guaranteed." : "No verified matching main request prefix. Assume an uncached request.",
					model.api === "openai-codex-responses" ? "Codex does not expose a supported output-token cap here. A two-minute timeout bounds elapsed time, not quota use." : `Output limit: ${BTW_OUTPUT_LIMIT} tokens; no automatic retries.`,
					"This sends a separate request now. The main agent is not paused; the side question and answer are not added to its model history. Esc cancels only this request.",
					`Question preview: ${plan.question.replace(/\s+/g, " ").slice(0, 240)}${plan.question.length > 240 ? "…" : ""}`,
				].join("\n\n"));
				if (operation.controller.signal.aborted || !isCurrent()) return block("Side question cancelled before dispatch.");
				if (!subscription) {
					try { budget.reserve(estimate.cost, plan.perRequest, plan.perSession); }
					catch (error) { return block((error as Error).message); }
				}
				reservedEstimate = estimate.cost;
				// Persist the reservation before dispatch so reload/resume cannot reset the budget.
				pi.appendEntry("btw-request", { requestId, provider: model.provider, model: model.id, scope, subscription, reservedEstimate });
				dispatched = true;
				timer = setTimeout(() => operation.controller.abort(), BTW_TIMEOUT_MS);
				return payload;
			},
		});
		for await (const event of stream) {
			if (event.type === "text_delta") view.setText(assistantText(event.partial));
		}
		response = await stream.result();
		if (response.stopReason === "error" || response.stopReason === "aborted") throw new Error("Side request did not finish.");
		const receipt = usageReceipt(response, nativeUsageSeen, subscription);
		const text = assistantText(response) || "No text answer returned.";
		const warning = response.stopReason === "toolUse" ? "\n\nTool use was requested but NOT executed." : response.stopReason === "length" ? "\n\nAnswer reached the output limit." : "";
		view.finish(`${text}${warning}\n\n**Usage:** ${receipt}`, receipt);
	} catch {
		// Raw provider errors can contain prompts or headers. Only our own errors are displayed.
		const receipt = dispatched ? usageReceipt(response, nativeUsageSeen, subscription) : "No inference request was sent.";
		const text = localError ?? (dispatched ? "Side request failed, was cancelled, or timed out. No tools were executed." : "Side request was cancelled or blocked before dispatch. Check authentication, model pricing, and BTW budget flags.");
		view.finish(`${text}\n\n**Usage:** ${receipt}`, receipt);
	} finally {
		if (timer) clearTimeout(timer);
		if (dispatched && isCurrent()) {
			pi.appendEntry("btw-usage", {
				requestId, provider: model.provider, model: model.id, scope, partial,
				reservedEstimate, subscription, nativeUsageSeen,
				usage: nativeUsageSeen ? response?.usage : undefined,
				stopReason: response?.stopReason ?? "unknown",
			});
		}
	}
}

async function openOverlay(
	pi: ExtensionAPI, ctx: ExtensionContext, plan: RequestPlan,
	operation: Operation, isCurrent: () => boolean,
): Promise<void> {
	let work: Promise<void> | undefined;
	try {
		await ctx.ui.custom<void>((tui: TUI, theme: Theme, _keys: unknown, done: () => void) => {
			const title = `BTW · ${plan.scope}${plan.partial ? " · partial exchange" : ""}`;
			const view = new BtwOverlay(tui, theme, title, operation.controller, done);
			operation.close = () => view.close();
			work = runRequest(pi, ctx, plan, operation, view, isCurrent).catch(() => {
				view.finish("The side request ended, but its usage record could not be saved.", "Usage unknown; the request may have been charged.");
			});
			return view;
		}, { overlay: true, overlayOptions: { width: "90%", maxHeight: "80%", anchor: "center" } });
	} catch {
		if (isCurrent()) ctx.ui.notify("BTW overlay closed unexpectedly; the side request was cancelled.", "warning");
	} finally {
		operation.controller.abort();
		await work;
	}
}

export default function btw(pi: ExtensionAPI): void {
	let pending: Snapshot | undefined;
	let snapshot: Snapshot | undefined;
	let budget = new BtwBudget();
	let sessionSerial = 0;
	let active: Operation | undefined;

	pi.registerFlag("btw-max-cost", { description: "Maximum conservative catalog estimate per BTW API request, USD (default 1)", type: "string" });
	pi.registerFlag("btw-session-budget", { description: "Maximum reserved BTW API estimates per session, USD (default 5)", type: "string" });

	const resetSnapshot = () => { pending = undefined; snapshot = undefined; };
	const closeActive = () => { active?.controller.abort(); active?.close?.(); };
	pi.on("session_start", (_event: unknown, ctx: ExtensionContext) => {
		closeActive(); sessionSerial++; resetSnapshot(); budget = new BtwBudget();
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type !== "custom" || entry.customType !== "btw-request") continue;
			const data = entry.data as { reservedEstimate?: unknown } | undefined;
			if (typeof data?.reservedEstimate === "number" && Number.isFinite(data.reservedEstimate) && data.reservedEstimate > 0) budget.reserved += data.reservedEstimate;
		}
	});
	pi.on("session_shutdown", () => { closeActive(); sessionSerial++; resetSnapshot(); });
	pi.on("session_tree", () => { closeActive(); sessionSerial++; resetSnapshot(); });
	pi.on("session_compact", resetSnapshot);
	pi.on("model_select", resetSnapshot);
	pi.on("context_with_system", (event: ContextWithSystemEvent, ctx: ExtensionContext) => {
		pending = {
			messages: event.messages,
			leaf: ctx.sessionManager.getLeafId(),
			sessionId: ctx.sessionManager.getSessionId(),
			provider: ctx.model?.provider,
			model: ctx.model?.id,
		};
	});
	pi.on("before_provider_request", (event: BeforeProviderRequestEvent) => {
		if (!pending || !isPayload(event.payload)) return;
		snapshot = structuredClone({ ...pending, payload: event.payload });
		pending = undefined;
	});

	pi.registerCommand("btw", {
		description: "Ask an isolated side question; --last [N] selects recent exchanges (default 1)",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (ctx.mode !== "tui") { ctx.ui.notify("/btw requires the interactive terminal UI.", "error"); return; }
			if (args.trim() === "--help" || !args.trim()) { ctx.ui.notify(BTW_USAGE, "info"); return; }
			if (active) { ctx.ui.notify("A BTW overlay is already open. Close it before asking another side question.", "warning"); return; }
			try {
				const { question, last } = parseBtwArgs(args);
				const model = ctx.model;
				if (!model || !SUPPORTED_APIS.has(model.api)) throw new Error("/btw currently supports OpenAI Responses, Codex, Chat Completions (including OpenRouter), and Anthropic Messages.");
				const perRequest = positiveBudget(pi.getFlag("btw-max-cost"), 1);
				const perSession = positiveBudget(pi.getFlag("btw-session-budget"), 5);
				const current = snapshot?.provider === model.provider && snapshot?.model === model.id ? structuredClone(snapshot) : undefined;
				const selected = selectBtwMessages(snapshotMessages(current, ctx), last);
				const { messages, omitted } = completeToolPairs(convertToLlm(selected));
				const partial = !ctx.isIdle();
				const scope = last === undefined ? "full current context" : `last ${last} exchange${last === 1 ? "" : "s"}`;
				messages.push({ role: "user", timestamp: Date.now(), content: [{ type: "text", text:
					`Side question only. Answer concisely using the supplied context and your existing knowledge. Do not continue earlier tasks, execute tools, or claim to have performed new work. If the context is insufficient, say so. Context scope: ${scope}${partial ? "; current exchange is still in progress; only finalized messages are included" : ""}.\n\n${question}`,
				}] });
				const thinking = pi.getThinkingLevel();
				const plan: RequestPlan = {
					model, messages, baseline: current?.payload, question, scope, partial, omitted,
					reasoning: thinking === "off" ? undefined : thinking, sessionId: ctx.sessionManager.getSessionId(),
					budget, perRequest, perSession,
				};
				const operation: Operation = { controller: new AbortController() };
				active = operation;
				const serial = sessionSerial;
				// No parent prompts, steering, settings changes, or tool execution.
				void openOverlay(pi, ctx, plan, operation, () => serial === sessionSerial)
					.finally(() => { if (active === operation) active = undefined; })
					.catch(() => { /* UI shutdown can invalidate notification methods too. */ });
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : BTW_USAGE, "error");
			}
		},
	});
}
