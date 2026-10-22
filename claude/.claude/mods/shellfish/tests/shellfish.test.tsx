import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On, ProcessRunResult, SessionUsage } from 'claude-code'

import { aliasOf, cacheHit, cacheRates, coldCause, column, effectiveInputRate, contextMeter, cycle, EFFORTS, fitCwd, formatModel, formatMoney, gauge, modeFromLabels, MODELS, pad, segments, sparkline, splitCwd } from '../hooks/format'

const BAND = {
  plugin: 'shellfish',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10, contentRows: 0 },
    view: {},
  },
} as const

type World = { commands: string[]; appended: string[]; forks: number; cost: { usd: number }; clock: MockClock; agents: object[]; panes: object[]; opens: number; closes: number }

function engine(on: On, percent: number): World {
  mock.store(on)
  const world: World = { commands: [], appended: [], forks: 0, cost: { usd: 1.2345 }, clock: mock.clock(on, { now: 1_000_000 }), agents: [], panes: [], opens: 0, closes: 0 }
  mock.env(on, { HOME: '/Users/me' })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('classic.UserPromptSubmit', () => ({}))
  on('classic.PostToolUse', () => ({}))
  on('settings.read', () => ({ value: {} }))
  on('session.cwd', () => ({ value: '/Users/me/Dotfiles/pi' }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.turns', () => ({ value: 1 }))
  on('session.messages', () => ({ value: [] }))
  on('agent.list', () => ({ value: world.agents as never }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', ($, e) => {
    world.opens += 1
    world.panes = [{ id: e.id, title: e.title ?? e.id, isShown: true, isFocused: false, isPlaced: true }]
    return { value: { isPlaced: true } as never }
  })
  on('ui.close', () => {
    world.closes += 1
    world.panes = []
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: world.panes as never }))
  on('model.fork', () => {
    world.forks += 1
    return { value: { isAnswered: true, text: 'ok', usage: { input_tokens: 0, output_tokens: 1, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 } } as never }
  })
  on('process.run', ($, e) => {
    if (e.argv[0] === 'sh') world.appended.push(e.init?.stdin ?? '')
    return { value: { exitCode: 0, stdout: 'fix/footer\n', stderr: '', isStdoutTruncated: false } as ProcessRunResult }
  })
  on('session.usage', ($, e) => ({
    value: {
      startedAt: 0,
      context: {
        tokens: percent * 2000,
        window: 200_000,
        percent,
        ...(e?.breakdown
          ? {
              breakdown: {
                categories: [
                  { name: 'Messages', tokens: 60_000, color: 'claude', isDeferred: false, kind: 'used' },
                  { name: 'System tools', tokens: 20_000, color: 'inactive', isDeferred: false, kind: 'used' },
                  { name: 'Free space', tokens: 120_000, color: 'promptBorder', isDeferred: false, kind: 'free' },
                ],
                maxTokens: 200_000,
                autoCompactThreshold: 166_000,
                isAutoCompactEnabled: true,
              },
            }
          : {}),
      },
      rateLimits: [{ kind: 'five_hour', percentUsed: 12 }],
      cost: world.cost,
    } as SessionUsage,
  }))
  on('command.run', ($, e) => {
    world.commands.push(`/${e.command} ${e.args ?? ''}`.trim())
    return { text: e.command === 'effort' ? `Set effort level to ${e.args} (this session only)` : `Set model to ${e.args}` }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'a'.repeat(400), ref: 1 } as never
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'done',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { model: e.model, input_tokens: 100, output_tokens: 300, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
    } as never
  })
  return world
}

async function start($: Engine) {
  await $.session.start({ cwd: '/Users/me/Dotfiles/pi', surface: 'terminal', isInteractive: true })
}

async function runTurn($: Engine, world: World) {
  await $.turn.start({ turnId: 't1', text: 'hi' } as never)
  world.cost.usd += 0.25
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', effort: 'high', messageCount: 1 })) {
    // drain
  }
  return $.turn.complete({
    turnId: 't1',
    reason: 'answer',
    answer: 'done',
    usage: { model: 'claude-sonnet-5-5', input_tokens: 100, output_tokens: 300, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
  } as never)
}

test('the band shows workspace, model, effort, mode, context and cost', async ($, on) => {
  engine(on, 62)
  await start($)
  await $.classic.UserPromptSubmit({ prompt: 'hi', permission_mode: 'plan' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as never)
    const all = JSON.stringify(await ui.drawn())
    for (const text of ['~/Dotfiles/', 'fix/footer', 'sonnet 5.5', 'plan', '$1.234', '62%', '"warning"', 'shelf']) {
      expect(all).toContain(text)
    }
    await ui.unmount()
  }
})

test('pressing the model and effort labels cycles them for the session', async ($, on) => {
  const world = engine(on, 10)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  await ui.press({ key: 'model-next' })
  await ui.press({ key: 'model-next' })
  await ui.press({ key: 'model-previous' })
  await ui.press({ key: 'effort' })
  expect(world.commands).toEqual(['/model haiku', '/model fable', '/model haiku', '/effort low'])
  const all = JSON.stringify(await ui.drawn())
  expect(all).toContain('haiku')
  expect(all).toContain('low')
  await ui.unmount()
})

