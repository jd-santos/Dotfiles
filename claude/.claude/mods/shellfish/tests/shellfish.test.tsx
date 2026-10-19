import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On, ProcessRunResult, SessionUsage } from 'claude-code'

import { aliasOf, cacheHit, contextMeter, cycle, EFFORTS, fitCwd, formatModel, formatMoney, MODELS, pad, sparkline, splitCwd } from '../hooks/format'

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

type World = { commands: string[]; appended: string[]; cost: { usd: number }; clock: MockClock }

function engine(on: On, percent: number): World {
  mock.store(on)
  const world: World = { commands: [], appended: [], cost: { usd: 1.2345 }, clock: mock.clock(on, { now: 1_000_000 }) }
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
  on('agent.list', () => ({ value: [] }))
  on('fs.write', () => ({ value: undefined }))
  on('process.run', ($, e) => {
    if (e.argv[0] === 'sh') world.appended.push(e.init?.stdin ?? '')
    return { value: { exitCode: 0, stdout: 'fix/footer\n', stderr: '', isStdoutTruncated: false } as ProcessRunResult }
  })
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: percent * 2000, window: 200_000, percent },
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

test('clicking a field pins its card under the band', async ($, on) => {
  engine(on, 10)
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  await ui.press({ key: 'cost-pin' })
  expect(JSON.stringify(await ui.drawn())).toContain('5h 12%')
  await ui.press({ key: 'cost-pin' })
  await ui.unmount()
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
})
