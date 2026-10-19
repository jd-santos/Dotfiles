import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, SessionUsage } from 'claude-code'

import type { AgentRow, Breakdown, Card, Receipt, Speed, Summary, Totals } from '../types'
import {
  EFFORTS,
  MODELS,
  aliasOf,
  cacheHit,
  contextMeter,
  cycle,
  fitCwd,
  formatCount,
  formatDuration,
  formatMode,
  formatModel,
  formatMoney,
  pad,
  shortenMiddle,
  sparkline,
  splitCwd,
} from './format'
import { appendTurn, turnRow, writeSession } from './log'

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
const card = atom({ plugin: 'shellfish', key: 'card' } as const, null as Card)
// Bumped after each model request so the band re-reads $.session.usage().
const tick = atom({ plugin: 'shellfish', key: 'tick' } as const, 0)

const SHELF = 'shellfish'
const SUMMARY_MODEL = 'haiku'
const SUMMARY_EVERY = 5
const WARN_PERCENT = 80
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

async function refreshBranch($: EngineInterface) {
  const dir = await $.session.cwd()
  await update($, cwd, () => dir)
  const run = await $.process.run(['git', 'branch', '--show-current'], { cwd: dir, timeoutMs: 2000 })
  let name: string | null = 'no repo'
  if (run.exitCode === 0) name = run.stdout.trim() || 'detached'
  await update($, branch, () => name)
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
  if (JSON.stringify(before) !== JSON.stringify(rows)) await update($, agents, () => rows)
  // The first subagent of a session offers the shelf once; a narrow terminal seats it later.
  if (!isShelfOffered && rows.some(row => row.status === 'running')) {
    isShelfOffered = true
    void $.ui.open({ id: SHELF, title: 'shelf' })
  }
}