test('the context bar takes /context colours and marks the compaction point', async ($, on) => {
  engine(on, 40)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  const all = JSON.stringify(await ui.drawn())
  expect(all).toContain('"claude"')
  expect(all).toContain('┃')
  expect(all).toContain('5h ')
  expect(all).toContain('12%')
  expect(all).toContain('"ctx "')
  expect(all).toContain('"cost "')
  expect(all).not.toContain('▁')
  expect(all).toContain('messages 30%')
  await ui.unmount()
})

test('the shelf titles itself with the summary and keys the context bar', async ($, on) => {
  engine(on, 40)
  await start($)
  await $.command.run({ command: 'summary', args: 'Port the Pi footer' } as never)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  expect(JSON.stringify(await band.drawn())).toContain('Port the Pi footer')
  await band.unmount()
  const pane = await $.ui.mount({
    plugin: 'shellfish',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'shellfish',
    props: { title: 'shelf', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40, contentRows: 0 }, view: {} },
  } as never)
  const all = JSON.stringify(await pane.drawn())
  for (const text of ['Port the Pi footer', 'messages', '30%', '60k', '■', 'compacts at 83%', 'Cache', 'sonnet 5.5 · —', 'compacts at', '83%', '80k/200k', 'Limits']) {
    expect(all).toContain(text)
  }
  await pane.unmount()
})

test('a turn leaves a receipt on its closing line and a row in the log', async ($, on) => {
  const world = engine(on, 30)
  await start($)
  await runTurn($, world)
  await world.clock.settle()

  const row = world.appended.map(line => JSON.parse(line)).find(one => one.type === 'turn')
  expect(row?.tokens.output).toBe(300)
  expect(row?.costUsd).toBe(0.25)
  expect(row?.session).toBe('session-1')
  expect(row?.contextTokens?.Messages).toBe(60000)
  expect(row?.cacheHit).toBe(90)
  expect(row?.cold).toBe(null)

  const pane = await $.ui.mount({
    plugin: 'shellfish',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'shellfish',
    props: { title: 'shelf', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40, contentRows: 0 }, view: {} },
  } as never)
  const shelf = JSON.stringify(await pane.drawn())
  expect(shelf).toContain('90% reused')
  expect(shelf).toContain('reused 90%')
  expect(shelf).toContain('warm 60:00')
  expect(shelf).toContain('Next turn reads')
  expect(shelf).toContain('"rewrites "')
  expect(shelf.indexOf('Limits')).toBeLessThan(shelf.indexOf('Cache '))
  expect(shelf.indexOf('"messages"')).toBeLessThan(shelf.indexOf('"free"'))
  expect(shelf).toContain('300 out · $0.250 · $1.484 session')
  await pane.unmount()

  const line = await $.ui.mount({
    plugin: 'shellfish',
    surface: 'terminal',
    component: 'TurnDuration',
    props: { word: 'Baked', durationMs: 0 },
  } as never)
  const text = JSON.stringify(await line.drawn())
  expect(text).toContain('300 out')
  expect(text).toContain('$0.250')
  await line.unmount()
})

test('/keepalive probes the cache before the entry lapses and renews the timer', async ($, on) => {
  const world = engine(on, 30)
  await start($)
  await runTurn($, world)
  await world.clock.settle()
  const ran = await $.command.run({ command: 'keepalive', args: '180' } as never)
  expect(JSON.stringify(ran)).toContain('180 min')

  // Fifty-seven minutes in: still warm, no probe yet.
  await world.clock.advance(57 * 60_000)
  expect(world.forks).toBe(0)
  // Past the two-minute lead: one probe, and the hour starts over.
  await world.clock.advance(2 * 60_000)
  expect(world.forks).toBe(1)

  const pane = await $.ui.mount({
    plugin: 'shellfish',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'shellfish',
    props: { title: 'shelf', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40, contentRows: 0 }, view: {} },
  } as never)
  const shelf = JSON.stringify(await pane.drawn())
  expect(shelf).toContain('keeping warm')
  expect(shelf).toContain('1 renewal')
  expect(shelf).toContain('next in 57:')
  expect(shelf).toContain('Press to stop keeping warm')
  await pane.unmount()

  await $.command.run({ command: 'keepalive', args: 'off' } as never)
  await world.clock.advance(120 * 60_000)
  expect(world.forks).toBe(1)
})

