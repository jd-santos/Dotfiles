// Pure helpers: formatting, cycling and sparklines. No `$` here, so tests call them directly.

export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n < 1_000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}m`
}

export function formatMoney(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n) || n <= 0) return '$0.000'
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`
}

/** `/Users/me/Dotfiles/pi` → `{ prefix: '~/Dotfiles/', leaf: 'pi' }`. */
export function splitCwd(cwd: string, home: string | undefined): { prefix: string; leaf: string } {
  let path = cwd
  if (home && cwd === home) return { prefix: '', leaf: '~' }
  if (home && cwd.startsWith(`${home}/`)) path = `~/${cwd.slice(home.length + 1)}`
  if (path === '/') return { prefix: '', leaf: '/' }
  const cut = path.lastIndexOf('/')
  return { prefix: path.slice(0, cut + 1), leaf: path.slice(cut + 1) }
}

/** Shortens the prefix before the leaf, as Pi does: the current directory stays readable. */
export function fitCwd(parts: { prefix: string; leaf: string }, width: number): { prefix: string; leaf: string } {
  const { prefix, leaf } = parts
  if (prefix.length + leaf.length <= width) return parts
  if (leaf.length + 2 <= width && prefix) return { prefix: '…/', leaf }
  return { prefix: '', leaf: shortenMiddle(leaf, width) }
}

export function shortenMiddle(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length <= width) return text
  if (width === 1) return '…'
  const tail = Math.floor((width - 1) / 2)
  return `${text.slice(0, width - 1 - tail)}…${tail ? text.slice(-tail) : ''}`
}

/** `claude-opus-5-5` → `opus 5.5`; `claude-sonnet-5-5[1m]` → `sonnet 5.5 1m`. */
export function formatModel(model: string | null): string {
  if (!model) return '…'
  return model
    .replace(/^(?:[a-z]+\.)?anthropic\./, '')
    .replace(/^claude-/, '')
    .replace(/-(\d+)-(\d+)(?=$|[-[@:])/, ' $1.$2')
    .replace(/-\d{8}$/, '')
    .replace(/\[(\w+)\]$/, ' $1')
}

export type ModeLabel = { text: string; color: 'subtle' | 'warning' | 'planMode' | 'autoAccept' | 'permission' }

/** Claude Code's permission modes, named the way Pi's permission gate names its own. */
export function formatMode(mode: string | null): ModeLabel {
  switch (mode) {
    case 'default': return { text: 'ask', color: 'subtle' }
    case 'acceptEdits': return { text: 'edits', color: 'autoAccept' }
    case 'auto': return { text: 'auto', color: 'autoAccept' }
    case 'plan': return { text: 'plan', color: 'planMode' }
    case 'dontAsk': return { text: 'dontAsk', color: 'permission' }
    case 'bypassPermissions': return { text: 'yolo', color: 'warning' }
    case null: return { text: '?', color: 'subtle' }
    default: return { text: mode, color: 'subtle' }
  }
}

/** The permission mode behind the footer's own mode labels (`SessionMode`); `default` when it shows none. */
export function modeFromLabels(labels: readonly string[]): string | null {
  if (labels.length === 0) return 'default'
  const text = labels.join(' ').toLowerCase()
  if (text.includes('plan')) return 'plan'
  if (text.includes('accept')) return 'acceptEdits'
  if (text.includes('bypass')) return 'bypassPermissions'
  if (/don.?t ask/.test(text)) return 'dontAsk'
  if (text.includes('auto')) return 'auto'
  return null
}

export type Meter = { bar: number; empty: number; percent: number; color: 'success' | 'warning' | 'error' }

/** Pi's context meter: yellow at 50%, red at 80%, up to 20 cells. */
export function contextMeter(percent: number | undefined, cells: number): Meter | null {
  if (percent === undefined || !Number.isFinite(percent)) return null
  const clamped = Math.max(0, Math.min(100, percent))
  const width = Math.max(0, Math.min(20, cells))
  const bar = Math.round((clamped / 100) * width)
  const color = clamped >= 80 ? 'error' : clamped >= 50 ? 'warning' : 'success'
  return { bar, empty: width - bar, percent: Math.round(clamped), color }
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** Share of input served from the prompt cache, as a whole percentage. */
export function cacheHit(t: { input: number; cacheRead: number; cacheWrite: number }): number | null {
  const all = t.input + t.cacheRead + t.cacheWrite
  return all > 0 ? Math.round((t.cacheRead / all) * 100) : null
}

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

export const MODELS = ['sonnet', 'haiku', 'fable', 'opus'] as const

/** The next item after `current` (wrapping); the first when `current` is not in the list. */
export function cycle<T extends string>(list: readonly T[], current: string | null, step = 1): T {
  const at = list.findIndex(item => item === current)
  const next = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length
  return list[next] as T
}

/** Which shortlist alias a model id belongs to: `claude-haiku-5-5` → `haiku`. */
export function aliasOf(model: string | null): string | null {
  if (!model) return null
  return MODELS.find(alias => model.toLowerCase().includes(alias)) ?? null
}

const BARS = '▁▂▃▄▅▆▇█'

export function sparkline(values: readonly number[]): string {
  if (values.length === 0) return ''
  const max = Math.max(...values)
  if (max <= 0) return BARS[0]!.repeat(values.length)
  return values.map(v => BARS[Math.min(7, Math.floor((Math.max(0, v) / max) * 7.999))]).join('')
}

/** Pads or cuts a line to exactly `width` cells, so a card paints over what is under it. */
export function pad(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length <= width) return text + ' '.repeat(width - text.length)
  return `${text.slice(0, width - 1)}…`
}

const LEVELS = ' ▁▂▃▄▅▆▇█'

/** One column of a two-row bar chart: 16 steps of height, `top` over `bottom`. */
export function column(value: number, max: number): { top: string; bottom: string } {
  const step = max > 0 ? Math.round((Math.max(0, value) / max) * 16) : 0
  const shown = value > 0 ? Math.max(1, step) : 0
  return {
    top: LEVELS[Math.max(0, shown - 8)] ?? ' ',
    bottom: LEVELS[Math.min(8, shown)] ?? ' ',
  }
}

/** A one-cell gauge whose height is the percent used. */
export function gauge(percent: number): string {
  return LEVELS[Math.max(1, Math.min(8, Math.round((percent / 100) * 8)))] ?? '█'
}

export function percentColor(percent: number): 'success' | 'warning' | 'error' {
  return percent >= 80 ? 'error' : percent >= 50 ? 'warning' : 'success'
}

export type Segment = { cells: number; color: string; name: string }

/**
 * Splits `width` cells among context categories by their tokens out of `max`, largest
 * remainders first so the cells add up; a category with any tokens gets at least one.
 */
export function segments(slices: readonly { name: string; tokens: number; color: string }[], max: number, width: number): Segment[] {
  if (max <= 0 || width <= 0) return []
  const exact = slices.map(s => (s.tokens / max) * width)
  const cells = exact.map(x => (x > 0 ? Math.max(1, Math.floor(x)) : 0))
  let used = cells.reduce((a, b) => a + b, 0)
  const target = Math.min(width, Math.round(exact.reduce((a, b) => a + b, 0)))
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (used >= target) break
    cells[i] = (cells[i] ?? 0) + 1
    used++
  }
  while (used > width) {
    const widest = cells.indexOf(Math.max(...cells))
    cells[widest] = (cells[widest] ?? 1) - 1
    used--
  }
  return slices.map((s, i) => ({ cells: cells[i] ?? 0, color: s.color, name: s.name })).filter(s => s.cells > 0)
}

