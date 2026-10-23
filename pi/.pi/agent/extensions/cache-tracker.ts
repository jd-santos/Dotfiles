// @ts-nocheck

/**
 * Tracks prompt-cache reuse per model from session usage.
 *
 * Every assistant message reports how much of its prompt was read from cache
 * (`usage.cacheRead`), written to cache (`usage.cacheWrite`), or billed as
 * plain input. This extension turns that into a reuse rate per turn, per
 * model, and per session; a warm/cold countdown from the model's cache rule
 * (lib/cache-rules.ts); rewrites (a near-total miss after a warm turn) with a
 * likely cause; and input cost against the same tokens uncached. It also
 * records when Pi's own cache warmer refreshed the entry.
 *
 * It shows a compact footer status (`92% warm 3:12`) and a "Cache" section in
 * the shelf drawer. Nothing is sent to the model.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import {
	type CacheRetention,
	type ResolvedCacheRule,
	cacheRuleFor,
	defaultRetention,
	inputPriceFor,
	ttlSecondsFor,
} from "./lib/cache-rules.ts";
import { formatCount, formatMoney, shortenMiddle, type ThemeLike } from "./lib/shell-layout.ts";
import { refreshShelf, registerShelfSection } from "./lib/shelf.ts";

/** Pi's own noise floor for counted misses (dist/core/cache-stats.js). */
export const MISS_NOISE_FLOOR_TOKENS = 1024;
/** A turn that reads less than this share of the previous prompt is a rewrite. */
export const REWRITE_REUSE_BELOW = 0.1;
const TICK_WARM_MS = 1_000;
const TICK_IDLE_MS = 30_000;
const SPARK = "▁▂▃▄▅▆▇█";

export type RewriteCause =
	| "compaction"
	| "branch change"
	| "model switch"
	| "thinking change"
	| "idle past ttl"
	| "unknown";

export interface Rewrite {
	at: number;
	modelKey: string;
	cause: RewriteCause;
	gapMs: number;
	missedTokens: number;
}

export interface Turn {
	at: number;
	modelKey: string;
	prompt: number;
	input: number;
	cacheRead: number;
	cacheWrite: number;
	reuse: number;
	inputCost: number;
	uncachedCost?: number;
	thinking?: string;
	rewrite?: Rewrite;
}

export interface WarmRun {
	at: number;
	modelKey: string;
	cost: number;
	cacheRead: number;
}

export interface ModelStats {
	key: string;
	provider: string;
	model: string;
	turns: number;
	prompt: number;
	input: number;
	cacheRead: number;
	cacheWrite: number;
	inputCost: number;
	/** Cost of the same prompt tokens at the input price; undefined if any turn lacked a price. */
	uncachedCost?: number;
	lastRequestAt?: number;
	lastReuse?: number;
	rewrites: Rewrite[];
	warms: WarmRun[];
}

export interface CacheState {
	turns: Turn[];
	models: Map<string, ModelStats>;
	warms: WarmRun[];
	rewrites: Rewrite[];
	lastRequest?: { at: number; modelKey: string };
}

export type RuleLookup = (provider: string, modelId: string) => ResolvedCacheRule;

export interface AnalyzeOptions {
	ruleFor: RuleLookup;
	retention?: CacheRetention;
}