test('a running subagent gets a row in the band and heads the shelf', async ($, on) => {
  const world = engine(on, 10)
  await start($)
  world.agents = [{ id: 'a1', type: 'general-purpose', name: 'Explore', description: 'Find the footer code', status: 'running' }]
  await world.clock.advance(2_000)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  const drawn = JSON.stringify(await band.drawn())
  expect(drawn).toContain('Explore')
  expect(drawn).toContain('Find the footer code')
  // The first subagent opens the shelf by itself, so the button already points back at it.
  expect(drawn).toContain('1 agent ◂')
  await band.unmount()
  const pane = await $.ui.mount({
    plugin: 'shellfish',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'shellfish',
    props: { title: 'shelf', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40, contentRows: 0 }, view: {} },
  } as never)
  const shelf = JSON.stringify(await pane.drawn())
  expect(shelf).toContain('1 running')
  expect(shelf.indexOf('Agents ')).toBeLessThan(shelf.indexOf('Context '))
  await pane.unmount()
})

test('the shelf button opens the shelf, then closes it', async ($, on) => {
  const world = engine(on, 10)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('shelf ▸')
  await ui.press({ key: 'shelf' })
  expect(world.opens).toBe(1)
  expect(JSON.stringify(await ui.drawn())).toContain('shelf ◂')
  await ui.press({ key: 'shelf' })
  expect(world.closes).toBe(1)
  expect(JSON.stringify(await ui.drawn())).toContain('shelf ▸')
  await ui.unmount()
  expect(JSON.stringify(await $.command.run({ command: 'shelf', args: '' } as never))).toContain('Shelf opened')
})

test('the context bar follows the live percent when the breakdown is stale', async ($, on) => {
  // The breakdown says 40% used; the live percent says 5%, as right after a compaction.
  engine(on, 5)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  const all = JSON.stringify(await ui.drawn())
  expect(all).toContain(' 5%')
  expect(all).not.toContain('"color":"claude"},"children":["█')
  await ui.unmount()
})

test('helpers', () => {
  expect(formatModel('claude-opus-5-5')).toBe('opus 5.5')
  expect(formatModel('claude-sonnet-5-5[1m]')).toBe('sonnet 5.5 1m')
  expect(formatMoney(0.004)).toBe('$0.0040')
  expect(splitCwd('/Users/me/Dotfiles/pi', '/Users/me')).toEqual({ prefix: '~/Dotfiles/', leaf: 'pi' })
  expect(fitCwd({ prefix: '~/a/very/long/path/', leaf: 'pi' }, 6)).toEqual({ prefix: '…/', leaf: 'pi' })
  expect(contextMeter(85, 20)?.color).toBe('error')
  expect(contextMeter(undefined, 20)).toBe(null)
  expect(cycle(MODELS, 'opus')).toBe('sonnet')
  expect(cycle(MODELS, 'sonnet', -1)).toBe('opus')
  expect(cycle(EFFORTS, null)).toBe('low')
  expect(aliasOf('claude-haiku-5-5')).toBe('haiku')
  expect(cacheHit({ input: 100, cacheRead: 900, cacheWrite: 0 })).toBe(90)
  expect(sparkline([0, 5, 10])).toBe('▁▄█')
  expect(pad('abc', 5)).toBe('abc  ')
  expect(pad('abcdef', 4)).toBe('abc…')
  expect(column(16, 16)).toEqual({ top: '█', bottom: '█' })
  expect(column(4, 16)).toEqual({ top: ' ', bottom: '▄' })
  expect(column(0, 16)).toEqual({ top: ' ', bottom: ' ' })
  expect(gauge(100)).toBe('█')
  expect(modeFromLabels([])).toBe('default')
  expect(modeFromLabels(['⏵⏵ accept edits on'])).toBe('acceptEdits')
  expect(modeFromLabels(['⏸ plan mode on'])).toBe('plan')
  expect(modeFromLabels(['auto mode on'])).toBe('auto')
  expect(cacheRates('opus').read).toBe(0.05)
  expect(effectiveInputRate({ input: 0, cacheRead: 100, cacheWrite: 0 }, cacheRates('sonnet'))).toBe(0.1)
  expect(effectiveInputRate({ input: 0, cacheRead: 0, cacheWrite: 0 }, cacheRates(null))).toBe(null)
  const prev = { model: 'claude-sonnet-5-5', effort: 'high' }
  expect(coldCause({ cacheHit: 90, gapMs: 1000, ...prev }, prev)).toBe(null)
  expect(coldCause({ cacheHit: 10, gapMs: 1000, ...prev }, undefined)).toBe(null)
  expect(coldCause({ cacheHit: 10, gapMs: 61 * 60_000, ...prev }, prev)).toBe('idle')
  expect(coldCause({ cacheHit: 10, gapMs: 1000, model: 'claude-opus-5-5', effort: 'high' }, prev)).toBe('model')
  expect(coldCause({ cacheHit: 10, gapMs: 1000, model: prev.model, effort: 'low' }, prev)).toBe('effort')
  expect(coldCause({ cacheHit: 10, gapMs: 1000, ...prev }, prev)).toBe('prefix')
  const split = segments([{ name: 'a', tokens: 50, color: 'x' }, { name: 'b', tokens: 1, color: 'y' }], 100, 10)
  expect(split.map(s => s.cells)).toEqual([5, 1])
})