/** Contrasting theme colours for the context categories, in /context's order. */
export const PALETTE = ['claude', 'suggestion', 'success', 'warning', 'permission', 'planMode', 'remember', 'error'] as const

export function paletteColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? 'subtle'
}

/**
 * What cached input costs relative to uncached, per the API's price list: reads are
 * 10% of the input price (5% on Opus 5.5, 2.5% on Fable), writes 125% (5-minute cache).
 */
export function cacheRates(alias: string | null): { read: number; write: number } {
  return { read: alias === 'fable' ? 0.025 : alias === 'opus' ? 0.05 : 0.1, write: 1.25 }
}

/** Input cost as a share of what the same tokens would cost uncached; null with no input. */
export function effectiveInputRate(t: { input: number; cacheRead: number; cacheWrite: number }, rates: { read: number; write: number }): number | null {
  const all = t.input + t.cacheRead + t.cacheWrite
  if (all <= 0) return null
  return (t.input + t.cacheWrite * rates.write + t.cacheRead * rates.read) / all
}

// Claude Code's entries have survived 13-minute pauses in this log with 98% reuse, so it uses
// the API's one-hour cache, not the five-minute default.
export const CACHE_TTL_MS = 60 * 60 * 1000

/** List input price per million tokens for the shortlist models (API rates, 2026-10). */
export function inputPrice(alias: string | null): number {
  return alias === 'fable' ? 10 : alias === 'opus' ? 4 : alias === 'haiku' ? 0.1 : 2
}

/** What one request over `tokens` of conversation costs cold (write at 125%) and warm (read). */
export function requestCost(tokens: number, alias: string | null): { cold: number; warm: number } {
  const perToken = inputPrice(alias) / 1_000_000
  return { cold: tokens * perToken * cacheRates(alias).write, warm: tokens * perToken * cacheRates(alias).read }
}

/** Names the likely reason a turn rewrote its cache instead of reading it. */
export function coldCause(
  turn: { cacheHit: number | null; gapMs: number | null; model: string; effort: string | null },
  previous: { model: string; effort: string | null } | undefined,
): 'idle' | 'model' | 'effort' | 'prefix' | null {
  if (!previous || turn.cacheHit === null || turn.cacheHit >= 50) return null
  if (turn.gapMs !== null && turn.gapMs > CACHE_TTL_MS) return 'idle'
  if (turn.model !== previous.model) return 'model'
  if (turn.effort !== previous.effort) return 'effort'
  return 'prefix'
}

/** `m:ss` for a countdown. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
