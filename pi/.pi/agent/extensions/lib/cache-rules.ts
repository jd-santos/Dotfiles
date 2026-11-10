// @ts-nocheck

/**
 * Prompt-cache rules by provider and model.
 *
 * A rule answers: does this route cache, how long does an entry live, and
 * what does a cache read or write cost relative to plain input? Answers come
 * from layers, first defined value wins per field:
 *
 *   1. runtime: the Pi model object (`promptCache` lifetimes, `cost` rates).
 *   2. extra layers passed by the caller. This is the slot for a future
 *      fetched source (models.dev, OpenRouter `/api/v1/models`, LiteLLM).
 *   3. the static table below, for facts Pi encodes in code, not metadata.
 *   4. unknown.
 *
 * The static table holds facts confirmed from Pi's source, metadata, or a
 * provider's own documentation. A row marked `provisional` applies a
 * documented figure to a route the documentation does not cover, such as
 * the Codex subscription; the UI marks its countdown as an estimate.
 * Everything else stays undefined, which renders as "unknown". See
 * todo/work/pi-cache-rules/README.md for the research plan.
 */

export type CacheMode = "automatic" | "explicit" | "none" | "unknown";
export type CacheRetention = "short" | "long" | "none";

export interface CacheRule {
	/** Pi provider id, such as "anthropic", "openai-codex", "openrouter". */
	provider: string;
	/** Glob on the model id (`*` matches anything). Omitted matches every model. */
	modelPattern?: string;
	/** automatic: the provider caches prefixes itself; explicit: Pi marks breakpoints. */
	mode?: CacheMode;
	/** Lifetime of an entry at the default (short) retention. */
	ttlSeconds?: number;
	/** Lifetime at long retention (`PI_CACHE_RETENTION=long`). */
	extendedTtlSeconds?: number;
	/** Cache read price as a fraction of the input price. */
	readMultiplier?: number;
	/** Cache write price as a fraction of the input price, at short retention. */
	writeMultiplier?: number;
	/** Cache write price as a fraction of the input price, at long retention. */
	extendedWriteMultiplier?: number;
	/** Smallest prompt the provider will cache. */
	minTokens?: number;
	/** URL, or "pi-runtime" with the file the fact came from. */
	source: string;
	/** Date the row was checked, YYYY-MM-DD. */
	verifiedAt?: string;
	/** The lifetime is a documented figure applied to an undocumented route. */
	provisional?: boolean;
	notes?: string;
}

const PI_AI = "pi-runtime: @earendil-works/pi-ai 1.3.0";
const VERIFIED = "2026-10-23";
const OPENAI_CACHING = "https://developers.openai.com/api/docs/guides/prompt-caching";
// GPT-5.6 and later: entries live at least 30 minutes by default; 1,024-token minimum.
const GPT_56_PLUS = ["gpt-6*", "gpt-5.6*"];

/**
 * Facts Pi encodes in code rather than in model metadata. Rows are tried in
 * order; put specific patterns before broad ones.
 */
