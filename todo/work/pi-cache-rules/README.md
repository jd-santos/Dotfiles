# Pi cache rules by provider

Status: Planned. `cache-tracker.ts` and `lib/cache-rules.ts` shipped with the
rules table stubbed: it holds only facts confirmed from Pi 1.3.0's source and
model metadata, and everything else reads as unknown.

## Purpose

The cache tracker shows reuse, a warm/cold countdown, rewrites, and input cost
per model. The countdown and the cost comparison are only as good as the
rules behind them, and those rules differ by provider: lifetime, read and
write price multipliers, minimum cacheable prompt, automatic or explicit
caching, and extended lifetimes. This work fills the table with sourced,
dated rules and decides how to keep it fresh.

## What Pi already provides

Use these before adding anything to the static table.

- `model.promptCache` (`{ short, long }` seconds) drives Pi's cache warmer
  through `getPromptCacheTtlMs` in `dist/core/cache-warmer.js`. In 1.3.0 only
  the direct `anthropic` provider sets it (300 and 3600). Every other
  provider, including `openai-codex`, `openai`, and `openrouter`, leaves it
  unset, so Pi does not warm those caches.
- `model.cost` (`input`, `cacheRead`, `cacheWrite`, optional `tiers`) in
  $/million tokens, from `pi-ai/dist/providers/data/*.json`. The tracker
  derives read and write multipliers from it. A zero `cacheWrite` rate means
  misses bill as input, which is what Pi's warmer assumes.
- `calculateCost` in `pi-ai/dist/models.js` bills Anthropic 1h cache writes at
  2x input, using `usage.cacheWrite1h`.
- Assistant `usage` carries `input`, `cacheRead`, `cacheWrite`,
  `cacheWrite1h` (Anthropic only), and a per-bucket `cost` breakdown.
- `dist/core/cache-stats.js` counts misses above a 1,024-token noise floor and
  resets at compaction. Its `CACHE_TTL_MS` is a fixed 5 minutes used only to
  word miss notices.
- Request-side retention: Pi defaults to short retention and switches to long
  when `PI_CACHE_RETENTION=long`, which `zsh/.zshrc` sets. Long retention
  sends Anthropic `cache_control.ttl: "1h"`, OpenAI Responses
  `prompt_cache_retention: "24h"` or `prompt_cache_options.ttl: "30m"`, and
  Chat Completions `prompt_cache_retention: "24h"` where supported. The Codex
  route sends only `prompt_cache_key`, no retention.

## Work

- [ ] Research rules per provider and model, each with a source URL and a
  check date. Start with the default providers: the `openai-codex` models in
  `settings.base.json`, OpenRouter's DeepSeek, GLM, Qwen, and Kimi routes,
  and `anthropic/*` through OpenRouter. Record mode, short and extended
  lifetime, read and write multipliers, extended-write multiplier, and
  minimum cacheable tokens.
- [ ] Check whether OpenAI's requested retention (`24h`, `30m`) is the real
  entry lifetime, and what the default lifetime is without it.
- [ ] Check whether the Codex subscription route caches and bills cache the
  same as the API, and whether it honors any retention setting. Pi reports
  API-equivalent cost for it.
- [ ] Check what OpenRouter passes through for upstream caching: which
  upstreams cache automatically, whether `cache_control` reaches non-Anthropic
  upstreams, and whether session affinity (`x-session-id`) affects hit rates.
- [ ] Evaluate sources that could keep rules and prices fresh:
  - models.dev `api.json`, already fetched by `usage.ts`, for cache read and
    write prices.
  - OpenRouter `/api/v1/models`, whose `pricing` includes cache read and write
    fields per route.
  - LiteLLM's `model_prices_and_context_window.json`, which has cache cost
    fields and some caching flags.
  - None of these is known to publish cache lifetimes, so lifetimes may have
    to stay in the static table.
- [ ] Decide fetch timing, local caching, and offline fallback. The rules
  module already accepts extra layers between runtime data and the static
  table (`cacheRuleFor(..., { layers })`), so a fetched layer plugs in
  without changing callers. Avoid a network call on every session start;
  prefer a cached file with a check date, refreshed in the background.
- [ ] Consider proposing `promptCache` values upstream to Pi for providers
  whose lifetimes are confirmed, since that also enables Pi's warmer.
- [ ] Update `lib/cache-rules.ts` rows and the tracker tests, then sync the Pi
  reference docs.
