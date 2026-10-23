import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, SessionUsage } from 'claude-code'

import type { AgentRow, Breakdown, KeepAlive, PromptMark, Receipt, Speed, Summary, Totals } from '../types'
import {
  EFFORTS,
  MODELS,
  CACHE_TTL_MS,
  aliasOf,
  cacheHit,
  cacheRates,
  coldCause,
  column,
  cycle,
  effectiveInputRate,
  fitCwd,
  formatClock,
  formatCount,
  formatDuration,
  formatMode,
  formatModel,
  formatMoney,
  modeFromLabels,
  pad,
  paletteColor,
  percentColor,
  requestCost,
  segments,
  shortenMiddle,
  sparkline,
  splitCwd,
} from './format'
import { turnRow } from './log'
import type { SessionRecord } from './log'

const cwd = atom({ plugin: 'shellfish', key: 'cwd' } as const, null as string | null)
const home = atom({ plugin: 'shellfish', key: 'home' } as const, null as string | null)
const branch = atom({ plugin: 'shellfish', key: 'branch' } as const, null as string | null)
const mode = atom({ plugin: 'shellfish', key: 'mode' } as const, null as string | null)
const model = atom({ plugin: 'shellfish', key: 'model' } as const, null as string | null)
const effort = atom({ plugin: 'shellfish', key: 'effort' } as const, null as string | null)
const speed = atom({ plugin: 'shellfish', key: 'speed' } as const, { rate: null, isLive: false } as Speed)
const totals = atom({ plugin: 'shellfish', key: 'totals' } as const, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as Totals)
const summary = atom({ plugin: 'shellfish', key: 'summary' } as const, null as Summary)
const receipts = atom({ plugin: 'shellfish', key: 'receipts' } as const, [] as Receipt[])
const breakdown = atom({ plugin: 'shellfish', key: 'breakdown' } as const, null as Breakdown | null)
const agents = atom({ plugin: 'shellfish', key: 'agents' } as const, [] as AgentRow[])
// Bumped after each model request so the band re-reads $.session.usage().
const tick = atom({ plugin: 'shellfish', key: 'tick' } as const, 0)
const warmUntil = atom({ plugin: 'shellfish', key: 'warmUntil' } as const, null as number | null)
const clockTick = atom({ plugin: 'shellfish', key: 'clockTick' } as const, 0)
const keepAlive = atom({ plugin: 'shellfish', key: 'keepAlive' } as const, null as KeepAlive | null)
const prompts = atom({ plugin: 'shellfish', key: 'prompts' } as const, [] as PromptMark[])

const SHELF = 'shellfish'
// The dock width the shelf asks for: a sidebar, not half the screen. The person's own drag wins.
const SHELF_COLUMNS = 52
// Live subagents get a row each under the band, up to this many; the rest are counted.
const BAND_AGENT_ROWS = 3
// A breakdown this many points off the live context percent is stale; the bar falls back to a plain meter.
const STALE_SPLIT_POINTS = 15

// Prompts remembered for their transcript dividers; older rows draw an unlabelled rule.
const PROMPT_MARKS = 200

const AGENT_GLYPHS: Record<string, string> = { running: '●', pending: '○', waiting: '◐', idle: '◌', completed: '✓', failed: '✗', killed: '✗' }

function agentGlyph(status: string): string {
  return AGENT_GLYPHS[status] ?? '·'
}

function agentColor(status: string): string {
  return isLiveAgent({ status }) ? 'claude' : status === 'failed' || status === 'killed' ? 'error' : 'inactive'
}

function isLiveAgent(row: { status: string }): boolean {
  return row.status === 'running' || row.status === 'pending'
}
const SUMMARY_MODEL = 'haiku'
const SUMMARY_EVERY = 5
const WARN_PERCENT = 80
const KEEP_ALIVE_DEFAULT_MIN = 180
const KEEP_ALIVE_MAX_MIN = 720
// Probe this long before the entry lapses: a read refreshes its timer at read price.
const KEEP_ALIVE_LEAD_MS = 2 * 60_000
// Keybinding actions whose engine handlers live only in dialogs that are closed while
// the prompt has focus, so ~/.claude/keybindings.json can point Chat keys at them and
// the band's Buttons answer instead. See the README.
const ACTION_EFFORT = 'effortSlider:increaseEffort'
const ACTION_MODEL_NEXT = 'diff:nextSource'
const ACTION_MODEL_PREVIOUS = 'diff:previousSource'

// In-flight bookkeeping; a reload mid-turn only loses that turn's receipt.
let turn: { startedAt: number; costAtStart: number; streamMs: number } | null = null
const lineReceipts = new Map<string, Receipt>()
const claimed = new Set<number>()
const warned = new Set<string>()
const firstSeen = new Map<string, number>()
const modelsSeen = new Set<string>()
let isShelfOffered = false

async function isShelfUp($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === SHELF && pane.isPlaced)
}

/** Opens the shelf, or closes it when it is already up: the band's button and /shelf are toggles. */
async function toggleShelf($: EngineInterface): Promise<boolean> {
  if (await isShelfUp($)) {
    await $.ui.close({ id: SHELF })
    await update($, tick, n => n + 1)
    return false
  }
  await $.ui.open({ id: SHELF, title: 'shelf', columns: SHELF_COLUMNS })
  await update($, tick, n => n + 1)
  return true
}

async function refreshBranch($: EngineInterface) {
  const dir = await $.session.cwd()
  await update($, cwd, () => dir)
  const run = await $.process.run(['git', 'branch', '--show-current'], { cwd: dir, timeoutMs: 2000 })
  let name: string | null = 'no repo'
  if (run.exitCode === 0) name = run.stdout.trim() || 'detached'
  await update($, branch, () => name)
}

async function logDir($: EngineInterface): Promise<string | null> {
  const home = await $.env.get('HOME')

  return home ? `${home}/.claude/shellfish` : null
}

async function appendTurn($: EngineInterface, row: object): Promise<void> {
  const dir = await logDir($)
  if (!dir) return
  // $.fs has no append; sh does it, with the row on stdin so nothing is quoted into the command.
  await $.process.run(
    ['sh', '-c', 'mkdir -p "$1/sessions" && cat >> "$1/usage.jsonl"', 'shellfish', dir],
    { stdin: `${JSON.stringify(row)}\n`, timeoutMs: 5000 },
  )
}