export const CACHE_RULES: readonly CacheRule[] = [
	{
		provider: "anthropic",
		mode: "explicit",
		extendedWriteMultiplier: 2,
		source: `${PI_AI} dist/api/anthropic-messages.js, dist/models.js calculateCost`,
		verifiedAt: VERIFIED,
		notes:
			"Pi marks cache_control on the system prompt, last tool, and last user message. calculateCost bills 1h writes at 2x input. Lifetimes come from the model's promptCache metadata (300s short, 3600s long in 1.3.0).",
	},
	{
		provider: "openrouter",
		modelPattern: "anthropic/*",
		mode: "explicit",
		source: `${PI_AI} dist/api/openai-completions.js (cacheControlFormat "anthropic")`,
		verifiedAt: VERIFIED,
		notes:
			"Pi sends Anthropic-style cache_control through OpenRouter for anthropic/* ids. Pi ships no promptCache lifetime for this route.",
	},
	{
		provider: "openrouter",
		mode: "unknown",
		source: `${PI_AI} dist/api/openai-completions.js`,
		verifiedAt: VERIFIED,
		notes:
			"Pi sends no cache markers for non-Anthropic ids; any caching is the upstream provider's. Metadata has cacheRead prices but no lifetimes.",
	},
	...GPT_56_PLUS.map((modelPattern) => ({
		provider: "openai-codex",
		modelPattern,
		mode: "automatic" as const,
		ttlSeconds: 1800,
		// Pi's Codex route sends no retention option, so long retention changes nothing.
		extendedTtlSeconds: 1800,
		minTokens: 1024,
		provisional: true,
		source: `${OPENAI_CACHING}; ${PI_AI} dist/api/openai-codex-responses.js`,
		verifiedAt: VERIFIED,
		notes:
			"OpenAI documents a 30-minute minimum default lifetime for GPT-5.6 and later on the API. The ChatGPT Codex backend is undocumented, so the lifetime is provisional; Pi sends only prompt_cache_key.",
	})),
	...GPT_56_PLUS.map((modelPattern) => ({
		provider: "openai",
		modelPattern,
		mode: "automatic" as const,
		ttlSeconds: 1800,
		// Pi's long retention asks for prompt_cache_options.ttl "30m" on these models.
		extendedTtlSeconds: 1800,
		minTokens: 1024,
		source: `${OPENAI_CACHING}; ${PI_AI} dist/api/openai-responses.js getPromptCacheOptions`,
		verifiedAt: VERIFIED,
		notes:
			'Default minimum lifetime is 30 minutes; a 12h ttl exists, but Pi never requests it. Writes bill at 1.25x input for 30 minutes.',
	})),
	{
		provider: "openai-codex",
		mode: "automatic",
		source: `${PI_AI} dist/api/openai-codex-responses.js (prompt_cache_key only)`,
		verifiedAt: VERIFIED,
		notes:
			"Pi sends prompt_cache_key and no breakpoints. Lifetime and whether the subscription bills cache like the API are unknown; Pi reports API-equivalent cost.",
	},
	{
		provider: "openai",
		mode: "automatic",
		source: `${PI_AI} dist/api/openai-responses.js`,
		verifiedAt: VERIFIED,
		notes:
			'Long retention requests prompt_cache_retention "24h", or prompt_cache_options.ttl "30m" on models that accept it. Those are requests, not confirmed lifetimes.',
	},
];

export function matchesPattern(pattern: string | undefined, modelId: string): boolean {
	if (!pattern) return true;
	const regex = new RegExp(
		`^${pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`,
		"i",
	);
	return regex.test(modelId);
}

export function staticRuleFor(
	provider: string,
	modelId: string,
	table: readonly CacheRule[] = CACHE_RULES,
): CacheRule | undefined {
	return table.find((rule) => rule.provider === provider && matchesPattern(rule.modelPattern, modelId));
}

type ModelLike = {
	provider?: string;
	id?: string;
	promptCache?: { short?: number; long?: number };
	cost?: { input?: number; cacheRead?: number; cacheWrite?: number; tiers?: any[] };
};

/** What the Pi model object says, as a partial rule. */
export function runtimeRuleFor(model: ModelLike | undefined): Partial<CacheRule> | undefined {
	if (!model) return undefined;
	const rule: Partial<CacheRule> = { source: "pi-runtime: model metadata" };
	if (typeof model.promptCache?.short === "number") rule.ttlSeconds = model.promptCache.short;
	if (typeof model.promptCache?.long === "number") rule.extendedTtlSeconds = model.promptCache.long;
	const input = Number(model.cost?.input);
	if (input > 0) {
		const read = Number(model.cost?.cacheRead);
		const write = Number(model.cost?.cacheWrite);
		if (read > 0) rule.readMultiplier = read / input;
		// Pi's cache warmer treats a zero write rate as "misses bill as input".
		if (write > 0) rule.writeMultiplier = write / input;
		else if (read > 0) rule.writeMultiplier = 1;
	}
	return rule;
}

