import type { EngineInterface, SessionRateLimit } from 'claude-code'

import type { Receipt, Totals } from '../types'

// ~/.claude/shellfish/usage.jsonl gets one row per main-loop turn, appended.
// ~/.claude/shellfish/sessions/<session id>.json is that session's running total, rewritten.
// Costs are Claude Code's own figures at API list prices, so they are an estimate of
// what the session would cost on the API, not what a subscription bills.

export type SessionRecord = {
  session: string
  cwd: string
  startedAt: string
  updatedAt: string
  turns: number
  models: string[]
  totals: Totals
  costUsd: number
  rateLimits: readonly SessionRateLimit[]
}

export function turnRow(session: string, cwd: string, receipt: Receipt, sessionCostUsd: number) {
  return {
    type: 'turn',
    at: new Date(receipt.at).toISOString(),
    session,
    cwd,
    model: receipt.model,
    effort: receipt.effort,
    durationMs: receipt.durationMs,
    tokens: {
      input: receipt.input,
      output: receipt.output,
      cacheRead: receipt.cacheRead,
      cacheWrite: receipt.cacheWrite,
    },
    costUsd: Number(receipt.costUsd.toFixed(6)),
    sessionCostUsd: Number(sessionCostUsd.toFixed(6)),
    contextPercent: receipt.contextPercent,
    cacheHit: receipt.cacheHit,
    gapMs: receipt.gapMs,
    cold: receipt.cold,
  }
}

async function logDir($: EngineInterface): Promise<string | null> {
  const home = await $.env.get('HOME')

  return home ? `${home}/.claude/shellfish` : null
}

export async function appendTurn($: EngineInterface, row: object): Promise<void> {
  const dir = await logDir($)
  if (!dir) return
  // $.fs has no append; sh does it, with the row on stdin so nothing is quoted into the command.
  await $.process.run(
    ['sh', '-c', 'mkdir -p "$1/sessions" && cat >> "$1/usage.jsonl"', 'shellfish', dir],
    { stdin: `${JSON.stringify(row)}\n`, timeoutMs: 5000 },
  )
}

export async function writeSession($: EngineInterface, record: SessionRecord): Promise<void> {
  const dir = await logDir($)
  if (!dir) return
  await $.process.run(['mkdir', '-p', `${dir}/sessions`], { timeoutMs: 5000 })
  await $.fs.write(`${dir}/sessions/${record.session}.json`, `${JSON.stringify(record, null, 2)}\n`)
}