async function refreshBreakdown($: EngineInterface) {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const found = usage.context.breakdown
  if (!found) return
  const slices = found.categories
    .filter(row => row.kind === 'used' && row.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .map(row => ({ name: row.name, tokens: row.tokens, color: row.color }))
  await update($, breakdown, () => ({
    slices,
    autoCompactAt: found.autoCompactThreshold ?? null,
    isAutoCompactEnabled: found.isAutoCompactEnabled,
  }))
}

function warn($: EngineInterface, usage: SessionUsage, autoCompactAt: number | null) {
  const percent = usage.context.percent ?? 0
  if (percent >= WARN_PERCENT && !warned.has('context')) {
    warned.add('context')
    const at = autoCompactAt ? ` Claude Code auto-compacts near ${formatCount(autoCompactAt)} tokens.` : ''
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
    await $.command.register({ name: 'shelf', description: 'Open the shellfish shelf: subagents and turn history' })
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
    $.clock.every(2000, () => void pollAgents($))

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

  on('command.run', { command: 'shelf' }, async $ => {
    await $.ui.open({ id: SHELF, title: 'shelf' })

    return { text: 'Shelf opened.' }
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
    const receipt: Receipt = {
      at: now,
      durationMs: started ? now - started.startedAt : 0,
      model: tokens?.model ?? (await read($, model)) ?? 'unknown',
      effort: await read($, effort),
      input: tokens?.input_tokens ?? 0,
      output: tokens?.output_tokens ?? 0,
      cacheRead: tokens?.cache_read_input_tokens ?? 0,
      cacheWrite: tokens?.cache_creation_input_tokens ?? 0,
      costUsd: Math.max(0, (usage.cost?.usd ?? 0) - (started?.costAtStart ?? 0)),
      contextPercent: usage.context.percent ?? null,
      rate: started && started.streamMs > 250 && tokens ? tokens.output_tokens / (started.streamMs / 1000) : null,
    }
    if (receipt.output > 0 || receipt.input > 0) {
      await update($, receipts, list => [...list, receipt].slice(-100))
    }
    void refreshBranch($)
    void refreshBreakdown($).then(async () => warn($, usage, (await read($, breakdown))?.autoCompactAt ?? null))

    // The log writes after the turn so a slow disk never holds the prompt.
    $.clock.after(0, async () => {
      const session = await $.session.id()
      const dir = await $.session.cwd()
      await appendTurn($, turnRow(session, dir, receipt, usage.cost?.usd ?? 0))
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
    const usage = await $.session.usage()
    const width = Math.max(30, e.props.bodyColumns)
    const pinned = await read($, card)
    const sums = await read($, totals)
    const history = await read($, receipts)
    const last = history.at(-1)
    const split = await read($, breakdown)
    const shelf = await read($, agents)
    const running = shelf.filter(row => row.status === 'running' || row.status === 'pending').length

    // Row 1: where, on which branch, with what model, effort and permissions.
    const permission = formatMode(await read($, mode))
    const modelText = formatModel(await read($, model))
    const effortText = (await read($, effort)) ?? '—'
    const rightWidth = modelText.length + effortText.length + permission.text.length + 12
    const gitName = (await read($, branch)) ?? '…'
    const leftRoom = Math.max(8, width - rightWidth - 2)
    const gitText = shortenMiddle(gitName, Math.max(6, Math.floor(leftRoom * 0.5)))
    const where = fitCwd(splitCwd((await read($, cwd)) ?? '', (await read($, home)) ?? undefined), leftRoom - gitText.length - 6)
    const gitColor = gitName === 'detached' ? 'warning' : gitName === 'no repo' ? 'inactive' : 'remember'

    // Row 2: context, tokens, speed, cost.
    const meter = contextMeter(usage.context.percent, Math.max(0, Math.min(16, width - 60)))
    const window = usage.context.window ? `/${formatCount(usage.context.window)}` : ''
    const rate = await read($, speed)
    const rateText = rate.rate === null ? '—' : `${rate.isLive ? '~' : ''}${Math.round(rate.rate)}`
    const hit = cacheHit(sums)
    const said = await read($, summary)

    // Cards: three lines each, the band's own height, so a hover paints over the band alone.
    const cardWidth = Math.min(width, 76)
    const compactAt = split?.autoCompactAt
    const cards: Record<Exclude<Card, null>, string[]> = {
      context: [
        `context ${usage.context.percent ?? '?'}% of ${formatCount(usage.context.window)}` +
          (split?.isAutoCompactEnabled === false ? ' · auto-compact off' : compactAt ? ` · auto-compacts at ${formatCount(compactAt)}` : ''),
        split?.slices.length
          ? split.slices.slice(0, 4).map(s => `${s.name.toLowerCase()} ${formatCount(s.tokens)}`).join(' · ')
          : 'breakdown after the first turn',
        `per turn ${sparkline(history.slice(-40).map(r => r.contextPercent ?? 0)) || '—'}`,
      ],
      tokens: [
        `in ${formatCount(sums.input)} · out ${formatCount(sums.output)} · cache read ${formatCount(sums.cacheRead)} · write ${formatCount(sums.cacheWrite)}`,
        `cache hit ${hit === null ? '—' : `${hit}%`}` +
          (last ? ` · last turn in ${formatCount(last.input + last.cacheRead + last.cacheWrite)} out ${formatCount(last.output)}` : ''),
        `out per turn ${sparkline(history.slice(-40).map(r => r.output)) || '—'}`,
      ],
      cost: [
        `est. API cost ${formatMoney(usage.cost?.usd)}` + (last ? ` · last turn ${formatMoney(last.costUsd)}` : ''),
        usage.rateLimits.length
          ? usage.rateLimits.map(limit => `${limitName(limit)} ${Math.round(limit.percentUsed)}%${resets(limit)}`).join(' · ')
          : 'no rate-limit reading yet',
        `per turn ${sparkline(history.slice(-40).map(r => r.costUsd)) || '—'} · log ~/.claude/shellfish`,
      ],
    }
    const toggle = (which: Exclude<Card, null>) => () => update($, card, now => (now === which ? null : which))
    const hover = (which: Exclude<Card, null>) => (
      <Box
        key={`card-${which}`}
        position="absolute"
        top={0}
        left={0}
        width={cardWidth}
        flexDirection="column"
        display="none"
        hover={{ scope: which, display: 'flex' }}
      >
        {cards[which].map(line => (
          <Text inverse>{pad(` ${line}`, cardWidth)}</Text>
        ))}
      </Box>
    )

    return (
      <Box key="band" flexDirection="column" width={width}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text dimColor>{where.prefix}</Text>
            <Text color="suggestion" bold>{where.leaf}</Text>
            <Text dimColor>{'  git '}</Text>
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
            <Text dimColor>{'  '}</Text>
            <Text color={permission.color}>{permission.text}</Text>
          </Box>
        </Box>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row">
            <Box key="context" hover={{ scope: 'context' }}>
              <Button key="context-pin" plain onPress={toggle('context')}>
                <Text dimColor>ctx </Text>
                {meter ? (
                  <Text>
                    <Text color={meter.color}>{'█'.repeat(meter.bar)}</Text>
                    <Text color="promptBorder">{'░'.repeat(meter.empty)}</Text>
                    <Text color={meter.color}>{` ${meter.percent}%`}</Text>
                  </Text>
                ) : (
                  <Text color="inactive">—</Text>
                )}
                <Text dimColor>{window}</Text>
              </Button>
            </Box>
            <Text>{'   '}</Text>
            <Box key="tokens" hover={{ scope: 'tokens' }}>
              <Button key="tokens-pin" plain onPress={toggle('tokens')}>
                <Text dimColor>out </Text>
                {formatCount(sums.output)}
                <Text dimColor> cache </Text>
                {hit === null ? '—' : `${hit}%`}
              </Button>
            </Box>
            <Text dimColor>{'   t/s '}</Text>
            <Text dimColor={!rate.isLive}>{rateText}</Text>
          </Box>
          <Box key="cost" hover={{ scope: 'cost' }}>
            <Button key="cost-pin" plain onPress={toggle('cost')}>
              <Text dimColor>est </Text>
              {formatMoney(usage.cost?.usd)}
            </Button>
          </Box>
        </Box>
        <Box flexDirection="row" justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text dimColor>{'» '}</Text>
            {said ? <Text bold>{said.text}</Text> : <Text dimColor>summary after the first turn</Text>}
          </Text>
          <Button key="shelf" plain onPress={() => void $.ui.open({ id: SHELF, title: 'shelf' })}>
            {running > 0 ? <Text color="claude">{`agents ${running}/${shelf.length} `}</Text> : null}
            <Text dimColor>shelf ▸</Text>
          </Button>
        </Box>
        {pinned ? (
          <Box flexDirection="column">
            {cards[pinned].map(line => (
              <Text dimColor wrap="truncate-end">{`  ${line}`}</Text>
            ))}
          </Box>
        ) : null}
        {hover('context')}
        {hover('tokens')}
        {hover('cost')}
      </Box>
    )
  })

  // The shelf: subagents to switch into, and the session's turn history.
  on('ui.render', { component: 'Pane', requestId: SHELF }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const now = await $.clock.now()
    const shelf = await read($, agents)
    const history = await read($, receipts)
    const viewing = e.props.view.agentId
    const columns = Math.max(20, e.props.bodyColumns)
    const glyph: Record<string, string> = { running: '●', pending: '○', waiting: '◐', idle: '◌', completed: '✓', failed: '✗', killed: '✗' }
    const color = (status: string) =>
      status === 'running' || status === 'pending' ? 'claude' : status === 'failed' || status === 'killed' ? 'error' : 'inactive'

    return (
      <Box flexDirection="column">
        <Text bold>Agents</Text>
        {viewing ? (
          <Button key="main" plain onPress={() => $.ui.view({})}>
            <Text color="suggestion">← back to main conversation</Text>
          </Button>
        ) : null}
        {shelf.length === 0 ? <Text dimColor>No subagents yet this session.</Text> : null}
        {[...shelf].reverse().slice(0, 12).map(row => (
          <Button key={`agent-${row.id}`} plain onPress={() => $.ui.view({ agentId: row.id })}>
            <Text color={color(row.status)}>{`${glyph[row.status] ?? '·'} `}</Text>
            <Text bold={row.id === viewing}>{shortenMiddle(row.type, 18)}</Text>
            <Text dimColor>{` ${shortenMiddle(row.description, Math.max(8, columns - 32))} · ${formatDuration(now - row.firstSeen)}`}</Text>
          </Button>
        ))}
        <Text> </Text>
        <Text bold>Turns</Text>
        {history.length === 0 ? (
          <Text dimColor>No turns yet.</Text>
        ) : (
          <Box flexDirection="column">
            <Text>
              <Text dimColor>cost </Text>
              {sparkline(history.slice(-(columns - 8)).map(r => r.costUsd))}
            </Text>
            <Text>
              <Text dimColor>ctx  </Text>
              {sparkline(history.slice(-(columns - 8)).map(r => r.contextPercent ?? 0))}
            </Text>
            {[...history].reverse().slice(0, 8).map(r => (
              <Text dimColor wrap="truncate-end">
                {`${formatModel(r.model)} · ${formatDuration(r.durationMs)} · ${formatCount(r.output)} out · ${formatMoney(r.costUsd)}`}
              </Text>
            ))}
          </Box>
        )}
        <Text> </Text>
        <Text dimColor>log ~/.claude/shellfish/usage.jsonl</Text>
      </Box>
    )
  })
}