/** A source of partial rules, such as a future fetched pricing catalog. */
export type CacheRuleLayer = (provider: string, modelId: string) => Partial<CacheRule> | undefined;

const FIELDS = [
	"mode",
	"ttlSeconds",
	"extendedTtlSeconds",
	"readMultiplier",
	"writeMultiplier",
	"extendedWriteMultiplier",
	"minTokens",
] as const;

export type CacheRuleField = (typeof FIELDS)[number];

export interface ResolvedCacheRule extends Omit<CacheRule, "source" | "mode"> {
	mode: CacheMode;
	/** The lifetime came from a provisional static row. */
	provisional?: boolean;
	/** Where each defined field came from. */
	sources: Partial<Record<CacheRuleField, string>>;
	notes?: string;
	/** Input price in $/million tokens, from the model, for uncached comparisons. */
	inputPrice?: number;
	cost?: ModelLike["cost"];
}

export interface CacheRuleOptions {
	/** The Pi model object, for example `ctx.modelRegistry.find(provider, id)`. */
	model?: ModelLike;
	/** Layers tried after runtime and before the static table. */
	layers?: CacheRuleLayer[];
	table?: readonly CacheRule[];
}

/** Resolve a rule: runtime model data, then extra layers, then the static table, then unknown. */
export function cacheRuleFor(
	provider: string,
	modelId: string,
	options: CacheRuleOptions = {},
): ResolvedCacheRule {
	const staticRule = staticRuleFor(provider, modelId, options.table);
	const candidates = [
		runtimeRuleFor(options.model),
		...(options.layers ?? []).map((layer) => {
			try {
				return layer(provider, modelId);
			} catch {
				return undefined;
			}
		}),
		staticRule,
	].filter(Boolean) as Partial<CacheRule>[];

	const resolved: ResolvedCacheRule = { provider, mode: "unknown", sources: {} };
	for (const field of FIELDS) {
		for (const candidate of candidates) {
			const value = candidate[field];
			if (value === undefined || (field === "mode" && value === "unknown")) continue;
			resolved[field] = value;
			resolved.sources[field] = candidate.source ?? "unknown";
			break;
		}
	}
	if (staticRule?.modelPattern) resolved.modelPattern = staticRule.modelPattern;
	if (staticRule?.verifiedAt) resolved.verifiedAt = staticRule.verifiedAt;
	if (staticRule?.notes) resolved.notes = staticRule.notes;
	if (
		staticRule?.provisional &&
		[resolved.sources.ttlSeconds, resolved.sources.extendedTtlSeconds].includes(staticRule.source)
	) {
		resolved.provisional = true;
	}
	const input = Number(options.model?.cost?.input);
	if (input > 0) resolved.inputPrice = input;
	if (options.model?.cost) resolved.cost = options.model.cost;
	return resolved;
}

/** Retention Pi uses for normal requests: short unless `PI_CACHE_RETENTION=long`. */
export function defaultRetention(env: Record<string, string | undefined> = process.env): CacheRetention {
	return env.PI_CACHE_RETENTION === "long" ? "long" : "short";
}

/** Entry lifetime for a retention tier, or undefined when unknown. */
export function ttlSecondsFor(rule: ResolvedCacheRule, retention: CacheRetention = "short"): number | undefined {
	if (retention === "none" || rule.mode === "none") return undefined;
	return retention === "long" ? rule.extendedTtlSeconds : rule.ttlSeconds;
}

/** Input price ($/M) for a request of `promptTokens`, applying Pi's request-wide tiers. */
export function inputPriceFor(cost: ModelLike["cost"] | undefined, promptTokens: number): number | undefined {
	if (!cost) return undefined;
	let rate = Number(cost.input);
	let threshold = -1;
	for (const tier of cost.tiers ?? []) {
		if (promptTokens > tier.inputTokensAbove && tier.inputTokensAbove > threshold) {
			rate = Number(tier.input);
			threshold = tier.inputTokensAbove;
		}
	}
	return rate > 0 ? rate : undefined;
}
