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