function num(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

function promptTokens(usage: any): number {
	return num(usage?.input) + num(usage?.cacheRead) + num(usage?.cacheWrite);
}

function inputSideCost(usage: any): number {
	const cost = usage?.cost;
	if (!cost || typeof cost !== "object") return 0;
	return num(cost.input) + num(cost.cacheRead) + num(cost.cacheWrite);
}

function statsFor(state: CacheState, provider: string, model: string): ModelStats {
	const key = `${provider}/${model}`;
	let stats = state.models.get(key);
	if (!stats) {
		stats = {
			key,
			provider,
			model,
			turns: 0,
			prompt: 0,
			input: 0,
			cacheRead: 0,
			cacheWrite: 0,
			inputCost: 0,
			uncachedCost: 0,
			rewrites: [],
			warms: [],
		};
		state.models.set(key, stats);
	}
	return stats;
}

function entryTime(entry: any): number {
	const parsed = Date.parse(entry?.timestamp ?? "");
	return Number.isFinite(parsed) ? parsed : 0;
}

/** Rebuild cache state from session entries in branch order. */
export function analyzeEntries(entries: readonly any[], options: AnalyzeOptions): CacheState {
	const retention = options.retention ?? "short";
	const state: CacheState = { turns: [], models: new Map(), warms: [], rewrites: [] };
	let prev:
		| { at: number; modelKey: string; prompt: number; warm: boolean; thinking?: string }
		| undefined;
	let thinking: string | undefined;
	let contextChange: RewriteCause | undefined;

	for (const entry of entries ?? []) {
		if (!entry) continue;
		if (entry.type === "thinking_level_change") {
			thinking = entry.thinkingLevel;
			continue;
		}
		if (entry.type === "compaction") {
			contextChange = "compaction";
			continue;
		}
		if (entry.type === "branch_summary") {
			contextChange ??= "branch change";
			continue;
		}
		if (entry.type === "usage" && entry.kind === "cache_warm") {
			const prompt = promptTokens(entry.usage);
			const at = entryTime(entry);
			const stats = statsFor(state, entry.provider, entry.model);
			const run = { at, modelKey: stats.key, cost: num(entry.usage?.cost?.total), cacheRead: num(entry.usage?.cacheRead) };
			stats.warms.push(run);
			state.warms.push(run);
			stats.lastRequestAt = Math.max(stats.lastRequestAt ?? 0, at);
			state.lastRequest = { at, modelKey: stats.key };
			if (prompt > 0) prev = { at, modelKey: stats.key, prompt, warm: run.cacheRead > 0, thinking: prev?.thinking ?? thinking };
			continue;
		}
		const message = entry.type === "message" ? entry.message : undefined;
		if (message?.role !== "assistant" || !message.usage) continue;
		if (message.stopReason === "error" || message.stopReason === "aborted") continue;
		const usage = message.usage;
		const prompt = promptTokens(usage);
		if (prompt <= 0) continue;

		const provider = String(message.provider ?? "unknown");
		const model = String(message.responseModel ?? message.model ?? "unknown");
		const stats = statsFor(state, provider, model);
		const at = num(message.timestamp) || entryTime(entry);
		const cacheRead = num(usage.cacheRead);
		const cacheWrite = num(usage.cacheWrite);
		const rule = options.ruleFor(provider, model);
		const price = inputPriceFor(rule.cost, prompt);
		const turn: Turn = {
			at,
			modelKey: stats.key,
			prompt,
			input: num(usage.input),
			cacheRead,
			cacheWrite,
			reuse: cacheRead / prompt,
			inputCost: inputSideCost(usage),
			uncachedCost: price === undefined ? undefined : (prompt * price) / 1_000_000,
			thinking,
		};

		// A rewrite is a near-total miss on a prompt the previous warm request cached.
		if (prev?.warm) {
			const expected = Math.min(prev.prompt, prompt);
			const missedTokens = expected - cacheRead;
			if (missedTokens > MISS_NOISE_FLOOR_TOKENS && cacheRead < expected * REWRITE_REUSE_BELOW) {
				const gapMs = Math.max(0, at - prev.at);
				const ttl = ttlSecondsFor(options.ruleFor(...splitKey(prev.modelKey)), retention);
				let cause: RewriteCause = "unknown";
				if (contextChange) cause = contextChange;
				else if (prev.modelKey !== stats.key) cause = "model switch";
				else if ((prev.thinking ?? "") !== (thinking ?? "")) cause = "thinking change";
				else if (ttl !== undefined && gapMs > ttl * 1000) cause = "idle past ttl";
				turn.rewrite = { at, modelKey: stats.key, cause, gapMs, missedTokens };
				stats.rewrites.push(turn.rewrite);
				state.rewrites.push(turn.rewrite);
			}
		}

		stats.turns++;
		stats.prompt += prompt;
		stats.input += turn.input;
		stats.cacheRead += cacheRead;
		stats.cacheWrite += cacheWrite;
		stats.inputCost += turn.inputCost;
		stats.uncachedCost =
			stats.uncachedCost === undefined || turn.uncachedCost === undefined
				? undefined
				: stats.uncachedCost + turn.uncachedCost;
		stats.lastRequestAt = Math.max(stats.lastRequestAt ?? 0, at);
		stats.lastReuse = turn.reuse;
		state.turns.push(turn);
		state.lastRequest = { at, modelKey: stats.key };
		prev = { at, modelKey: stats.key, prompt, warm: cacheRead + cacheWrite > 0, thinking };
		contextChange = undefined;
	}
	return state;
}

function splitKey(key: string): [string, string] {
	const slash = key.indexOf("/");
	return slash < 0 ? [key, ""] : [key.slice(0, slash), key.slice(slash + 1)];
}

export function reuseRate(stats: { prompt: number; cacheRead: number } | undefined): number | undefined {
	if (!stats || stats.prompt <= 0) return undefined;
	return stats.cacheRead / stats.prompt;
}

export function sessionTotals(state: CacheState) {
	let prompt = 0;
	let cacheRead = 0;
	let inputCost = 0;
	let uncachedCost: number | undefined = 0;
	for (const stats of state.models.values()) {
		prompt += stats.prompt;
		cacheRead += stats.cacheRead;
		inputCost += stats.inputCost;
		uncachedCost = uncachedCost === undefined || stats.uncachedCost === undefined ? undefined : uncachedCost + stats.uncachedCost;
	}
	return { prompt, cacheRead, inputCost, uncachedCost, reuse: prompt > 0 ? cacheRead / prompt : undefined };
}

export type ClockState = "warm" | "cold" | "unknown" | "none";

export interface CacheClock {
	state: ClockState;
	remainingMs?: number;
	idleMs?: number;
	ttlSeconds?: number;
}

/** Warm/cold state of a model's cache entry at `now`. */
export function cacheClock(
	stats: ModelStats | undefined,
	rule: ResolvedCacheRule | undefined,
	retention: CacheRetention,
	now: number,
): CacheClock {
	if (!stats?.lastRequestAt || !rule || rule.mode === "none") return { state: "none" };
	const idleMs = Math.max(0, now - stats.lastRequestAt);
	const ttlSeconds = ttlSecondsFor(rule, retention);
	if (ttlSeconds === undefined) return { state: "unknown", idleMs };
	const remainingMs = ttlSeconds * 1000 - idleMs;
	return remainingMs > 0
		? { state: "warm", remainingMs, idleMs, ttlSeconds }
		: { state: "cold", idleMs, ttlSeconds };
}

export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.ceil(ms / 1000));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = String(total % 60).padStart(2, "0");
	return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