async function writeSession($: EngineInterface, record: SessionRecord): Promise<void> {
  const dir = await logDir($)
  if (!dir) return
  await $.process.run(['mkdir', '-p', `${dir}/sessions`], { timeoutMs: 5000 })
  await $.fs.write(`${dir}/sessions/${record.session}.json`, `${JSON.stringify(record, null, 2)}\n`)
}

async function summarize($: EngineInterface) {
  const current = await read($, summary)
  if (current?.isManual) return
  const messages = await $.session.messages()
  const asks = messages.filter(m => m.role === 'user' && m.text.trim()).slice(-6)
  if (asks.length === 0) return
  const transcript = asks.map(m => `- ${m.text.trim().slice(0, 400)}`).join('\n')
  const reply = await $.model.complete({
    model: SUMMARY_MODEL,
    system:
      'You title coding sessions. Reply with a 3 to 8 word title for what the user is working on, ' +
      'sentence case, no quotes, no trailing punctuation.',
    prompt: `The user's recent requests, oldest first:\n${transcript}`,
    maxTokens: 40,
    timeoutMs: 15000,
  })
  if (!reply.isAnswered) return
  const text = reply.text.trim().split('\n')[0]?.replace(/^["']|["'.]$/g, '').slice(0, 80)
  if (!text) return
  await update($, summary, now => (now?.isManual ? now : { text, isManual: false }))
}

async function pollAgents($: EngineInterface) {
  const now = await $.clock.now()
  const list = await $.agent.list()
  const rows: AgentRow[] = list.map(agent => {
    if (!firstSeen.has(agent.id)) firstSeen.set(agent.id, now)
    return {
      id: agent.id,
      type: agent.name ?? agent.type,
      description: agent.description,
      status: agent.status,
      firstSeen: firstSeen.get(agent.id) ?? now,
    }
  })
  const before = await read($, agents)
  // While any agent runs, every poll redraws, so the elapsed times in the band and shelf tick.
  const isLive = rows.some(row => row.status === 'running' || row.status === 'pending')
  if (isLive || JSON.stringify(before) !== JSON.stringify(rows)) await update($, agents, () => rows)
  // The first subagent of a session offers the shelf once; a narrow terminal seats it later.
  if (!isShelfOffered && rows.some(row => row.status === 'running')) {
    isShelfOffered = true
    void $.ui.open({ id: SHELF, title: 'shelf', columns: SHELF_COLUMNS })
  }
}

async function refreshBreakdown($: EngineInterface) {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const found = usage.context.breakdown
  if (!found) return
  const slices = found.categories
    .filter(row => row.kind === 'used' && row.tokens > 0)
    .map((row, i) => ({ name: row.name, tokens: row.tokens, color: paletteColor(i) }))
  await update($, breakdown, () => ({
    slices,
    maxTokens: found.maxTokens,
    autoCompactAt: found.autoCompactThreshold ?? null,
    isAutoCompactEnabled: found.isAutoCompactEnabled,
  }))
}

function warn($: EngineInterface, usage: SessionUsage, autoCompactAt: number | null) {
  const percent = usage.context.percent ?? 0
  if (percent >= WARN_PERCENT && !warned.has('context')) {
    warned.add('context')
    const at = autoCompactAt ? ` Claude Code auto-compacts at ${autoCompactAt}%.` : ''
    $.ui.toast(`Context is at ${Math.round(percent)}%.${at}`)
  }
  for (const limit of usage.rateLimits) {
    if (limit.percentUsed >= WARN_PERCENT && !warned.has(limit.kind)) {
      warned.add(limit.kind)
      $.ui.toast(`${limitName(limit)} limit at ${Math.round(limit.percentUsed)}%${resets(limit)}`)
    }
  }
}

function limitName(limit: SessionRateLimit): string {
  return limit.kind.replace('five_hour', '5h').replace('seven_day', '7d').replace(/_/g, ' ')
}

/**
 * One keep-alive read: a tool-less fork over the session's transcript, so the API serves the
 * prefix from cache and renews its timer. Costs a cache read of the conversation plus a few
 * output tokens; a probe that reads nothing means the entry had already lapsed, so stop.
 */
async function probe($: EngineInterface) {
  const at = await $.clock.now()
  const reply = await $.model.fork({ prompt: 'Reply with only the word ok.' })
  if (reply.isAnswered && reply.usage.cache_read_input_tokens > 0) {
    await update($, warmUntil, () => at + CACHE_TTL_MS)
    await update($, keepAlive, now => (now ? { ...now, probes: now.probes + 1 } : now))
    return
  }
  await update($, keepAlive, () => null)
  const why = !reply.isAnswered ? reply.reason : 'the entry had already lapsed'
  $.ui.toast(`Keep-alive stopped: ${why}.`)
}

async function toggleKeepAlive($: EngineInterface, minutes: number) {
  const now = await $.clock.now()
  const next = await update($, keepAlive, alive => (alive ? null : { until: now + minutes * 60_000, probes: 0 }))
  return next
}

function wallClock(ms: number): string {
  const at = new Date(ms)
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

/** `warm 3:40` while the last request's cache entry lives, `cold` once it has expired. */
function cacheClock(until: number | null, now: number): { text: string; isWarm: boolean } | null {
  if (until === null) return null
  const left = until - now
  return left > 0 ? { text: `warm ${formatClock(left)}`, isWarm: true } : { text: 'cold', isWarm: false }
}

function compactPercent(split: Breakdown | null): number | null {
  if (!split?.autoCompactAt || split.maxTokens <= 0) return null
  return Math.round((split.autoCompactAt / split.maxTokens) * 100)
}

function resets(limit: SessionRateLimit): string {
  if (!limit.resetsAt) return ''
  const at = new Date(limit.resetsAt)
  if (Number.isNaN(at.getTime())) return ''
  const hh = String(at.getHours()).padStart(2, '0')
  const mm = String(at.getMinutes()).padStart(2, '0')
  const isToday = at.toDateString() === new Date().toDateString()

  return `, resets ${isToday ? '' : `${at.getMonth() + 1}/${at.getDate()} `}${hh}:${mm}`
}

async function cycleModel($: EngineInterface, step: number) {
  const next = cycle(MODELS, aliasOf(await read($, model)), step)
  await $.command.run({ command: 'model', args: next })
  await update($, model, () => next)
}

async function cycleEffort($: EngineInterface) {
  let level = await read($, effort)
  // A model that lacks a level refuses it; step past it to the next one it takes.
  for (let tries = 0; tries < EFFORTS.length; tries++) {
    level = cycle(EFFORTS, level)
    const ran = await $.command.run({ command: 'effort', args: level })
    if (/set effort/i.test(ran.text ?? '')) {
      const chosen = level
      await update($, effort, () => chosen)
      return
    }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'summary',
      description: 'Show, set, or clear the shellfish session summary',
      argumentHint: '[text|clear]',
    })
    await $.command.register({ name: 'shelf', description: 'Open or close the shellfish shelf: agents, context, cost, limits and cache' })
    await $.command.register({
      name: 'keepalive',
      description: 'Keep the prompt cache warm while idle, for N minutes (default 180); "off" stops it',
      argumentHint: '[minutes|off]',
    })
    // After a reload, the last turn's end is the best guess at when its cache entry lapses.
    const lastTurn = (await read($, receipts)).at(-1)
    if (lastTurn) await update($, warmUntil, now => now ?? lastTurn.at + CACHE_TTL_MS)
    const dir = await $.env.get('HOME')
    await update($, home, () => dir ?? null)
    const settings = (await $.settings.read()) as { effortLevel?: unknown }
    if (typeof settings.effortLevel === 'string') {
      const level = settings.effortLevel
      await update($, effort, now => now ?? level)
    }
    const name = await $.session.model()
    await update($, model, now => now ?? name)
    await refreshBranch($)
    void refreshBreakdown($)
    $.clock.every(2000, () => void pollAgents($))
    $.clock.every(10_000, async () => {
      const until = await read($, warmUntil)
      const now = await $.clock.now()
      // One more tick after expiry flips the label to cold; then the timer rests.
      if (until !== null && now < until + 15_000) await update($, clockTick, n => n + 1)
      const alive = await read($, keepAlive)
      if (!alive) return
      if (now >= alive.until) {
        await update($, keepAlive, () => null)
        $.ui.toast(`Keep-alive ended after ${alive.probes} probe${alive.probes === 1 ? '' : 's'}.`)
        return
      }
      if (until === null || turn !== null || now < until - KEEP_ALIVE_LEAD_MS || now >= until) return
      await probe($)
    })

    return next(e)
  })

  on('command.run', { command: 'summary' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'clear') {
      await update($, summary, () => null)
      $.clock.after(0, () => void summarize($))

      return { text: 'Summary cleared; an automatic one follows.' }
    }
    if (arg) {
      await update($, summary, () => ({ text: arg.slice(0, 120), isManual: true }))

      return { text: `Summary set: ${arg}` }
    }
    const now = await read($, summary)

    return { text: now ? `Summary${now.isManual ? '' : ' (auto)'}: ${now.text}` : 'No summary yet.' }
  })

  on('command.run', { command: 'keepalive' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off') {
      await update($, keepAlive, () => null)
      return { text: 'Keep-alive off.' }
    }
    const minutes = arg ? Number(arg) : KEEP_ALIVE_DEFAULT_MIN
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > KEEP_ALIVE_MAX_MIN) {
      return { text: `Usage: /keepalive [minutes 1-${KEEP_ALIVE_MAX_MIN}|off]` }
    }
    const now = await $.clock.now()
    await update($, keepAlive, () => ({ until: now + minutes * 60_000, probes: 0 }))
    return {
      text: `Keeping the prompt cache warm for ${minutes} min: a small read of the conversation runs before each hour-long entry lapses. Your own turns renew it for free; /keepalive off stops it.`,
    }
  })

  on('command.run', { command: 'shelf' }, async $ => ({ text: (await toggleShelf($)) ? 'Shelf opened.' : 'Shelf closed.' }))

  // A close by the person flips the band's shelf button back.
  on('ui.close', { id: SHELF }, async ($, e, next) => {
    const done = await next(e)
    await update($, tick, n => n + 1)

    return done
  }).catch(($, e, next) => next(e))

  // Compaction shrinks the conversation; the bar's categories must follow, not wait for the next turn.
  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    if (!('skip' in done)) {
      await refreshBreakdown($)
      await update($, tick, n => n + 1)
    }

    return done
  }).catch(($, e, next) => next(e))

  // Each prompt's time, so its row in the transcript can open with a dated rule.
  on('prompt.submit', async ($, e, next) => {
    const text = e.text
    if (!e.isMeta && text.trim()) {
      const at = await $.clock.now()
      await update($, prompts, list => [...list, { text, at }].slice(-PROMPT_MARKS))
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // A rule above each prompt the person typed, so a new exchange reads as a new section.
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'composer' } } }, async ($, e, next) => {
    const row = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    const mark = [...(await read($, prompts))].reverse().find(p => p.text === e.props.text)
    const label = mark ? ` ${wallClock(mark.at)} ` : ''

    // Longer than any terminal; the one-row Box clips it, so the rule ends at the transcript's edge.
    return (
      <Box flexDirection="column">
        <Box height={1} overflow="hidden">
          <Text>
            <Text color="inactive">{'──'}</Text>
            <Text dimColor>{label}</Text>
            <Text color="inactive">{'─'.repeat(400)}</Text>
          </Text>
        </Box>
        {row}
      </Box>
    )
  })

  // Permission mode: Claude Code's own footer labels are live; the classic envelope is the fallback.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const found = modeFromLabels(e.props.modes)
    if (found !== null && found !== (await read($, mode))) await update($, mode, () => found)

    return next(e)
  })

  // Permission mode rides on the classic hook envelope.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    await update($, mode, () => e.permission_mode ?? null)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PostToolUse', async ($, e, next) => {
    await update($, mode, () => e.permission_mode ?? null)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const usage = await $.session.usage()
      turn = { startedAt: await $.clock.now(), costAtStart: usage.cost?.usd ?? 0, streamMs: 0 }
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const isMain = e.agentId === undefined
    if (isMain) {
      const stepAt = await $.clock.now()
      await update($, warmUntil, () => stepAt + CACHE_TTL_MS)
      modelsSeen.add(e.model)
      await update($, model, () => e.model)
      if (e.effort !== undefined) {
        const level = String(e.effort)
        await update($, effort, () => level)
      }
    }
    const stream = next(e)
    let firstAt = 0
    let lastShownAt = 0
    let chars = 0
    for (;;) {
      const step = await stream.next()
      if (step.done) {
        const result = step.value
        const usage = result.usage
        if (isMain && usage) {
          const ms = firstAt ? (await $.clock.now()) - firstAt : 0
          if (turn) turn.streamMs += ms
          const rate = ms > 250 ? usage.output_tokens / (ms / 1000) : null
          await update($, speed, now => ({ rate: rate ?? now.rate, isLive: false }))
          await update($, totals, now => ({
            input: now.input + usage.input_tokens,
            output: now.output + usage.output_tokens,
            cacheRead: now.cacheRead + (usage.cache_read_input_tokens ?? 0),
            cacheWrite: now.cacheWrite + (usage.cache_creation_input_tokens ?? 0),
          }))
        }
        await update($, tick, n => n + 1)

        return result
      }
      const chunk = step.value
      if (isMain && (chunk.kind === 'text' || chunk.kind === 'thinking' || chunk.kind === 'input')) {
        const at = await $.clock.now()
        if (!firstAt) firstAt = at
        chars += chunk.kind === 'input' ? chunk.json.length : chunk.text.length
        if (at - lastShownAt > 1000 && at - firstAt > 500) {
          lastShownAt = at
          // About four characters per token until the response reports its usage.
          const estimate = chars / 4 / ((at - firstAt) / 1000)
          await update($, speed, () => ({ rate: estimate, isLive: true }))
        }
      }
      yield chunk
    }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done
    const now = await $.clock.now()
    const usage = await $.session.usage()
    const started = turn
    turn = null
    const tokens = e.usage
    const previous = (await read($, receipts)).at(-1)
    const turnTokens = {
      input: tokens?.input_tokens ?? 0,
      cacheRead: tokens?.cache_read_input_tokens ?? 0,
      cacheWrite: tokens?.cache_creation_input_tokens ?? 0,
    }
    const partial = {
      model: tokens?.model ?? (await read($, model)) ?? 'unknown',
      effort: await read($, effort),
      gapMs: previous && started ? Math.max(0, started.startedAt - previous.at) : null,
      cacheHit: cacheHit(turnTokens),
    }
    const receipt: Receipt = {
      at: now,
      durationMs: started ? now - started.startedAt : 0,
      ...partial,
      ...turnTokens,
      output: tokens?.output_tokens ?? 0,
      cold: coldCause(partial, previous),
      costUsd: Math.max(0, (usage.cost?.usd ?? 0) - (started?.costAtStart ?? 0)),
      contextPercent: usage.context.percent ?? null,
      rate: started && started.streamMs > 250 && tokens ? tokens.output_tokens / (started.streamMs / 1000) : null,
    }
    if (receipt.output > 0 || receipt.input > 0) {
      await update($, receipts, list => [...list, receipt].slice(-100))
    }
    void refreshBranch($)
    const refreshed = refreshBreakdown($).then(async () => warn($, usage, compactPercent(await read($, breakdown))))

    // The log writes after the turn so a slow disk never holds the prompt.
    $.clock.after(0, async () => {
      const session = await $.session.id()
      const dir = await $.session.cwd()
      await refreshed
      const split = await read($, breakdown)
      const context = split ? Object.fromEntries(split.slices.map(s => [s.name, s.tokens])) : null
      await appendTurn($, { ...turnRow(session, dir, receipt, usage.cost?.usd ?? 0), contextTokens: context })
      await writeSession($, {
        session,
        cwd: dir,
        startedAt: new Date(usage.startedAt).toISOString(),
        updatedAt: new Date(now).toISOString(),
        turns: (await read($, receipts)).length,
        models: [...modelsSeen],
        totals: await read($, totals),
        costUsd: Number((usage.cost?.usd ?? 0).toFixed(6)),
        rateLimits: usage.rateLimits,
      })
    })

    const turns = await $.session.turns()
    const said = await read($, summary)
    if (!said?.isManual && (said === null || turns % SUMMARY_EVERY === 0)) {
      $.clock.after(0, () => void summarize($))
    }

    return done
  })

  // The turn's closing line becomes its receipt: time, output, speed, cost, context.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    let receipt = lineReceipts.get(e.requestId)
    if (!receipt) {
      const list = await read($, receipts)
      receipt = [...list]
        .reverse()
        .find(one => !claimed.has(one.at) && Math.abs(one.durationMs - e.props.durationMs) < 2000)
      if (!receipt) return next(e)
      claimed.add(receipt.at)
      lineReceipts.set(e.requestId, receipt)
    }
    const { Text } = $.ui.resolve(e)
    const parts = [
      `${e.props.word} for ${formatDuration(e.props.durationMs)}`,
      `${formatCount(receipt.output)} out`,
      receipt.rate === null ? null : `${Math.round(receipt.rate)} t/s`,
      formatMoney(receipt.costUsd),
      receipt.contextPercent === null ? null : `ctx ${Math.round(receipt.contextPercent)}%`,
    ].filter(Boolean)

    return <Text dimColor>{parts.join(' · ')}</Text>
  })

  // Live generation speed beside the spinner while a response streams.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const now = await read($, speed)
    if (!now.isLive || now.rate === null) return next(e)

    return next({ ...e, props: { ...e.props, suffix: `${e.props.suffix} ${Math.round(now.rate)} t/s` } })
  })


  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, tick)
    const now = await $.clock.now()
    const usage = await $.session.usage()
    const width = Math.max(40, e.props.bodyColumns)
    const sums = await read($, totals)
    const history = await read($, receipts)
    const last = history.at(-1)
    const split = await read($, breakdown)
    const shelf = await read($, agents)
    const live = shelf.filter(isLiveAgent)
    const running = live.length
    const shownAgents = live.slice(0, BAND_AGENT_ROWS)
    const moreAgents = running - shownAgents.length
    const openShelf = () => void $.ui.open({ id: SHELF, title: 'shelf', columns: SHELF_COLUMNS })
    const shelfUp = await isShelfUp($)
    const shelfMark = shelfUp ? '◂' : '▸'

    // Row 1: where, on which branch, what the session is about, then model, effort and permissions.
    const permission = formatMode(await read($, mode))
    const modelText = formatModel(await read($, model))
    const effortText = (await read($, effort)) ?? '—'
    const rightWidth = modelText.length + effortText.length + permission.text.length + 10
    const gitName = (await read($, branch)) ?? '…'
    const leftRoom = Math.max(8, width - rightWidth - 2)
    const gitText = shortenMiddle(gitName, Math.max(6, Math.floor(leftRoom * 0.4)))
    const where = fitCwd(splitCwd((await read($, cwd)) ?? '', (await read($, home)) ?? undefined), leftRoom - gitText.length - 4)
    const gitColor = gitName === 'detached' ? 'warning' : gitName === 'no repo' ? 'inactive' : 'remember'

    // The rule over the band: the session's title set into it, the line lit while a turn runs.
    const said = await read($, summary)
    const titleText = said && width >= 30 ? ` ${shortenMiddle(said.text, width - 8)} ` : ''
    const ruleColor = e.props.isWorking ? 'claude' : 'inactive'

    // Row 2: context, rate limits, cost and cache as labelled figures; narrow widths drop from the right.
    const percent = usage.context.percent
    const barWidth = width >= 100 ? 20 : width >= 70 ? 14 : 10
    const limits = width >= 70 ? usage.rateLimits : []
    const costs = width >= 90 ? history.slice(-12).map(r => r.costUsd) : []
    await read($, clockTick)
    const clock = width >= 100 ? cacheClock(await read($, warmUntil), now) : null
    const alive = await read($, keepAlive)
    const hit = cacheHit(sums)
    const compactAt = compactPercent(split)
    const contextKey = keyEntries(split, compactAt)
    const tips = {
      context: `context ${percent === undefined ? '?' : Math.round(percent)}% of ${formatCount(usage.context.window)}`,
      limits: usage.rateLimits.map(limit => `${limitName(limit)} window ${Math.round(limit.percentUsed)}% used${resets(limit)}`).join(' · '),
      cost:
        `est. API cost ${formatMoney(usage.cost?.usd)} this session` +
        (last ? ` · last turn ${formatMoney(last.costUsd)}` : '') +
        (costs.length > 1 ? ` · chart: cost per turn, last ${costs.length} turns` : '') +
        ` · in ${formatCount(sums.input)} out ${formatCount(sums.output)} · ${hit === null ? '—' : `${hit}%`} reused from cache`,
    }
    const tip = (scope: keyof typeof tips) => (
      <Box key={`tip-${scope}`} position="absolute" top={2} left={0} width={width} display="none" hover={{ scope, display: 'flex' }}>
        <Text color="suggestion">{pad(tips[scope], width)}</Text>
      </Box>
    )
    const divider = <Text dimColor>{'  │  '}</Text>

    return (
      <Box key="band" flexDirection="column" width={width}>
        <Text>
          <Text color={ruleColor}>{'──'}</Text>
          {titleText ? <Text italic>{titleText}</Text> : null}
          <Text color={ruleColor}>{'─'.repeat(Math.max(0, width - 2 - titleText.length))}</Text>
        </Text>
        <Box flexDirection="row" justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text dimColor>{where.prefix}</Text>
            <Text color="suggestion" bold>{where.leaf}</Text>
            <Text dimColor>{' on '}</Text>
            <Text color={gitColor}>{gitText}</Text>
          </Text>
          <Box flexDirection="row">
            <Button key="model-previous" plain action={ACTION_MODEL_PREVIOUS} onPress={() => cycleModel($, -1)}>
              <Text dimColor>‹ </Text>
            </Button>
            <Button key="model-next" plain action={ACTION_MODEL_NEXT} onPress={() => cycleModel($, 1)}>
              {modelText}
            </Button>
            <Button key="model-after" plain onPress={() => cycleModel($, 1)}>
              <Text dimColor> ›</Text>
            </Button>
            <Text dimColor>{' · '}</Text>
            <Button key="effort" plain action={ACTION_EFFORT} onPress={() => cycleEffort($)}>
              {effortText}
            </Button>
            <Text dimColor>{' · '}</Text>
            <Text color={permission.color}>{permission.text}</Text>
          </Box>
        </Box>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row">
            <Box key="context" hover={{ scope: 'context' }}>
              <Button key="context-open" plain onPress={openShelf}>
                <Text dimColor>{'ctx '}</Text>
                {runs(contextCells(split, percent, barWidth)).map(run => (
                  <Text color={run.color}>{run.text}</Text>
                ))}
                {percent === undefined ? (
                  <Text color="inactive"> —</Text>
                ) : (
                  <Text color={percentColor(percent)}>{` ${Math.round(percent)}%`}</Text>
                )}
              </Button>
            </Box>
            {limits.length ? (
              <Box key="limits" hover={{ scope: 'limits' }}>
                {divider}
                <Button key="limits-open" plain onPress={openShelf}>
                  {limits.map((limit, i) => (
                    <Text>
                      <Text dimColor>{`${i ? '  ' : ''}${limitName(limit)} `}</Text>
                      <Text color={percentColor(limit.percentUsed)}>{`${Math.round(limit.percentUsed)}%`}</Text>
                    </Text>
                  ))}
                </Button>
              </Box>
            ) : null}
            <Box key="cost" hover={{ scope: 'cost' }}>
              {divider}
              <Button key="cost-open" plain onPress={openShelf}>
                <Text dimColor>{'cost '}</Text>
                {costs.length > 1 ? <Text color="claude">{`${sparkline(costs)} `}</Text> : null}
                {formatMoney(usage.cost?.usd)}
              </Button>
            </Box>
            {clock ? (
              <Box key="cache" hover={{ scope: 'cost' }}>
                {divider}
                <Button key="cache-open" plain onPress={openShelf}>
                  <Text dimColor>{'cache '}</Text>
                  <Text color={clock.isWarm ? undefined : 'warning'}>{`${clock.text}${alive ? ' ↻' : ''}`}</Text>
                </Button>
              </Box>
            ) : null}
          </Box>
          <Button key="shelf" plain onPress={() => toggleShelf($).then(() => undefined)}>
            {running > 0 ? (
              <Text color="claude">{`● ${running} agent${running === 1 ? '' : 's'} ${shelfMark}`}</Text>
            ) : (
              <Text dimColor>{`shelf ${shelfMark}`}</Text>
            )}
          </Button>
        </Box>
        {shownAgents.map(row => (
          <Button key={`band-agent-${row.id}`} plain onPress={() => $.ui.view({ agentId: row.id })}>
            <Text color="claude">{`  ${agentGlyph(row.status)} `}</Text>
            <Text>{shortenMiddle(row.type, 16)}</Text>
            <Text dimColor>{`  ${shortenMiddle(row.description, Math.max(8, width - 34))}  ${formatDuration(now - row.firstSeen)}`}</Text>
          </Button>
        ))}
        {moreAgents > 0 ? (
          <Button key="band-agents-more" plain onPress={openShelf}>
            <Text dimColor>{`    +${moreAgents} more in the shelf ▸`}</Text>
          </Button>
        ) : null}
        {contextKey.length ? (
          <Box key="tip-context" position="absolute" top={2} left={0} width={width} display="none" hover={{ scope: 'context', display: 'flex' }}>
            <Text wrap="truncate-end">
              {contextKey.map((entry, i) => (
                <Text>
                  <Text color={entry.color}>{`${i ? '   ' : ''}${entry.mark} `}</Text>
                  <Text>{`${entry.name} ${entry.percent}`}</Text>
                </Text>
              ))}
              <Text>{' '.repeat(width)}</Text>
            </Text>
          </Box>
        ) : (
          tip('context')
        )}
        {usage.rateLimits.length ? tip('limits') : null}
        {tip('cost')}
      </Box>
    )
  })

  // The shelf: the session's title, its subagents, and where context, cost, cache and limits stand.
  on('ui.render', { component: 'Pane', requestId: SHELF }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, tick)
    const now = await $.clock.now()
    const usage = await $.session.usage()
    const said = await read($, summary)
    const shelf = await read($, agents)
    const history = await read($, receipts)
    const sums = await read($, totals)
    const split = await read($, breakdown)
    const modelName = await read($, model)
    const effortText = (await read($, effort)) ?? '—'
    const viewing = e.props.view.agentId
    const columns = Math.max(24, e.props.bodyColumns)
    const percent = usage.context.percent
    const compactAt = compactPercent(split)
    const running = shelf.filter(isLiveAgent).length

    // The readout under the title: the last turn, or the turn whose chart column is hovered.
    const sessionCost = `${formatMoney(usage.cost?.usd)} session`
    const turnLine = (r: Receipt) =>
      `${formatModel(r.model)} · ${r.effort ?? '—'} · ${formatDuration(r.durationMs)} · ${formatCount(r.output)} out · ${formatMoney(r.costUsd)} · ${sessionCost}`
    const last = history.at(-1)
    const readout = last ? turnLine(last) : `${formatModel(modelName)} · ${effortText} · ${sessionCost}`

    // Context: the bar, the compaction point under it, then one key row per category.
    const used = split?.slices.reduce((a, s) => a + s.tokens, 0) ?? 0
    const legend = keyEntries(split, compactAt, false)
    legend.sort((a, b) => (a.name === 'free' ? 1 : b.name === 'free' ? -1 : (b.rawTokens ?? 0) - (a.rawTokens ?? 0)))
    const windowText = split ? `${formatCount(used)}/${formatCount(split.maxTokens)}` : formatCount(usage.context.window)
    const barWidth = Math.max(8, columns - windowText.length - 1)

    // Turn charts: one column per turn, the newest at the right; hovering a column fills the readout.
    const chartWidth = Math.max(4, columns - 5)
    const shown = history.slice(-chartWidth)
    const maxCost = Math.max(0, ...shown.map(r => r.costUsd))
    const chart = (label: string, values: number[], max: number, colorFor: (i: number) => string) => (
      <Box flexDirection="row">
        <Text dimColor>{`${label.padEnd(4)} `}</Text>
        {values.map((value, i) => {
          const bar = column(value, max)
          return (
            <Box key={`${label}-${i}`} flexDirection="column" hover={{ scope: `turn-${i}` }}>
              <Text color={colorFor(i)}>{bar.top}</Text>
              <Text color={colorFor(i)}>{bar.bottom}</Text>
            </Box>
          )
        })}
      </Box>
    )

    // Cache: what this session's input cost relative to uncached, and why turns went cold.
    const rates = cacheRates(aliasOf(modelName))
    const hit = cacheHit(sums)
    const effective = effectiveInputRate(sums, rates)
    const inputAll = sums.input + sums.cacheRead + sums.cacheWrite
    const share = (n: number) => (inputAll > 0 ? `${Math.round((n / inputAll) * 100)}%` : '—')
    const inputSegments = segments(
      [
        { name: 'read', tokens: sums.cacheRead, color: 'success' },
        { name: 'written', tokens: sums.cacheWrite, color: 'warning' },
        { name: 'uncached', tokens: sums.input, color: 'error' },
      ],
      inputAll,
      Math.max(8, columns - 2),
    )
    const cold = shown.filter(r => r.cold !== null)
    const coldCounts = ['idle', 'model', 'effort', 'prefix'].map(cause => [cause, cold.filter(r => r.cold === cause).length] as const).filter(([, n]) => n > 0)
    const coldNames: Record<string, string> = { idle: 'pause', model: 'model switch', effort: 'effort change', prefix: 'prompt changed' }
    const readPercent = `${Math.round(rates.read * 100)}%`
    await read($, clockTick)
    const clock = cacheClock(await read($, warmUntil), now)
    const alive = await read($, keepAlive)
    const contextTokens = usage.context.tokens ?? 0
    const prices = requestCost(contextTokens, aliasOf(modelName))
    const warmLeft = Math.max(0, ((await read($, warmUntil)) ?? now) - now)
    const warmth = {
      left: warmLeft,
      filled: Math.round((warmLeft / CACHE_TTL_MS) * 10),
      color: percentColor(100 - (warmLeft / CACHE_TTL_MS) * 100),
    }
    const help: { head?: string; body: string[] }[] = [
      { body: ['Each turn resends the whole conversation.'] },
      { head: 'Reused', body: [`Text matching the last request, read at ${readPercent}.`] },
      { head: 'Written', body: ['New text, stored for the next turn at 125%.'] },
      { head: 'Lifetime', body: ['About an hour from the last request; each turn renews it.'] },
      { head: 'Rewrite', body: ['A long pause, a model or effort switch,', 'or an edited prompt file (CLAUDE.md, MCP servers).'] },
      { head: 'Chart', body: ['Tokens written per turn; yellow = a rewrite.'] },
      { head: 'Keep warm', body: ['Re-reads the entry before it lapses.'] },
    ]
    const helpWidth = Math.max(1, columns - 4)

    // A section's heading: its name, a rule across, and its headline figure at the right.
    type Aside = { text: string; color?: string; dim?: boolean }
    const heading = (title: string, aside: Aside[] = []) => {
      const asideLength = aside.reduce((n, part) => n + part.text.length, 0)
      const fill = Math.max(2, columns - title.length - asideLength - (asideLength ? 2 : 1))
      return (
        <Text wrap="truncate-end">
          <Text bold>{`${title} `}</Text>
          <Text color="inactive">{'─'.repeat(fill)}</Text>
          {asideLength ? <Text>{' '}</Text> : null}
          {aside.map(part => (
            <Text color={part.color} dimColor={part.dim}>{part.text}</Text>
          ))}
        </Text>
      )
    }
    const agentsAside: Aside[] = running
      ? [{ text: `● ${running} running`, color: 'claude' }]
      : [{ text: shelf.length ? `${shelf.length} finished` : 'none yet', dim: true }]

    return (
      <Box flexDirection="column">
        <Text bold color="claude" wrap="truncate-end">{said?.text ?? 'shellfish'}</Text>
        <Box key="turn-readout" position="relative" height={1}>
          <Text dimColor wrap="truncate-end">{readout}</Text>
          {shown.map((r, i) => (
            <Box key={`turn-tip-${i}`} position="absolute" top={0} left={0} width={columns} display="none" hover={{ scope: `turn-${i}`, display: 'flex' }}>
              <Text color="suggestion">{pad(turnLine(r), columns)}</Text>
            </Box>
          ))}
        </Box>

        <Box flexDirection="column" marginTop={1}>
          {heading('Agents', agentsAside)}
          {viewing ? (
            <Button key="main" plain onPress={() => $.ui.view({})}>
              <Text color="suggestion">← main conversation</Text>
            </Button>
          ) : null}
          {shelf.length ? (
            [...shelf].reverse().slice(0, 10).map(row => (
              <Button key={`agent-${row.id}`} plain onPress={() => $.ui.view({ agentId: row.id })}>
                <Text color={agentColor(row.status)}>{`${agentGlyph(row.status)} `}</Text>
                <Text bold={row.id === viewing}>{shortenMiddle(row.type, 14).padEnd(14)}</Text>
                <Text dimColor>{` ${shortenMiddle(row.description, Math.max(8, columns - 24))} `}</Text>
                <Text dimColor>{formatDuration(now - row.firstSeen)}</Text>
              </Button>
            ))
          ) : (
            <Text dimColor>Subagents list here as they spawn; press one to read its transcript.</Text>
          )}
        </Box>

        <Box flexDirection="column" marginTop={1}>
          {heading('Context', [percent === undefined ? { text: '—', color: 'inactive' } : { text: `${Math.round(percent)}%`, color: percentColor(percent) }])}
          <Box flexDirection="row">
            {runs(contextCells(split, percent, barWidth)).map(run => (
              <Text color={run.color}>{run.text}</Text>
            ))}
            <Text dimColor>{` ${windowText}`}</Text>
          </Box>
          {compactAt && split ? (
            <Text dimColor wrap="truncate-end">{underTick(split, barWidth, split.isAutoCompactEnabled === false ? 'auto-compact off' : `compacts at ${compactAt}%`)}</Text>
          ) : null}
          {legend.length ? (
            <Box flexDirection="column" marginTop={1}>
              {legend.map(entry => (
                <Box flexDirection="row" width={Math.min(columns, 44)}>
                  <Box flexGrow={1}>
                    <Text wrap="truncate-end">
                      <Text color={entry.color}>{`${entry.mark} `}</Text>
                      <Text>{entry.name}</Text>
                    </Text>
                  </Box>
                  <Text>{entry.percent.padStart(5)}</Text>
                  <Text dimColor>{(entry.tokens ?? '').padStart(7)}</Text>
                </Box>
              ))}
            </Box>
          ) : (
            <Text dimColor>Breakdown after the first turn.</Text>
          )}
        </Box>

        <Box flexDirection="column" marginTop={1}>
          {heading('Turns', history.length ? [{ text: `${history.length} so far`, dim: true }] : [])}
          {shown.length ? (
            <Box flexDirection="column">
              {chart('cost', shown.map(r => r.costUsd), maxCost, () => 'claude')}
              {chart('ctx', shown.map(r => r.contextPercent ?? 0), 100, () => 'suggestion')}
            </Box>
          ) : (
            <Text dimColor>No turns yet.</Text>
          )}
        </Box>

        {usage.rateLimits.length ? (
          <Box flexDirection="column" marginTop={1}>
            {heading('Limits')}
            {usage.rateLimits.map((limit, i) => {
              const filled = Math.round((Math.min(100, limit.percentUsed) / 100) * 10)
              return (
                <Box marginTop={i ? 1 : 0}>
                  <Text>
                    <Text dimColor>{`${limitName(limit).padEnd(4)} `}</Text>
                    <Text color={percentColor(limit.percentUsed)}>{'█'.repeat(filled)}</Text>
                    <Text color="inactive">{'░'.repeat(10 - filled)}</Text>
                    <Text>{` ${Math.round(limit.percentUsed)}%`}</Text>
                    <Text dimColor>{resets(limit)}</Text>
                  </Text>
                </Box>
              )
            })}
          </Box>
        ) : null}

        <Box key="cache" flexDirection="column" marginTop={1}>
          <Box key="cache-head" flexDirection="row" hover={{ scope: 'cache-help' }}>
            {heading('Cache', [
              hit === null ? { text: '—', color: 'inactive' } : { text: `${hit}% reused`, color: percentColor(100 - hit) },
              { text: ' ?', dim: true },
            ])}
          </Box>
          {clock ? (
            <Box flexDirection="row">
              <Text>
                <Text color={warmth.color}>{'█'.repeat(warmth.filled)}</Text>
                <Text color="inactive">{'░'.repeat(10 - warmth.filled)}</Text>
                {alive ? (
                  <Text color="success">{` ↻ keeping warm until ${wallClock(alive.until)} · ${alive.probes} renewal${alive.probes === 1 ? '' : 's'} · next in ${formatClock(Math.max(0, (await read($, warmUntil)) ?? 0) - now - KEEP_ALIVE_LEAD_MS)}`}</Text>
                ) : clock.isWarm ? (
                  <Text color={warmth.color}>{` warm ${formatClock(warmth.left)} left`}</Text>
                ) : (
                  <Text color="warning">{' cold'}</Text>
                )}
              </Text>
            </Box>
          ) : null}
          {clock === null ? (
            <Text dimColor>No request yet this session.</Text>
          ) : clock.isWarm ? (
            <Text dimColor wrap="truncate-end">{`Next turn reads ${formatCount(contextTokens)} from cache (~${formatMoney(prices.warm)}); cold it would cost ~${formatMoney(prices.cold)}.`}</Text>
          ) : (
            <Text color="warning" wrap="truncate-end">{`Next turn rewrites ${formatCount(contextTokens)} (~${formatMoney(prices.cold)}) unless kept warm.`}</Text>
          )}
          {clock ? (
            <Box marginTop={1}>
              <Button
                key="keep-alive"
                variant={alive ? 'secondary' : 'primary'}
                label={alive ? '■ Stop keeping warm' : `▶ Keep warm for ${KEEP_ALIVE_DEFAULT_MIN} min`}
                onPress={() => toggleKeepAlive($, KEEP_ALIVE_DEFAULT_MIN)}
              />
            </Box>
          ) : null}
          {inputAll > 0 ? (
            <Box flexDirection="column" marginTop={1}>
              <Box flexDirection="row">
                {inputSegments.map(seg => (
                  <Text color={seg.color}>{'█'.repeat(seg.cells)}</Text>
                ))}
              </Box>
              <Text wrap="truncate-end">
                <Text color="success">■ </Text>
                <Text>{`reused ${share(sums.cacheRead)}`}</Text>
                <Text color="warning">{'   ■ '}</Text>
                <Text>{`written ${share(sums.cacheWrite)}`}</Text>
                <Text color="error">{'   ■ '}</Text>
                <Text>{`uncached ${share(sums.input)}`}</Text>
                {effective !== null && effective < 1 ? <Text dimColor>{`   cost ${Math.round(effective * 100)}% of uncached`}</Text> : null}
              </Text>
              {shown.length ? (
                <Box marginTop={1} flexDirection="column">
                  {chart('wrote', shown.map(r => r.cacheWrite), Math.max(0, ...shown.map(r => r.cacheWrite)), i => (shown[i]?.cold ? 'warning' : 'text'))}
                  <Text wrap="truncate-end">
                    <Text dimColor>{'rewrites '}</Text>
                    <Text color={cold.length ? 'warning' : undefined}>{String(cold.length)}</Text>
                    {coldCounts.length ? <Text dimColor>{`  ${coldCounts.map(([cause, n]) => `${coldNames[cause]} ×${n}`).join(' · ')}`}</Text> : null}
                  </Text>
                </Box>
              ) : null}
            </Box>
          ) : null}
          <Box
            key="cache-help-card"
            position="absolute"
            top={1}
            left={0}
            width={columns}
            flexDirection="column"
            display="none"
            hover={{ scope: 'cache-help', display: 'flex' }}
            borderStyle="round"
            borderColor="suggestion"
            paddingX={1}
          >
            {help.flatMap((item, i) => [
              ...(i ? [<Text>{pad('', helpWidth)}</Text>] : []),
              ...(item.head ? [<Text bold>{pad(item.head, helpWidth)}</Text>] : []),
              ...item.body.map(line => <Text wrap="truncate-end">{pad(item.head ? `  ${line}` : line, helpWidth)}</Text>),
            ])}
          </Box>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text color="inactive">{'┄'.repeat(columns)}</Text>
          <Text dimColor wrap="truncate-end">log ~/.claude/shellfish/usage.jsonl</Text>
          <Box marginTop={1}>
            <Text wrap="truncate-end">
              <Text>{'🐚 '}</Text>
              <Text bold color="claude">shellfish</Text>
              <Text>{' 🐟'}</Text>
              <Text dimColor>{'  a Claude mod by JD Santos'}</Text>
            </Text>
          </Box>
        </Box>
      </Box>
    )
  })
}
type Cell = { char: string; color: string }

/**
 * The context bar's cells: each category in its /context colour, then free space,
 * with the auto-compact threshold as a tick. Before the first breakdown, a plain meter.
 */
function contextCells(split: Breakdown | null, percent: number | undefined, width: number): Cell[] {
  const cells: Cell[] = []
  if (split && split.maxTokens > 0 && agrees(split, percent)) {
    for (const seg of segments(split.slices, split.maxTokens, width)) {
      for (let i = 0; i < seg.cells; i++) cells.push({ char: '█', color: seg.color })
    }
  } else if (percent !== undefined) {
    const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width)
    for (let i = 0; i < filled; i++) cells.push({ char: '█', color: percentColor(percent) })
  }
  while (cells.length < width) cells.push({ char: '░', color: 'inactive' })
  const tick = split?.autoCompactAt && split.maxTokens > 0 ? Math.round((split.autoCompactAt / split.maxTokens) * width) : -1
  if (tick >= 0 && tick < width && cells[tick]?.char === '░') cells[tick] = { char: '┃', color: 'subtle' }
  return cells.slice(0, width)
}

/**
 * Whether a breakdown still describes the live percent. After a compaction the percent drops at
 * once while the categories wait for a refresh; until it lands, the plain meter tells the truth.
 */
function agrees(split: Breakdown, percent: number | undefined): boolean {
  if (percent === undefined) return true
  const used = split.slices.reduce((a, s) => a + s.tokens, 0)
  return Math.abs((used / split.maxTokens) * 100 - percent) <= STALE_SPLIT_POINTS
}