function formatIdle(ms: number): string {
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) return `${Math.floor(ms / 1000)}s`;
	if (minutes < 60) return `${minutes}m`;
	return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function formatClockTime(at: number): string {
	const date = new Date(at);
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function percent(value: number | undefined): string {
	return value === undefined ? "–" : `${Math.round(value * 100)}%`;
}

/** Clock text and theme color, shared by the footer and shelf. */
export function clockLabel(clock: CacheClock): { text: string; color: string } | undefined {
	if (clock.state === "warm") return { text: `warm ${formatDuration(clock.remainingMs ?? 0)}`, color: "success" };
	if (clock.state === "cold") return { text: "cold", color: "warning" };
	if (clock.state === "unknown") return { text: `idle ${formatIdle(clock.idleMs ?? 0)}`, color: "dim" };
	return undefined;
}

/** Footer status for the current model, or undefined before the first turn. */
export function formatStatus(
	theme: ThemeLike,
	state: CacheState,
	currentKey: string | undefined,
	clock: CacheClock,
): string | undefined {
	if (state.turns.length === 0) return undefined;
	const stats = currentKey ? state.models.get(currentKey) : undefined;
	const reuse = theme.fg("text", percent(reuseRate(stats ?? sessionTotals(state))));
	// A model with no turns yet has nothing cached.
	const label = stats ? clockLabel(clock) : { text: "cold", color: "warning" };
	return label ? `${reuse} ${theme.fg(label.color, label.text)}` : reuse;
}

export function headline(theme: ThemeLike, state: CacheState, currentKey: string | undefined, clock: CacheClock): string | undefined {
	if (state.turns.length === 0) return undefined;
	if (currentKey && !state.models.has(currentKey)) return theme.fg("warning", "cold");
	if (clock.state === "unknown") return theme.fg("dim", "ttl unknown");
	const label = clockLabel(clock);
	return label ? theme.fg(label.color, label.text) : undefined;
}

function sparkline(theme: ThemeLike, turns: Turn[], width: number): string {
	if (width <= 0) return "";
	return turns
		.slice(-width)
		.map((turn) => {
			const glyph = SPARK[Math.min(SPARK.length - 1, Math.floor(turn.reuse * SPARK.length))];
			return theme.fg(turn.rewrite ? "warning" : turn.reuse >= 0.5 ? "success" : "dim", glyph);
		})
		.join("");
}

function costLine(stats: { inputCost: number; uncachedCost?: number }): string {
	if (stats.uncachedCost === undefined || stats.uncachedCost <= 0) return `input ${formatMoney(stats.inputCost)} · uncached price unknown`;
	return `input ${formatMoney(stats.inputCost)} · ${Math.round((stats.inputCost / stats.uncachedCost) * 100)}% of uncached ${formatMoney(stats.uncachedCost)}`;
}

export interface RenderInput {
	state: CacheState;
	currentKey?: string;
	ruleFor: RuleLookup;
	retention: CacheRetention;
	now: number;
	warmerDecision?: { at: number; action: string };
}

/** Shelf section body. Every line fits within `width` visible columns. */
export function renderSection(width: number, theme: ThemeLike, input: RenderInput): string[] {
	if (width <= 0) return [];
	const { state, now, retention } = input;
	const fit = (line: string) => truncateToWidth(line, width, "…");
	if (state.turns.length === 0) return [fit(theme.fg("dim", "No model turns yet."))];

	const totals = sessionTotals(state);
	const lines: string[] = [];
	const rewriteCount = state.rewrites.length;
	lines.push(
		fit(
			`${theme.fg("dim", "session ")}${theme.fg("text", `${percent(totals.reuse)} reused`)}` +
				theme.fg("dim", ` · ${state.turns.length} turns · `) +
				theme.fg(rewriteCount ? "warning" : "dim", `${rewriteCount} rewrite${rewriteCount === 1 ? "" : "s"}`),
		),
	);
	lines.push(fit(theme.fg("dim", costLine(totals))));
	const label = "turns ";
	lines.push(fit(theme.fg("dim", label) + sparkline(theme, state.turns, Math.max(0, width - label.length))));

	const models = [...state.models.values()]
		.filter((stats) => stats.turns > 0 || stats.warms.length > 0)
		.sort((a, b) => (b.lastRequestAt ?? 0) - (a.lastRequestAt ?? 0));
	for (const stats of models) {
		const rule = input.ruleFor(stats.provider, stats.model);
		const clock = cacheClock(stats, rule, retention, now);
		const clockText = clockLabel(clock);
		const right = clockText ? theme.fg(clockText.color, clockText.text) : "";
		const marker = stats.key === input.currentKey ? theme.fg("accent", "● ") : theme.fg("dim", "○ ");
		const nameWidth = Math.max(1, width - 2 - (clockText ? clockText.text.length + 1 : 0));
		lines.push(fit(`${marker}${theme.fg("text", shortenMiddle(stats.key, nameWidth))}${right ? ` ${right}` : ""}`));
		const ttl = ttlSecondsFor(rule, retention);
		const ttlText = ttl === undefined ? "ttl unknown" : `ttl ${formatDuration(ttl * 1000)}`;
		const last = stats.lastRequestAt ? `last ${formatClockTime(stats.lastRequestAt)}` : "";
		lines.push(
			fit(
				theme.fg(
					"dim",
					`  ${percent(reuseRate(stats))} reused · ${stats.turns} turns · ${[last, ttlText, rule.mode].filter(Boolean).join(" · ")}`,
				),
			),
		);
		lines.push(fit(theme.fg("dim", `  ${costLine(stats)}`)));
		for (const rewrite of stats.rewrites.slice(-2)) {
			lines.push(
				fit(
					theme.fg(
						"warning",
						`  rewrite ${formatClockTime(rewrite.at)} ${rewrite.cause} · ${formatCount(rewrite.missedTokens)} tok · gap ${formatIdle(rewrite.gapMs)}`,
					),
				),
			);
		}
	}

	const warms = state.warms;
	const warmCost = warms.reduce((sum, run) => sum + run.cost, 0);
	const decision = input.warmerDecision ? ` · last decision ${input.warmerDecision.action} ${formatClockTime(input.warmerDecision.at)}` : "";
	lines.push(
		fit(
			theme.fg(
				"dim",
				warms.length
					? `pi warmer ${warms.length}× ${formatMoney(warmCost)} · last ${formatClockTime(warms[warms.length - 1].at)}${decision}`
					: `pi warmer not run${decision}`,
			),
		),
	);
	return lines;
}

export default function (pi: ExtensionAPI) {
	const retention = defaultRetention();
	let ctxRef: any;
	let state: CacheState = { turns: [], models: new Map(), warms: [], rewrites: [] };
	let pending: any;
	let branchLength = -1;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let unregister: (() => void) | undefined;
	let lastStatus: string | undefined;
	let lastHeadline: string | undefined;
	let warmerDecision: { at: number; action: string } | undefined;
	const rules = new Map<string, ResolvedCacheRule>();
	const now = () => Date.now();

	const ruleFor: RuleLookup = (provider, modelId) => {
		const key = `${provider}/${modelId}`;
		let rule = rules.get(key);
		if (!rule) {
			const model = ctxRef?.modelRegistry?.find?.(provider, modelId);
			rule = cacheRuleFor(provider, modelId, { model });
			rules.set(key, rule);
		}
		return rule;
	};

	const currentKey = () => {
		const model = ctxRef?.model;
		return model ? `${model.provider}/${model.id}` : state.lastRequest?.modelKey;
	};

	const currentClock = () => {
		const key = currentKey();
		const stats = key ? state.models.get(key) : undefined;
		return cacheClock(stats, stats ? ruleFor(stats.provider, stats.model) : undefined, retention, now());
	};

	const recompute = () => {
		const branch = ctxRef?.sessionManager?.getBranch?.() ?? [];
		branchLength = branch.length;
		let entries = branch;
		if (pending) {
			const persisted = branch.some((entry: any) => entry?.message === pending);
			if (persisted) pending = undefined;
			else entries = [...branch, { type: "message", message: pending }];
		}
		state = analyzeEntries(entries, { ruleFor, retention });
	};

	const update = (force = false) => {
		if (!ctxRef?.hasUI) return;
		const theme = ctxRef.ui.theme;
		const clock = currentClock();
		const status = formatStatus(theme, state, currentKey(), clock);
		const head = headline(theme, state, currentKey(), clock);
		const changed = status !== lastStatus || head !== lastHeadline;
		if (status !== lastStatus) ctxRef.ui.setStatus("cache", status);
		lastStatus = status;
		lastHeadline = head;
		// The section body only changes with the clock or new usage, which moves one of these.
		if (changed || force) refreshShelf(pi);
	};

	const schedule = () => {
		if (timer) clearTimeout(timer);
		timer = undefined;
		if (!ctxRef?.hasUI) return;
		const delay = currentClock().state === "warm" ? TICK_WARM_MS : TICK_IDLE_MS;
		timer = setTimeout(() => {
			// Pick up cache-warm usage entries Pi appended while idle.
			const length = ctxRef?.sessionManager?.getBranch?.()?.length ?? 0;
			const grew = length !== branchLength;
			if (grew) recompute();
			update(grew);
			schedule();
		}, delay);
		timer.unref?.();
	};

	const refreshAll = (ctx: any) => {
		ctxRef = ctx;
		recompute();
		update(true);
		schedule();
	};

	const stop = () => {
		if (timer) clearTimeout(timer);
		timer = undefined;
		unregister?.();
		unregister = undefined;
		if (ctxRef?.hasUI) ctxRef.ui.setStatus("cache", undefined);
		lastStatus = undefined;
		lastHeadline = undefined;
	};

	pi.on("session_start", async (_event, ctx) => {
		stop();
		ctxRef = ctx;
		rules.clear();
		pending = undefined;
		warmerDecision = undefined;
		if (ctx.hasUI) {
			unregister = registerShelfSection(pi, {
				id: "cache",
				title: "Cache",
				order: 40,
				headline: (theme) => headline(theme, state, currentKey(), currentClock()),
				render: (width, theme) =>
					renderSection(width, theme, {
						state,
						currentKey: currentKey(),
						ruleFor,
						retention,
						now: now(),
						warmerDecision,
					}),
			});
		}
		refreshAll(ctx);
	});

	pi.on("message_end", async (event, ctx) => {
		if (event.message?.role !== "assistant") return;
		// message_end fires before the entry is persisted.
		pending = event.message;
		refreshAll(ctx);
	});

	for (const name of ["agent_end", "session_compact", "session_tree", "model_select"]) {
		pi.on(name, async (_event, ctx) => refreshAll(ctx));
	}

	pi.on("cache_warming_decision", async (event) => {
		warmerDecision = { at: now(), action: event.action };
		return undefined;
	});

	pi.on("session_shutdown", async () => {
		stop();
		ctxRef = undefined;
	});
}