/** A label whose last character sits under the bar's compaction tick, like a callout. */
function underTick(split: Breakdown, barWidth: number, label: string): string {
  const tick = split.autoCompactAt && split.maxTokens > 0 ? Math.round((split.autoCompactAt / split.maxTokens) * barWidth) : barWidth
  return ' '.repeat(Math.max(0, Math.min(tick, barWidth - 1) - label.length + 1)) + label
}

/** Joins neighbouring cells of one colour, so a bar is a few Text runs, not one per cell. */
function runs(cells: Cell[]): { text: string; color: string }[] {
  const out: { text: string; color: string }[] = []
  for (const cell of cells) {
    const tail = out.at(-1)
    if (tail && tail.color === cell.color) tail.text += cell.char
    else out.push({ text: cell.char, color: cell.color })
  }
  return out
}

type KeyEntry = { mark: string; color: string; name: string; percent: string; tokens: string | null; rawTokens: number | null }

/**
 * The context bar's key: each category with its share of the window, then free space,
 * then the compaction tick. Small swatches, so stacked rows never read as one bar.
 */
function keyEntries(split: Breakdown | null, compactAt: number | null, withCompaction = true): KeyEntry[] {
  if (!split || split.maxTokens <= 0) return []
  const share = (tokens: number) => `${Math.round((tokens / split.maxTokens) * 100)}%`
  const used = split.slices.reduce((a, s) => a + s.tokens, 0)
  const free = Math.max(0, split.maxTokens - used)
  return [
    ...split.slices.map(s => ({ mark: '■', color: s.color, name: s.name.toLowerCase(), percent: share(s.tokens), tokens: formatCount(s.tokens), rawTokens: s.tokens })),
    { mark: '□', color: 'inactive', name: 'free', percent: share(free), tokens: formatCount(free), rawTokens: free },
    ...(compactAt && withCompaction ? [{ mark: '┃', color: 'subtle', name: 'compacts at', percent: `${compactAt}%`, tokens: null, rawTokens: null }] : []),
  ]
}
